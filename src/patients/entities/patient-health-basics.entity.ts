import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn, UpdateDateColumn } from "typeorm";

import { Patient } from "./patient.entity";

export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;
export type BloodGroup = (typeof BLOOD_GROUPS)[number];
export const GENOTYPES = ["AA", "AS", "AC", "SS", "SC", "CC"] as const;
export type Genotype = (typeof GENOTYPES)[number];

/**
 * Patient-reported health basics shown on the patient's own SmartClinic card.
 * Self-reported, not clinically verified; one row per patient.
 */
@Entity("patient_health_basics")
export class PatientHealthBasics {
  @PrimaryColumn({ name: "patient_id", type: "uuid" }) patientId!: string;
  @OneToOne(() => Patient, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "patient_id" })
  patient!: Patient;

  @Column({ name: "blood_group", type: "varchar", length: 3, nullable: true }) bloodGroup!: BloodGroup | null;
  @Column({ type: "varchar", length: 2, nullable: true }) genotype!: Genotype | null;
  @Column({ type: "varchar", length: 500, nullable: true }) allergies!: string | null;
  @Column({ type: "varchar", length: 500, nullable: true }) conditions!: string | null;
  @Column({ name: "emergency_contact_name", type: "varchar", length: 120, nullable: true }) emergencyContactName!: string | null;
  @Column({ name: "emergency_contact_phone", type: "varchar", length: 30, nullable: true }) emergencyContactPhone!: string | null;
  @Column({ name: "emergency_contact_relationship", type: "varchar", length: 60, nullable: true }) emergencyContactRelationship!: string | null;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" }) updatedAt!: Date;
}
