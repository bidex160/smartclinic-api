import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import {
  PRIVATE_ATTACHMENT_STORAGE,
  PrivateAttachmentStorage,
} from "../common/storage/private-attachment-storage";
import { createAppConfiguration } from "../config/environment";
import { Patient } from "../patients/entities/patient.entity";
import { PatientStatus } from "../patients/enums/patient-status.enum";
import { HealthPassportService } from "../health-passport/health-passport.service";
import { PatientProviderConnection } from "../patient-provider-connections/entities/patient-provider-connection.entity";
import { PatientProviderConnectionStatus } from "../patient-provider-connections/enums/patient-provider-connection-status.enum";
import { CurrentProviderService } from "../providers/current-provider.service";
import { Provider } from "../providers/entities/provider.entity";
import { ProviderOnboardingStatus } from "../providers/enums/provider-onboarding-status.enum";
import { ProviderStatus } from "../providers/enums/provider-status.enum";
import { User } from "../users/entities/user.entity";
import { generateClinicalRecordGrantReference } from "./clinical-record-access-reference";
import { generateClinicalRecordAccessRequestReference } from "./clinical-record-access-request-reference";
import {
  ClinicalAccessListQueryDto,
  ClinicalRecordAccessProviderListQueryDto,
  CreateClinicalRecordAccessGrantDto,
} from "./dto/clinical-record-access.dto";
import { CreateClinicalRecordAccessRequestDto } from "./dto/clinical-record-access-request.dto";
import { ClinicalRecordAccessAudit } from "./entities/clinical-record-access-audit.entity";
import { ClinicalRecordAccessGrant } from "./entities/clinical-record-access-grant.entity";
import { ClinicalRecordAccessRequest } from "./entities/clinical-record-access-request.entity";
import { ClinicalRecordAttachment } from "./entities/clinical-record-attachment.entity";
import { ClinicalRecord } from "./entities/clinical-record.entity";
import { ClinicalRecordAccessAction } from "./enums/clinical-record-access-action.enum";
import { ClinicalRecordAccessRequestStatus } from "./enums/clinical-record-access-request-status.enum";
import { ClinicalRecordAccessScope } from "./enums/clinical-record-access-scope.enum";
import { ClinicalRecordType } from "./enums/clinical-record-type.enum";
import { ClinicalRecordStatus } from "./enums/clinical-record-status.enum";
import { ClinicalRecordsService } from "./clinical-records.service";

@Injectable()
export class ClinicalRecordAccessService {
  constructor(
    @InjectRepository(ClinicalRecordAccessGrant)
    private readonly grants: Repository<ClinicalRecordAccessGrant>,
    @InjectRepository(ClinicalRecordAccessAudit)
    private readonly audits: Repository<ClinicalRecordAccessAudit>,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    @InjectRepository(Provider)
    private readonly providers: Repository<Provider>,
    private readonly currentProvider: CurrentProviderService,
    private readonly recordsService: ClinicalRecordsService,
    @Inject(PRIVATE_ATTACHMENT_STORAGE)
    private readonly storage: PrivateAttachmentStorage,
    @InjectRepository(ClinicalRecordAccessRequest)
    private readonly requests: Repository<ClinicalRecordAccessRequest>,
    private readonly healthPassport: HealthPassportService,
  ) {}

  async listEligibleProviders(
    user: User,
    query: ClinicalRecordAccessProviderListQueryDto,
  ) {
    await this.patient(user.id);
    const builder = this.eligibleProviderQuery(this.providers).select([
      "provider.providerReference",
      "provider.displayName",
      "provider.providerType",
      "provider.countryCode",
      "provider.stateOrRegion",
      "provider.city",
    ]);
    if (query.q) {
      builder.andWhere("provider.displayName ILIKE :search", {
        search: `%${query.q}%`,
      });
    }
    builder
      .orderBy("provider.displayName", "ASC")
      .addOrderBy("provider.providerReference", "ASC")
      .skip((query.page - 1) * query.limit)
      .take(query.limit);
    const [rows, total] = await builder.getManyAndCount();
    return this.page(
      rows.map((row) => this.providerDirectoryItem(row)),
      query,
      total,
    );
  }

  async createGrant(user: User, dto: CreateClinicalRecordAccessGrantDto) {
    const patient = await this.patient(user.id);
    this.validateScope(dto);
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (expiresAt && expiresAt <= new Date())
      throw new BadRequestException("expiresAt must be in the future");
    return this.grants.manager.transaction(async (manager) => {
      await manager
        .getRepository(Patient)
        .findOneOrFail({
          where: { id: patient.id },
          lock: { mode: "pessimistic_write" },
        });
      const provider = await this.eligibleProviderQuery(
        manager.getRepository(Provider),
      )
        .andWhere("provider.providerReference = :providerReference", {
          providerReference: dto.providerReference,
        })
        .getOne();
      if (!provider)
        throw new NotFoundException("Provider was not found");
      await this.requireConnected(manager, patient.id, provider.id);
      return this.saveGrant(manager, patient.id, provider, user.id, dto, expiresAt);
    });
  }
  async listGrants(user: User, query: ClinicalAccessListQueryDto) {
    const patient = await this.patient(user.id);
    const [rows, total] = await this.grants
      .createQueryBuilder("ag")
      .innerJoinAndSelect("ag.granteeProvider", "provider")
      .leftJoinAndSelect("ag.clinicalRecord", "record")
      .where("ag.patientId = :patientId", { patientId: patient.id })
      .orderBy("ag.createdAt", "DESC")
      .addOrderBy("ag.reference", "DESC")
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
    return this.page(
      rows.map((row) => this.mapGrant(row)),
      query,
      total,
    );
  }
  async getGrant(user: User, reference: string) {
    const patient = await this.patient(user.id);
    const row = await this.grants
      .createQueryBuilder("ag")
      .innerJoinAndSelect("ag.granteeProvider", "provider")
      .leftJoinAndSelect("ag.clinicalRecord", "record")
      .where("ag.reference = :reference", { reference })
      .andWhere("ag.patientId = :patientId", { patientId: patient.id })
      .getOne();
    if (!row) this.notFoundGrant();
    return this.mapGrant(row);
  }
  async revokeGrant(user: User, reference: string) {
    const patient = await this.patient(user.id);
    return this.grants.manager.transaction(async (manager) => {
      const row = await manager
        .getRepository(ClinicalRecordAccessGrant)
        .findOne({
          where: { reference, patientId: patient.id },
          relations: { granteeProvider: true, clinicalRecord: true },
          lock: { mode: "pessimistic_write" },
        });
      if (!row) this.notFoundGrant();
      if (row.revokedAt) return this.mapGrant(row);
      if (row.expiresAt && row.expiresAt <= new Date())
        throw new ConflictException("Expired Clinical Record access cannot be revoked");
      row.revokedAt = new Date();
      await manager.getRepository(ClinicalRecordAccessGrant).save(row);
      return this.mapGrant(row);
    });
  }

  async createAccessRequest(user: User, dto: CreateClinicalRecordAccessRequestDto) {
    const provider = await this.currentProvider.resolveOperational(user);
    this.validateScope(dto);
    const requestedExpiresAt = dto.requestedExpiresAt ? new Date(dto.requestedExpiresAt) : null;
    const now = new Date();
    if (requestedExpiresAt && requestedExpiresAt <= now)
      throw new BadRequestException("requestedExpiresAt must be in the future");
    const patient = await this.patients.findOne({
      where: { patientReference: dto.patientReference, status: PatientStatus.ACTIVE },
    });
    if (!patient || patient.deletedAt)
      throw new NotFoundException("Patient was not found");
    const requestExpiresAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    if (requestedExpiresAt && requestedExpiresAt < requestExpiresAt)
      requestExpiresAt.setTime(requestedExpiresAt.getTime());
    return this.requests.manager.transaction(async (manager) => {
      const repository = manager.getRepository(ClinicalRecordAccessRequest);
      const duplicate = await repository.createQueryBuilder("request")
        .where("request.patientId = :patientId", { patientId: patient.id })
        .andWhere("request.providerId = :providerId", { providerId: provider.id })
        .andWhere("request.scope = :scope", { scope: dto.scope })
        .andWhere(dto.recordType ? "request.recordType = :recordType" : "request.recordType IS NULL", { recordType: dto.recordType })
        .andWhere(dto.clinicalRecordReference ? "request.clinicalRecordReference = :recordReference" : "request.clinicalRecordReference IS NULL", { recordReference: dto.clinicalRecordReference })
        .andWhere("request.status = :status", { status: ClinicalRecordAccessRequestStatus.PENDING })
        .andWhere("request.expiresAt > CURRENT_TIMESTAMP")
        .getOne();
      if (duplicate)
        throw new ConflictException("An equivalent pending Clinical Record access request already exists");
      const row = await repository.save(repository.create({
        reference: generateClinicalRecordAccessRequestReference(),
        patientId: patient.id,
        providerId: provider.id,
        scope: dto.scope,
        recordType: dto.scope === ClinicalRecordAccessScope.RECORD_TYPE ? dto.recordType! : null,
        clinicalRecordReference: dto.scope === ClinicalRecordAccessScope.SINGLE_RECORD ? dto.clinicalRecordReference! : null,
        reason: dto.reason,
        requestedExpiresAt,
        status: ClinicalRecordAccessRequestStatus.PENDING,
        expiresAt: requestExpiresAt,
        respondedAt: null,
        approvedGrantId: null,
      }));
      row.patient = patient;
      row.provider = provider;
      row.approvedGrant = null;
      return this.mapRequest(row, null);
    });
  }

  async listPatientRequests(user: User, query: ClinicalAccessListQueryDto) {
    const patient = await this.patient(user.id);
    return this.listRequests(query, "request.patientId = :ownerId", patient.id, true);
  }

  async listProviderRequests(user: User, query: ClinicalAccessListQueryDto) {
    const provider = await this.currentProvider.resolveOperational(user);
    return this.listRequests(query, "request.providerId = :ownerId", provider.id, false);
  }

async approveAccessRequest(
  user: User,
  reference: string,
) {
  const patient = await this.patient(user.id);

  return this.requests.manager.transaction(
    async (manager) => {
      const requestRepository =
        manager.getRepository(
          ClinicalRecordAccessRequest,
        );

      const grantRepository =
        manager.getRepository(
          ClinicalRecordAccessGrant,
        );

      /**
       * Lock only the request row.
       *
       * No relations here because approvedGrant is nullable
       * and PostgreSQL rejects FOR UPDATE across that outer join.
       */
      const row = await requestRepository
        .createQueryBuilder("req")
        .where("req.reference = :reference", {
          reference,
        })
        .andWhere("req.patientId = :patientId", {
          patientId: patient.id,
        })
        .setLock("pessimistic_write")
        .getOne();

      if (!row) {
        this.notFoundRequest();
      }

      /**
       * Idempotent approval.
       */
      if (
        row.status ===
        ClinicalRecordAccessRequestStatus.APPROVED
      ) {
        const approvedRow =
          await requestRepository.findOne({
            where: {
              id: row.id,
            },
            relations: {
              patient: true,
              provider: true,
              approvedGrant: true,
            },
          });

        if (!approvedRow) {
          this.notFoundRequest();
        }

        return this.mapRequest(
          approvedRow,
          await this.connectionView(
            manager,
            approvedRow.patientId,
            approvedRow.providerId,
          ),
        );
      }

      /**
       * Request expiry.
       */
      if (
        this.effectiveRequestStatus(row) ===
        ClinicalRecordAccessRequestStatus.EXPIRED
      ) {
        throw new ConflictException(
          "Clinical Record access request has expired",
        );
      }

      /**
       * Only PENDING requests can be approved.
       */
      if (
        row.status !==
        ClinicalRecordAccessRequestStatus.PENDING
      ) {
        throw new ConflictException(
          "Clinical Record access request is no longer pending",
        );
      }

      /**
       * Provider must be CONNECTED to the patient.
       */
      const connection = await this.connected(
        manager,
        row.patientId,
        row.providerId,
      );

      if (!connection) {
        throw new ConflictException(
          "CONNECTION_REQUIRED: An active Patient Provider Connection is required",
        );
      }

      const now = new Date();

      if (
        row.requestedExpiresAt &&
        row.requestedExpiresAt <= now
      ) {
        throw new ConflictException(
          "Requested sharing access has expired",
        );
      }

      /**
       * Load provider separately.
       */
      const provider = await manager
        .getRepository(Provider)
        .findOne({
          where: {
            id: row.providerId,
          },
        });

      if (!provider) {
        throw new NotFoundException(
          "Provider not found",
        );
      }

      /**
       * Build grant DTO using the existing grant-creation
       * contract.
       */
      const dto: CreateClinicalRecordAccessGrantDto = {
        providerReference:
          provider.providerReference,

        scope: row.scope,

        ...(row.recordType
          ? {
              recordType: row.recordType,
            }
          : {}),

        ...(row.clinicalRecordReference
          ? {
              clinicalRecordReference:
                row.clinicalRecordReference,
            }
          : {}),
      };

      this.validateScope(dto);

      /**
       * --------------------------------------------------
       * LOOK FOR EXISTING EQUIVALENT ACTIVE GRANT
       * --------------------------------------------------
       *
       * Actual ClinicalRecordAccessGrant fields:
       *
       * patientId
       * granteeProviderId
       * scope
       * recordType
       * clinicalRecordId
       * expiresAt
       * revokedAt
       */

      const existingGrantQuery =
        grantRepository
          .createQueryBuilder("ag")
          .where(
            "ag.patientId = :patientId",
            {
              patientId: row.patientId,
            },
          )
          .andWhere(
            "ag.granteeProviderId = :providerId",
            {
              providerId: row.providerId,
            },
          )
          .andWhere(
            "ag.scope = :scope",
            {
              scope: row.scope,
            },
          )
          .andWhere(
            "ag.revokedAt IS NULL",
          )
          .andWhere(
            `(
              ag.expiresAt IS NULL
              OR ag.expiresAt > :now
            )`,
            {
              now,
            },
          );

      /**
       * RECORD_TYPE grants must match exactly.
       */
      if (
        row.scope ===
        ClinicalRecordAccessScope.RECORD_TYPE
      ) {
        existingGrantQuery.andWhere(
          "ag.recordType = :recordType",
          {
            recordType: row.recordType,
          },
        );

        existingGrantQuery.andWhere(
          "ag.clinicalRecordId IS NULL",
        );
      }

      /**
       * ALL_RECORDS has neither record type nor record ID.
       */
      if (
        row.scope === ClinicalRecordAccessScope.ALL_RECORDS ||
        row.scope === ClinicalRecordAccessScope.HEALTH_PASSPORT
      ) {
        existingGrantQuery
          .andWhere(
            "ag.recordType IS NULL",
          )
          .andWhere(
            "ag.clinicalRecordId IS NULL",
          );
      }

      /**
       * SINGLE_RECORD is special.
       *
       * The request contains:
       *
       * clinicalRecordReference
       *
       * while the grant contains:
       *
       * clinicalRecordId
       *
       * Therefore we must NOT incorrectly compare the
       * public reference against the UUID.
       *
       * For now, let saveGrant() handle SINGLE_RECORD because
       * it already contains the authoritative reference -> ID
       * resolution.
       */
      if (
        row.scope ===
        ClinicalRecordAccessScope.SINGLE_RECORD
      ) {
        /**
         * Prevent this query from accidentally matching
         * some unrelated single-record grant.
         */
        existingGrantQuery.andWhere(
          "1 = 0",
        );
      }

      /**
       * Existing grant must cover the requested duration.
       */
      if (row.requestedExpiresAt) {
        existingGrantQuery.andWhere(
          `(
            ag.expiresAt IS NULL
            OR ag.expiresAt >= :requestedExpiresAt
          )`,
          {
            requestedExpiresAt:
              row.requestedExpiresAt,
          },
        );
      } else {
        /**
         * No requested expiry means indefinite access.
         * Only an indefinite grant fully satisfies it.
         */
        existingGrantQuery.andWhere(
          "ag.expiresAt IS NULL",
        );
      }

      let savedGrant =
        await existingGrantQuery
          .orderBy(
            "ag.createdAt",
            "DESC",
          )
          .getOne();

      /**
       * No equivalent grant found.
       *
       * Use the existing authoritative grant creation
       * function.
       */
      if (!savedGrant) {
        const createdGrant =
          await this.saveGrant(
            manager,
            row.patientId,
            provider,
            user.id,
            dto,
            row.requestedExpiresAt,
          );

        savedGrant =
          await grantRepository.findOneOrFail({
            where: {
              reference:
                createdGrant.reference,
            },
          });
      }

      /**
       * Grant exists now, either reused or newly created.
       */
      row.status =
        ClinicalRecordAccessRequestStatus.APPROVED;

      row.respondedAt =
        new Date();

      row.approvedGrantId =
        savedGrant.id;

      row.approvedGrant =
        savedGrant;

      await requestRepository.save(row);

      /**
       * Reload relations after the locked operation.
       */
      const approvedRow =
        await requestRepository.findOneOrFail({
          where: {
            id: row.id,
          },
          relations: {
            patient: true,
            provider: true,
            approvedGrant: true,
          },
        });

      return this.mapRequest(
        approvedRow,
        {
          eligible: true,
          reference:
            connection.reference,
          status:
            connection.status,
        },
      );
    },
  );
}
  async declineAccessRequest(user: User, reference: string) {
    const patient = await this.patient(user.id);
    return this.requests.manager.transaction(async (manager) => {
      const repository = manager.getRepository(ClinicalRecordAccessRequest);
      const row = await repository.findOne({ where: { reference, patientId: patient.id }, relations: { patient: true, provider: true, approvedGrant: true }, lock: { mode: "pessimistic_write" } });
      if (!row) this.notFoundRequest();
      if (row.status === ClinicalRecordAccessRequestStatus.DECLINED)
        return this.mapRequest(row, await this.connectionView(manager, row.patientId, row.providerId));
      if (this.effectiveRequestStatus(row) === ClinicalRecordAccessRequestStatus.EXPIRED)
        throw new ConflictException("Clinical Record access request has expired");
      if (row.status !== ClinicalRecordAccessRequestStatus.PENDING)
        throw new ConflictException("Clinical Record access request is no longer pending");
      row.status = ClinicalRecordAccessRequestStatus.DECLINED;
      row.respondedAt = new Date();
      await repository.save(row);
      return this.mapRequest(row, await this.connectionView(manager, row.patientId, row.providerId));
    });
  }

async listShared(user: User, query: ClinicalAccessListQueryDto) {
  const provider = await this.currentProvider.resolveOperational(user);

  const builder = this.grants.manager
    .getRepository(ClinicalRecord)
    .createQueryBuilder('record')
    .innerJoinAndSelect('record.provider', 'originProvider')
    .innerJoinAndSelect('record.patient', 'patient')
    .leftJoinAndSelect('record.careServiceDefinition', 'definition')
    .where('record.status = :finalized', {
      finalized: ClinicalRecordStatus.FINALIZED,
    })
    .andWhere(
      `
        EXISTS (
          SELECT 1
          FROM clinical_record_access_grants access_grant
          WHERE access_grant.patient_id = record.patient_id
            AND access_grant.grantee_provider_id = :providerId
            AND access_grant.revoked_at IS NULL
            AND EXISTS (
              SELECT 1 FROM patient_provider_connections connection
              WHERE connection.patient_id = record.patient_id
                AND connection.provider_id = :providerId
                AND connection.status = 'CONNECTED'
            )
            AND (
              access_grant.expires_at IS NULL
              OR access_grant.expires_at > CURRENT_TIMESTAMP
            )
            AND (
              access_grant.scope = 'ALL_RECORDS'

              OR (
                access_grant.scope = 'RECORD_TYPE'
                AND access_grant.record_type = record.record_type
              )

              OR (
                access_grant.scope = 'SINGLE_RECORD'
                AND access_grant.clinical_record_id = record.id
              )
            )
        )
      `,
      {
        providerId: provider.id,
      },
    )
    .orderBy('record.occurredAt', 'DESC')
    .addOrderBy('record.reference', 'DESC')
    .skip((query.page - 1) * query.limit)
    .take(query.limit);

  const [rows, total] = await builder.getManyAndCount();

  return this.page(
    rows.map((row) => this.sharedSummary(row)),
    query,
    total,
  );
}
  async getShared(user: User, reference: string) {
    const provider = await this.currentProvider.resolveOperational(user);
    return this.grants.manager.transaction(async (manager) => {
      const record = await this.recordsService
        .sharedReadBuilder(manager)
        .where("record.reference = :reference", { reference })
        .andWhere("record.status = :status", {
          status: ClinicalRecordStatus.FINALIZED,
        })
        .getOne();
      if (!record) this.notFoundRecord();
      const grant = await this.coveringGrant(manager, provider.id, record);
      if (!grant) this.notFoundRecord();
      await this.audit(
        manager,
        record,
        provider.id,
        user.id,
        grant.id,
        ClinicalRecordAccessAction.VIEW,
      );
      return {
        ...this.recordsService.projectRecord(record),
        patient: { displayName: this.patientName(record.patient) },
      };
    });
  }
  async sharedAttachmentAccess(
    user: User,
    recordReference: string,
    attachmentReference: string,
  ) {
    const provider = await this.currentProvider.resolveOperational(user);
    return this.grants.manager.transaction(async (manager) => {
      const record = await manager
        .getRepository(ClinicalRecord)
        .findOne({
          where: {
            reference: recordReference,
            status: ClinicalRecordStatus.FINALIZED,
          },
          relations: { patient: true },
          lock: { mode: "pessimistic_read" },
        });
      if (!record) this.notFoundRecord();
      const grant = await this.coveringGrant(manager, provider.id, record);
      if (!grant) this.notFoundRecord();
      const attachment = await manager
        .getRepository(ClinicalRecordAttachment)
        .findOne({
          where: {
            reference: attachmentReference,
            clinicalRecordId: record.id,
          },
        });
      if (!attachment)
        throw new NotFoundException("Clinical Record attachment was not found");
      await this.audit(
        manager,
        record,
        provider.id,
        user.id,
        grant.id,
        ClinicalRecordAccessAction.ATTACHMENT_ACCESS,
      );
      const expiresAt = new Date(
        Date.now() +
          createAppConfiguration().clinicalAttachments.accessTtlSeconds * 1000,
      );
      const url = await this.storage.createAccessUrl(
        {
          publicId: attachment.storagePublicId,
          storageResourceType: attachment.storageResourceType,
          version: attachment.storageVersion,
          format: attachment.storageFormat,
        },
        expiresAt,
      );
      return { url, expiresAt };
    });
  }
  async listAudit(user: User, query: ClinicalAccessListQueryDto) {
    const patient = await this.patient(user.id);
    const [rows, total] = await this.audits
      .createQueryBuilder("audit")
      .innerJoinAndSelect("audit.provider", "provider")
      .leftJoinAndSelect("audit.clinicalRecord", "record")
      .where("audit.patientId = :patientId", { patientId: patient.id })
      .orderBy("audit.createdAt", "DESC")
      .addOrderBy("audit.id", "DESC")
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
    return this.page(
      rows.map((row) => ({
        provider: this.provider(row.provider),
        sourceDomain: row.sourceDomain,
        sourceReference: row.sourceReference,
        clinicalRecord: row.clinicalRecord ? {
          reference: row.clinicalRecord.reference,
          title: row.clinicalRecord.title,
          recordType: row.clinicalRecord.recordType,
        } : null,
        action: row.action,
        createdAt: row.createdAt,
      })),
      query,
      total,
    );
  }

  async getSharedHealthPassport(user: User, patientReference: string) {
    const provider = await this.currentProvider.resolveOperational(user);
    return this.grants.manager.transaction(async (manager) => {
      const patient = await manager.getRepository(Patient).findOne({ where: { patientReference, status: PatientStatus.ACTIVE } });
      if (!patient || patient.deletedAt) this.notFoundPassport();
      await this.requireConnected(manager, patient.id, provider.id);
      const ag = await manager.getRepository(ClinicalRecordAccessGrant).createQueryBuilder("ag")
        .where("ag.patientId = :patientId", { patientId: patient.id })
        .andWhere("ag.granteeProviderId = :providerId", { providerId: provider.id })
        .andWhere("ag.scope IN (:...scopes)", { scopes: [ClinicalRecordAccessScope.HEALTH_PASSPORT, ClinicalRecordAccessScope.ALL_RECORDS] })
        .andWhere("ag.revokedAt IS NULL")
        .andWhere("(ag.expiresAt IS NULL OR ag.expiresAt > CURRENT_TIMESTAMP)")
        .orderBy("CASE WHEN ag.scope = 'ALL_RECORDS' THEN 0 ELSE 1 END", "ASC")
        .addOrderBy("ag.createdAt", "ASC")
        .getOne();
      if (!ag) this.notFoundPassport();
      const result = await this.healthPassport.shareableForProvider(patient.id, ag.scope === ClinicalRecordAccessScope.ALL_RECORDS);
      const auditRepository = manager.getRepository(ClinicalRecordAccessAudit);
      await auditRepository.save(auditRepository.create({
        patientId: patient.id, clinicalRecordId: null, providerId: provider.id, userId: user.id, grantId: ag.id,
        action: ClinicalRecordAccessAction.VIEW, sourceDomain: 'HEALTH_PASSPORT', sourceReference: patient.patientReference,
      }));
      return result;
    });
  }

  private async coveringGrant(
    manager: EntityManager,
    providerId: string,
    record: ClinicalRecord,
  ) {
    return manager
      .getRepository(ClinicalRecordAccessGrant)
      .createQueryBuilder("ag")
      .where("ag.patientId = :patientId", { patientId: record.patientId })
      .andWhere("ag.granteeProviderId = :providerId", { providerId })
      .andWhere(`EXISTS (SELECT 1 FROM patient_provider_connections connection WHERE connection.patient_id = ag.patient_id AND connection.provider_id = ag.grantee_provider_id AND connection.status = 'CONNECTED')`)
      .andWhere("ag.revokedAt IS NULL")
      .andWhere(
        "(ag.expiresAt IS NULL OR ag.expiresAt > CURRENT_TIMESTAMP)",
      )
      .andWhere(
        `(ag.scope = 'ALL_RECORDS' OR (ag.scope = 'RECORD_TYPE' AND ag.recordType = :recordType) OR (ag.scope = 'SINGLE_RECORD' AND ag.clinicalRecordId = :recordId))`,
        { recordType: record.recordType, recordId: record.id },
      )
      .orderBy("ag.createdAt", "ASC")
      .addOrderBy("ag.reference", "ASC")
      .getOne();
  }

  private async saveGrant(
    manager: EntityManager,
    patientId: string,
    provider: Provider,
    userId: string,
    dto: CreateClinicalRecordAccessGrantDto,
    expiresAt: Date | null,
  ) {
    let record: ClinicalRecord | null = null;
    if (dto.scope === ClinicalRecordAccessScope.SINGLE_RECORD) {
      record = await manager.getRepository(ClinicalRecord).findOne({ where: { reference: dto.clinicalRecordReference!, patientId, status: ClinicalRecordStatus.FINALIZED } });
      if (!record) throw new NotFoundException("Clinical Record was not found");
    }
    const repository = manager.getRepository(ClinicalRecordAccessGrant);
    const duplicate = await repository.createQueryBuilder("ag")
      .where("ag.patientId = :patientId", { patientId })
      .andWhere("ag.granteeProviderId = :providerId", { providerId: provider.id })
      .andWhere("ag.scope = :scope", { scope: dto.scope })
      .andWhere(dto.recordType ? "ag.recordType = :recordType" : "ag.recordType IS NULL", { recordType: dto.recordType })
      .andWhere(record ? "ag.clinicalRecordId = :recordId" : "ag.clinicalRecordId IS NULL", { recordId: record?.id })
      .andWhere("ag.revokedAt IS NULL")
      .andWhere("(ag.expiresAt IS NULL OR ag.expiresAt > CURRENT_TIMESTAMP)")
      .getOne();
    if (duplicate) throw new ConflictException("An equivalent active Clinical Record access grant already exists");
    const grant = await repository.save(repository.create({
      reference: generateClinicalRecordGrantReference(), patientId, granteeProviderId: provider.id,
      scope: dto.scope, recordType: dto.scope === ClinicalRecordAccessScope.RECORD_TYPE ? dto.recordType! : null,
      clinicalRecordId: record?.id ?? null, grantedByUserId: userId, grantedAt: new Date(), expiresAt, revokedAt: null,
    }));
    grant.granteeProvider = provider;
    grant.clinicalRecord = record;
    return this.mapGrant(grant);
  }

  private async requireConnected(manager: EntityManager, patientId: string, providerId: string) {
    const connection = await this.connected(manager, patientId, providerId);
    if (!connection) throw new ConflictException("CONNECTION_REQUIRED: An active Patient Provider Connection is required");
    return connection;
  }

  private connected(manager: EntityManager, patientId: string, providerId: string) {
    return manager.getRepository(PatientProviderConnection).findOne({
      where: { patientId, providerId, status: PatientProviderConnectionStatus.CONNECTED },
    });
  }

  private async connectionView(manager: EntityManager, patientId: string, providerId: string) {
    const connected = await this.connected(manager, patientId, providerId);
    if (connected) return { eligible: true, reference: connected.reference, status: connected.status };
    const latest = await manager.getRepository(PatientProviderConnection).findOne({ where: { patientId, providerId }, order: { createdAt: "DESC" } });
    return { eligible: false, reference: latest?.reference ?? null, status: latest?.status ?? null };
  }

  private async listRequests(query: ClinicalAccessListQueryDto, ownerWhere: string, ownerId: string, includeConnection: boolean) {
    const [rows, total] = await this.requests.createQueryBuilder("request")
      .innerJoinAndSelect("request.patient", "patient")
      .innerJoinAndSelect("request.provider", "provider")
      .leftJoinAndSelect("request.approvedGrant", "approvedGrant")
      .where(ownerWhere, { ownerId })
      .orderBy("request.createdAt", "DESC").addOrderBy("request.reference", "DESC")
      .skip((query.page - 1) * query.limit).take(query.limit).getManyAndCount();
    const items = await Promise.all(rows.map(async row => this.mapRequest(row, includeConnection ? await this.connectionView(this.requests.manager, row.patientId, row.providerId) : null)));
    return this.page(items, query, total);
  }

  private effectiveRequestStatus(row: ClinicalRecordAccessRequest) {
    return row.status === ClinicalRecordAccessRequestStatus.PENDING && row.expiresAt <= new Date()
      ? ClinicalRecordAccessRequestStatus.EXPIRED
      : row.status;
  }

  private mapRequest(row: ClinicalRecordAccessRequest, connection: { eligible: boolean; reference: string | null; status: PatientProviderConnectionStatus | null } | null) {
    return {
      reference: row.reference,
      patient: { patientReference: row.patient.patientReference },
      provider: this.provider(row.provider),
      scope: row.scope,
      recordType: row.recordType,
      clinicalRecordReference: row.clinicalRecordReference,
      reason: row.reason,
      requestedExpiresAt: row.requestedExpiresAt,
      status: this.effectiveRequestStatus(row),
      expiresAt: row.expiresAt,
      respondedAt: row.respondedAt,
      approvedGrantReference: row.approvedGrant?.reference ?? null,
      ...(connection ? { connection } : {}),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
  private async audit(
    manager: EntityManager,
    record: ClinicalRecord,
    providerId: string,
    userId: string,
    grantId: string,
    action: ClinicalRecordAccessAction,
  ) {
    const repo = manager.getRepository(ClinicalRecordAccessAudit);
    await repo.save(
      repo.create({
        patientId: record.patientId,
        clinicalRecordId: record.id,
        providerId,
        userId,
        grantId,
        action,
        sourceDomain: 'CLINICAL_RECORD',
        sourceReference: record.reference,
      }),
    );
  }
  private validateScope(dto: { scope: ClinicalRecordAccessScope; recordType?: ClinicalRecordType; clinicalRecordReference?: string }) {
    const valid =
      ([ClinicalRecordAccessScope.HEALTH_PASSPORT, ClinicalRecordAccessScope.ALL_RECORDS].includes(dto.scope) &&
        !dto.recordType &&
        !dto.clinicalRecordReference) ||
      (dto.scope === ClinicalRecordAccessScope.RECORD_TYPE &&
        !!dto.recordType &&
        !dto.clinicalRecordReference) ||
      (dto.scope === ClinicalRecordAccessScope.SINGLE_RECORD &&
        !dto.recordType &&
        !!dto.clinicalRecordReference);
    if (!valid)
      throw new BadRequestException("Grant scope fields are inconsistent");
  }
  private mapGrant(row: ClinicalRecordAccessGrant) {
    const now = new Date();
    const status = row.revokedAt
      ? "REVOKED"
      : row.expiresAt && row.expiresAt <= now
        ? "EXPIRED"
        : "ACTIVE";
    return {
      reference: row.reference,
      provider: this.provider(row.granteeProvider),
      scope: row.scope,
      recordType: row.recordType,
      clinicalRecord: row.clinicalRecord
        ? {
            reference: row.clinicalRecord.reference,
            title: row.clinicalRecord.title,
            recordType: row.clinicalRecord.recordType,
          }
        : null,
      grantedAt: row.grantedAt,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
      status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
  private sharedSummary(row: ClinicalRecord) {
    return {
      reference: row.reference,
      recordType: row.recordType,
      title: row.title,
      summary: row.summary,
      occurredAt: row.occurredAt,
      finalizedAt: row.finalizedAt,
      provider: this.provider(row.provider),
      patient: { displayName: this.patientName(row.patient) },
      service: row.careServiceDefinition
        ? {
            code: row.careServiceDefinition.code,
            name: row.careServiceDefinition.name,
          }
        : null,
    };
  }
  private provider(row: Provider) {
    return {
      providerReference: row.providerReference,
      displayName: row.displayName,
      providerType: row.providerType,
    };
  }

  private providerDirectoryItem(row: Provider) {
    return {
      providerReference: row.providerReference,
      displayName: row.displayName,
      providerType: row.providerType,
      location: {
        city: row.city,
        stateOrRegion: row.stateOrRegion,
        countryCode: row.countryCode,
      },
    };
  }

  private eligibleProviderQuery(repository: Repository<Provider>) {
    return repository
      .createQueryBuilder("provider")
      .where("provider.status = :active", { active: ProviderStatus.ACTIVE })
      .andWhere("provider.onboardingStatus = :approved", {
        approved: ProviderOnboardingStatus.APPROVED,
      })
      .andWhere("provider.deletedAt IS NULL");
  }
  private patientName(row: Patient) {
    const initial = row.familyName.trim().charAt(0);
    return initial
      ? `${row.givenName.trim()} ${initial}.`
      : row.givenName.trim();
  }
  private page(
    items: unknown[],
    query: ClinicalAccessListQueryDto,
    total: number,
  ) {
    return {
      items,
      page: query.page,
      limit: query.limit,
      total,
      totalPages: total ? Math.ceil(total / query.limit) : 0,
    };
  }
  private async patient(userId: string) {
    const patient = await this.patients.findOne({
      where: { userId },
      withDeleted: true,
    });
    if (
      !patient ||
      patient.deletedAt ||
      patient.status !== PatientStatus.ACTIVE
    )
      throw new NotFoundException("Patient profile was not found");
    return patient;
  }
  private notFoundGrant(): never {
    throw new NotFoundException("Clinical Record access grant was not found");
  }
  private notFoundRequest(): never {
    throw new NotFoundException("Clinical Record access request was not found");
  }
  private notFoundRecord(): never {
    throw new NotFoundException("Clinical Record was not found");
  }
  private notFoundPassport(): never {
    throw new NotFoundException("Shared Health Passport was not found");
  }
}
