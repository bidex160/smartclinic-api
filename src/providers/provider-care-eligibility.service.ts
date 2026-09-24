import { ConflictException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, In, Repository } from "typeorm";
import { ProviderCareService } from "./entities/provider-care-service.entity";
import { Provider } from "./entities/provider.entity";
import { ProviderLocation } from "./entities/provider-location.entity";
import { CareServiceDefinition } from "./entities/care-service-definition.entity";
import { ProviderOnboardingStatus } from "./enums/provider-onboarding-status.enum";
import { ProviderStatus } from "./enums/provider-status.enum";
import { CareDeliveryMode } from "./enums/care-delivery-mode.enum";
import { ProviderCareServiceDeliveryOption } from "./entities/provider-care-service-delivery-option.entity";
import { CareRequest } from "../care-requests/entities/care-request.entity";
import { CareRequestStatus } from "../care-requests/enums/care-request-status.enum";
import { ProviderPracticeAffiliation, ProviderPracticeAffiliationStatus } from "./entities/provider-practice-affiliation.entity";

export type EligibleProviderCareService = ProviderCareService & {
  selectedDeliveryOption: ProviderCareServiceDeliveryOption;
  institutionalPriceMinor?: string | null;
  institutionalCurrency?: string | null;
};

export type ProviderCareEligibilityInput = {
  careServiceDefinitionId: string;
  countryCode: string | null;
  stateOrRegion: string | null;
  city: string | null;
  providerReference?: string;
  providerId?: string;
  deliveryMode: CareDeliveryMode;
  hostProviderId?: string | null;
};

const ACTIVE_CARE_REQUEST_WORKLOAD_STATUSES = [
  CareRequestStatus.PROVIDER_SELECTED,
  CareRequestStatus.AWAITING_PROVIDER_RESPONSE,
  CareRequestStatus.PROVIDER_ACCEPTED,
  CareRequestStatus.SCHEDULED,
  CareRequestStatus.IN_PROGRESS,
];

@Injectable()
export class ProviderCareEligibilityService {
  constructor(
    @InjectRepository(ProviderCareService)
    private readonly services: Repository<ProviderCareService>,
  ) {}

/**
 * Validate one specific provider/service combination.
 *
 * Used for:
 *
 * - patient-selected preferred providers
 * - final validation of an automatically matched provider
 */
async requireEligible(
  input: ProviderCareEligibilityInput,
  manager: EntityManager = this.services.manager,
): Promise<EligibleProviderCareService> {
  const repository = manager.getRepository(ProviderCareService);

  const builder = repository
    .createQueryBuilder("service")
    .innerJoin("service.provider", "provider")
    .where(
      "service.careServiceDefinitionId = :definitionId",
      {
        definitionId: input.careServiceDefinitionId,
      },
    );

  if (input.providerReference) {
    builder.andWhere(
      "provider.providerReference = :providerReference",
      {
        providerReference: input.providerReference,
      },
    );
  }

  if (input.providerId) {
    builder.andWhere(
      "provider.id = :providerId",
      {
        providerId: input.providerId,
      },
    );
  }

  const candidate = await builder.getOne();

  if (!candidate) {
    return this.ineligible();
  }

  /**
   * Lock the care-service row because this provider is about
   * to become the assigned provider for the request.
   */
  const service = await repository.findOne({
    where: {
      id: candidate.id,
    },
    lock: {
      mode: "pessimistic_write",
    },
  });

  if (!service) {
    return this.ineligible();
  }

  /**
   * The provider must explicitly support the requested delivery
   * mode for THIS care service.
   *
   * For example:
   *
   * GENERAL_CONSULTATION
   *   VIRTUAL
   *
   * is different from:
   *
   * GENERAL_CONSULTATION
   *   PROVIDER_LOCATION
   */
  const selectedDeliveryOption = await manager
    .getRepository(ProviderCareServiceDeliveryOption)
    .findOne({
      where: {
        providerCareServiceId: service.id,
        deliveryMode: input.deliveryMode,
      },
      lock: {
        mode: "pessimistic_read",
      },
    });

  if (
    !service.isActive ||
    !service.supportsAppointmentRequests ||
    !selectedDeliveryOption
  ) {
    return this.ineligible();
  }

  const [provider, definition] = await Promise.all([
    manager
      .getRepository(Provider)
      .findOne({
        where: {
          id: service.providerId,
        },
        withDeleted: true,
        lock: {
          mode: "pessimistic_read",
        },
      }),

    manager
      .getRepository(CareServiceDefinition)
      .findOne({
        where: {
          id: service.careServiceDefinitionId,
        },
        lock: {
          mode: "pessimistic_read",
        },
      }),
  ]);

  if (
    !provider ||
    provider.deletedAt ||
    provider.status !== ProviderStatus.ACTIVE ||
    provider.onboardingStatus !==
      ProviderOnboardingStatus.APPROVED ||
    !definition?.isActive
  ) {
    return this.ineligible();
  }

  /**
   * VIRTUAL
   *
   * Geography is deliberately ignored.
   *
   * The fact that selectedDeliveryOption exists for VIRTUAL is
   * sufficient from a location perspective.
   */
  if (input.deliveryMode === CareDeliveryMode.VIRTUAL) {
    let institutionalPriceMinor: string | null = null;
    let institutionalCurrency: string | null = null;
    if (input.hostProviderId) {
      const affiliation = await manager.getRepository(ProviderPracticeAffiliation).findOne({
        where: {
          doctorProviderId: provider.id,
          hostProviderId: input.hostProviderId,
          isActive: true,
          allowsVirtualCare: true,
          status: ProviderPracticeAffiliationStatus.APPROVED,
        },
        lock: { mode: "pessimistic_read" },
      });
      if (!affiliation) return this.ineligible();
      institutionalPriceMinor = affiliation.virtualCarePriceMinor;
      institutionalCurrency = affiliation.virtualCareCurrency;
    }
    service.provider = provider;
    service.definition = definition;
    return Object.assign(service, {
      selectedDeliveryOption,
      institutionalPriceMinor,
      institutionalCurrency,
    });
  }

  /**
   * Every non-virtual delivery mode requires geography.
   */
  if (
    !input.countryCode ||
    !input.stateOrRegion ||
    !input.city
  ) {
    return this.ineligible();
  }

  /**
   * First check the provider's primary profile.
   */
  const profileMatches =
    provider.countryCode === input.countryCode &&
    provider.stateOrRegion?.toLocaleLowerCase() ===
      input.stateOrRegion.toLocaleLowerCase() &&
    provider.city?.toLocaleLowerCase() ===
      input.city.toLocaleLowerCase();

  /**
   * If the primary profile doesn't match, check additional
   * provider locations.
   */
  const locationMatches = profileMatches
    ? true
    : await manager
        .getRepository(ProviderLocation)
        .createQueryBuilder("location")
        .where(
          "location.providerId = :providerId",
          {
            providerId: provider.id,
          },
        )
        .andWhere("location.isActive = true")
        .andWhere(
          "location.countryCode = :countryCode",
          {
            countryCode: input.countryCode,
          },
        )
        .andWhere(
          "LOWER(location.state) = LOWER(:stateOrRegion)",
          {
            stateOrRegion: input.stateOrRegion,
          },
        )
        .andWhere(
          "LOWER(location.city) = LOWER(:city)",
          {
            city: input.city,
          },
        )
        .getExists();

  const affiliationMatches = locationMatches ? false : await manager.getRepository(ProviderPracticeAffiliation).createQueryBuilder("affiliation").innerJoin("affiliation.hostLocation","hostLocation").where("affiliation.doctorProviderId = :providerId",{providerId:provider.id}).andWhere("affiliation.isActive = true").andWhere("affiliation.status = :approvedAffiliation",{approvedAffiliation:ProviderPracticeAffiliationStatus.APPROVED}).andWhere("hostLocation.isActive = true").andWhere("hostLocation.countryCode = :countryCode",{countryCode:input.countryCode}).andWhere("LOWER(TRIM(hostLocation.state)) = LOWER(TRIM(:stateOrRegion))",{stateOrRegion:input.stateOrRegion}).andWhere("LOWER(TRIM(hostLocation.city)) = LOWER(TRIM(:city))",{city:input.city}).getExists();

  if (!locationMatches && !affiliationMatches) {
    return this.ineligible();
  }

  service.provider = provider;
  service.definition = definition;

  return Object.assign(service, {
    selectedDeliveryOption,
  });
}

async findEligibleCareProvider(
  input: ProviderCareEligibilityInput,
  manager: EntityManager = this.services.manager,
): Promise<EligibleProviderCareService | null> {
  const repository = manager.getRepository(ProviderCareService);

  const query = repository
    .createQueryBuilder("service")
    .innerJoin("service.provider", "provider")
    .innerJoin("service.definition", "definition")
    .innerJoin(
      ProviderCareServiceDeliveryOption,
      "deliveryOption",
      `
        deliveryOption.providerCareServiceId = service.id
        AND deliveryOption.deliveryMode = :deliveryMode
      `,
      {
        deliveryMode: input.deliveryMode,
      },
    )
    .where(
      "service.careServiceDefinitionId = :definitionId",
      {
        definitionId: input.careServiceDefinitionId,
      },
    )
    .andWhere("service.isActive = true")
    .andWhere(
      "service.supportsAppointmentRequests = true",
    )
    .andWhere("provider.deletedAt IS NULL")
    .andWhere("provider.status = :providerStatus", {
      providerStatus: ProviderStatus.ACTIVE,
    })
    .andWhere(
      "provider.onboardingStatus = :onboardingStatus",
      {
        onboardingStatus:
          ProviderOnboardingStatus.APPROVED,
      },
    )
    .andWhere("definition.isActive = true");

  /**
   * VIRTUAL
   *
   * No geography matching.
   *
   * The deliveryOption join above already guarantees
   * that this ProviderCareService supports VIRTUAL.
   */
  if (input.deliveryMode === CareDeliveryMode.VIRTUAL) {
    if (input.hostProviderId) {
      query.andWhere(`EXISTS (
        SELECT 1 FROM provider_practice_affiliations affiliation
        WHERE affiliation.doctor_provider_id = provider.id
          AND affiliation.host_provider_id = :hostProviderId
          AND affiliation.is_active = true
          AND affiliation.status = 'APPROVED'
          AND affiliation.allows_virtual_care = true
      )`, { hostProviderId: input.hostProviderId });
    }
    return this.rankAndValidateAutomaticCandidates(
      query.orderBy("service.id", "ASC"),
      input,
      manager,
    );
  }

  /**
   * Physical delivery modes require geography.
   */
  if (
    !input.countryCode ||
    !input.stateOrRegion ||
    !input.city
  ) {
    return null;
  }

  /**
   * PROVIDER_LOCATION
   *
   * Provider must have an active ProviderLocation
   * matching the requested country/state/city.
   */
  if (
    input.deliveryMode ===
    CareDeliveryMode.IN_PERSON
  ) {
    const locationQuery = manager
      .getRepository(ProviderLocation)
      .createQueryBuilder("location")
      .select("1")
      .where("location.providerId = provider.id")
      .andWhere("location.isActive = true")
      .andWhere(
        "location.countryCode = :countryCode",
      )
      .andWhere(
        "LOWER(location.state) = LOWER(:stateOrRegion)",
      )
      .andWhere(
        "LOWER(location.city) = LOWER(:city)",
      );

    const affiliationQuery = manager.getRepository(ProviderPracticeAffiliation).createQueryBuilder("affiliation").innerJoin("affiliation.hostLocation","affiliatedLocation").select("1").where("affiliation.doctorProviderId = provider.id").andWhere("affiliation.isActive = true").andWhere("affiliation.status = :approvedAffiliation").andWhere("affiliatedLocation.isActive = true").andWhere("affiliatedLocation.countryCode = :countryCode").andWhere("LOWER(TRIM(affiliatedLocation.state)) = LOWER(TRIM(:stateOrRegion))").andWhere("LOWER(TRIM(affiliatedLocation.city)) = LOWER(TRIM(:city))");
    query.andWhere(`(EXISTS (${locationQuery.getQuery()}) OR EXISTS (${affiliationQuery.getQuery()}))`,{countryCode:input.countryCode,stateOrRegion:input.stateOrRegion,city:input.city,approvedAffiliation:ProviderPracticeAffiliationStatus.APPROVED});
  } else {
    /**
     * Current fallback for other physical delivery modes.
     *
     * If you have HOME_VISIT, we should eventually match that
     * against a care-specific service area instead of assuming
     * ProviderLocation.
     */
    const locationQuery = manager
      .getRepository(ProviderLocation)
      .createQueryBuilder("location")
      .select("1")
      .where("location.providerId = provider.id")
      .andWhere("location.isActive = true")
      .andWhere(
        "location.countryCode = :countryCode",
      )
      .andWhere(
        "LOWER(location.state) = LOWER(:stateOrRegion)",
      )
      .andWhere(
        "LOWER(location.city) = LOWER(:city)",
      );

    query.andWhere(
      `EXISTS (${locationQuery.getQuery()})`,
      {
        countryCode: input.countryCode,
        stateOrRegion: input.stateOrRegion,
        city: input.city,
      },
    );
  }

  return this.rankAndValidateAutomaticCandidates(
    query.orderBy("service.id", "ASC"),
    input,
    manager,
  );
}

private async rankAndValidateAutomaticCandidates(
  query: ReturnType<Repository<ProviderCareService>["createQueryBuilder"]>,
  input: ProviderCareEligibilityInput,
  manager: EntityManager,
): Promise<EligibleProviderCareService | null> {
  const candidates = await query.getMany();

  if (candidates.length === 0) {
    return null;
  }

  const lockedCandidates = await manager
    .getRepository(ProviderCareService)
    .find({
      where: {
        id: In(candidates.map((candidate) => candidate.id)),
      },
      order: {
        id: "ASC",
      },
      lock: {
        mode: "pessimistic_write",
      },
    });

  if (lockedCandidates.length === 0) {
    return null;
  }

  const providerIds = [
    ...new Set(
      lockedCandidates.map((candidate) => candidate.providerId),
    ),
  ];

  const workloadRows = await manager
    .getRepository(CareRequest)
    .createQueryBuilder("request")
    .select("request.assignedProviderId", "providerId")
    .addSelect("COUNT(request.id)", "activeWorkload")
    .where("request.assignedProviderId IN (:...providerIds)", {
      providerIds,
    })
    .andWhere("request.status IN (:...statuses)", {
      statuses: ACTIVE_CARE_REQUEST_WORKLOAD_STATUSES,
    })
    .groupBy("request.assignedProviderId")
    .getRawMany<{
      providerId: string;
      activeWorkload: string;
    }>();

  const workloadByProviderId = new Map(
    workloadRows.map((row) => [
      row.providerId,
      Number(row.activeWorkload),
    ]),
  );

  const rankedCandidates = [...lockedCandidates].sort((left, right) => {
    const leftWorkload =
      workloadByProviderId.get(left.providerId) ?? 0;
    const rightWorkload =
      workloadByProviderId.get(right.providerId) ?? 0;

    if (leftWorkload !== rightWorkload) {
      return leftWorkload - rightWorkload;
    }

    const createdAtDifference =
      left.createdAt.getTime() - right.createdAt.getTime();

    if (createdAtDifference !== 0) {
      return createdAtDifference;
    }

    return left.id.localeCompare(right.id);
  });

  for (const candidate of rankedCandidates) {
    try {
      return await this.requireEligible(
        {
          ...input,
          providerId: candidate.providerId,
        },
        manager,
      );
    } catch (error) {
      if (error instanceof ConflictException) {
        continue;
      }

      throw error;
    }
  }

  return null;
}

  private ineligible(): never {
    throw new ConflictException(
      "Provider is not eligible for the selected care service and location",
    );
  }
}
