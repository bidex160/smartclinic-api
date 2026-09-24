import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";

import { HealthCheckPackageResponseDto } from "./dto/health-check-package-response.dto";
import { HealthCheckPackage } from "./entities/health-check-package.entity";
import { FulfilmentMode } from "./entities/fulfilment-mode.entity";
import { ProviderService } from "../providers/entities/provider-service.entity";
import { ProviderStatus } from "../providers/enums/provider-status.enum";
import { PackagePrice } from "./entities/package-price.entity";
import { ProviderOnboardingStatus } from "../providers/enums/provider-onboarding-status.enum";

@Injectable()
export class HealthCheckPackagesService {
  constructor(
    @InjectRepository(HealthCheckPackage)
    private readonly healthCheckPackageRepository: Repository<HealthCheckPackage>,
    @InjectRepository(ProviderService)
    private readonly providerServices: Repository<ProviderService>,
    @InjectRepository(FulfilmentMode)
    private readonly fulfilmentModesRepository: Repository<FulfilmentMode>,
    @InjectRepository(PackagePrice)
    private readonly packagePricesRepository: Repository<PackagePrice>,
  ) {}

  async findActive(): Promise<HealthCheckPackageResponseDto[]> {
    const healthCheckPackages = await this.healthCheckPackageRepository.find({
      where: { isActive: true },
      relations: {
        contents: { clinicalContent: true },
        addonAvailability: { clinicalContent: true },
      },
      order: { code: "ASC" },
    });
    const today = new Date().toISOString().slice(0, 10);
    const [prices, activeModes, cataloguePrices] = await Promise.all([
      this.providerServices.find({
      where: {
        isActive: true,
        healthCheckPackageId: In(healthCheckPackages.map((x) => x.id)),
        provider: {
          status: ProviderStatus.ACTIVE,
          onboardingStatus: ProviderOnboardingStatus.APPROVED,
        },
      },
      relations: { provider: true, fulfilmentMode: true },
      }),
      this.fulfilmentModesRepository.find({ where: { isActive: true }, order: { name: "ASC" } }),
      this.packagePricesRepository.find({
        where: { isActive: true, currency: "NGN" },
        relations: { fulfilmentMode: true },
      }),
    ]);
    return healthCheckPackages
      .map((item) => {
        const active = prices.filter(
          (price) => price.healthCheckPackageId === item.id,
        );
        const currentCatalogue = cataloguePrices.filter(
          (price) =>
            price.healthCheckPackageId === item.id &&
            price.effectiveFrom <= today &&
            (price.effectiveTo === null || today < price.effectiveTo),
        );
        const fromPriceMinor = currentCatalogue.length
          ? Math.min(...currentCatalogue.map((price) => Math.round(Number(price.amount) * 100)))
          : null;
        return {
          ...HealthCheckPackageResponseDto.fromEntity(item),
          includedContents: (item.contents ?? [])
            .filter(
              (content) => content.isActive && content.clinicalContent.isActive,
            )
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map(({ clinicalContent }) => ({
              code: clinicalContent.code,
              name: clinicalContent.name,
              category: clinicalContent.category,
              description: clinicalContent.description,
            })),
          optionalAddons: (item.addonAvailability ?? [])
            .filter(
              (link) =>
                link.isActive &&
                link.clinicalContent.isActive &&
                !(item.contents ?? []).some(
                  (content) =>
                    content.isActive &&
                    content.clinicalContent.code === link.clinicalContent.code,
                ),
            )
            .sort(
              (a, b) =>
                a.clinicalContent.displayOrder -
                  b.clinicalContent.displayOrder ||
                a.clinicalContent.code.localeCompare(b.clinicalContent.code),
            )
            .map(({ clinicalContent }) => ({
              code: clinicalContent.code,
              name: clinicalContent.name,
              category: clinicalContent.category,
              description: clinicalContent.description,
            })),
          fromPriceMinor,
          currency: fromPriceMinor === null ? null : "NGN",
          fulfilmentModes: [
            ...new Map(
              (active.length ? active.map((price) => price.fulfilmentMode) : activeModes)
                .filter((mode) => mode.code === "PROVIDER_LOCATION" || mode.code === "HOME_VISIT")
                .map((mode) => [
                  mode.code,
                  { code: mode.code, name: mode.name },
                ]),
            ).values(),
          ],
        } as HealthCheckPackageResponseDto;
      })
      ;
  }
}
