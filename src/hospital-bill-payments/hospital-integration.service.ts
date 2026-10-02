import { ConflictException, Injectable, NotFoundException, Inject } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { appConfig } from '../config/app.config';
import { AkthHospitalEmrAdapter } from './adapters/akth-hospital-emr.adapter';
import { HospitalEmrAdapter } from './hospital-emr.adapter';
import { HospitalIntegrationCode } from './enums/hospital-integration-code.enum';
import { PatientProviderConnection } from '../patient-provider-connections/entities/patient-provider-connection.entity';
import { PatientProviderConnectionStatus } from '../patient-provider-connections/enums/patient-provider-connection-status.enum';

export interface ResolvedHospitalConnection {
  hospitalCode: HospitalIntegrationCode;
  adapter: HospitalEmrAdapter;
  externalPatientReference: string;
}

@Injectable()
export class HospitalIntegrationService {
  private readonly adapters: ReadonlyMap<string, HospitalEmrAdapter>;

  constructor(private readonly akth: AkthHospitalEmrAdapter, @Inject(appConfig.KEY) private readonly config: ConfigType<typeof appConfig>) {
    this.adapters = new Map([[HospitalIntegrationCode.AKTH, akth]]);
  }

  metadata(code: HospitalIntegrationCode) {
    if (code === HospitalIntegrationCode.AKTH) {
      return { hospitalCode: code, name: this.config.hospitalBills.akth.name, logo: this.config.hospitalBills.akth.logo };
    }
    throw new NotFoundException('Hospital integration is not supported');
  }

  resolve(hospitalCode: string): HospitalEmrAdapter {
    const adapter = this.adapters.get(hospitalCode.trim().toUpperCase());
    if (!adapter) throw new NotFoundException('Hospital integration is not supported');
    return adapter;
  }

  resolveConnectedPatient(connection: PatientProviderConnection): ResolvedHospitalConnection {
    if (connection.status !== PatientProviderConnectionStatus.CONNECTED) {
      throw new ConflictException('A connected hospital is required');
    }
    const code = connection.provider?.hospitalCode?.trim().toUpperCase();
    if (!code) throw new ConflictException('The connected hospital has no EMR integration configured');
    if (!connection.externalPatientReference) throw new ConflictException('The hospital patient identity is not available');
    return {
      hospitalCode: code as HospitalIntegrationCode,
      adapter: this.resolve(code),
      externalPatientReference: connection.externalPatientReference,
    };
  }
}
