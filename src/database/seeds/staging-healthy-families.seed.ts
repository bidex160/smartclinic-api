import { DataSource, IsNull } from 'typeorm';

import dataSource from '../data-source';
import { seedHealthyFamiliesDemo } from '../seed-healthy-families-demo';
import { PartnerInvitation } from '../../partners/entities/partner-invitation.entity';

export const STAGING_FAMILY_SEED_CONFIRMATION = 'SMARTCLINIC_STAGING_ONLY';

export interface StagingFamilySeedResult {
  invitationUrl: string;
  invitation: PartnerInvitation;
}

export async function seedStagingHealthyFamilies(
  connection: DataSource,
  options: {
    confirmation?: string;
    email?: string;
    phone?: string;
    frontendUrl?: string;
  } = {},
): Promise<StagingFamilySeedResult> {
  const confirmation =
    options.confirmation ?? process.env.CONFIRM_STAGING_FAMILY_SEED;
  if (confirmation !== STAGING_FAMILY_SEED_CONFIRMATION) {
    throw new Error(
      'Refusing to seed Healthy Families. Set CONFIRM_STAGING_FAMILY_SEED=SMARTCLINIC_STAGING_ONLY only on the staging server.',
    );
  }

  const email = (options.email ?? process.env.STAGING_FAMILY_INVITATION_EMAIL)
    ?.trim()
    .toLowerCase();
  const phone = (options.phone ?? process.env.STAGING_FAMILY_INVITATION_PHONE)?.trim();
  if (!email && !phone) {
    throw new Error(
      'STAGING_FAMILY_INVITATION_EMAIL or STAGING_FAMILY_INVITATION_PHONE is required.',
    );
  }

  const { school, program } = await seedHealthyFamiliesDemo(connection);
  const invitations = connection.getRepository(PartnerInvitation);
  let invitation = await invitations.findOne({
    where: {
      partnerId: school.id,
      programId: program.id,
      email: email ?? IsNull(),
      phone: phone ?? IsNull(),
      status: 'INVITED',
    },
    order: { invitedAt: 'DESC' },
  });

  if (!invitation) {
    invitation = await invitations.save(
      invitations.create({
        partnerId: school.id,
        programId: program.id,
        email: email ?? null,
        phone: phone ?? null,
        campaignId: null,
        status: 'INVITED',
      }),
    );
  }

  const frontendUrl = (
    options.frontendUrl ??
    process.env.FRONTEND_URL ??
    'https://staging.smartclinicnetwork.com'
  ).replace(/\/$/, '');
  return {
    invitation,
    invitationUrl: `${frontendUrl}/healthy-families/join/${invitation.token}`,
  };
}

async function run(): Promise<void> {
  await dataSource.initialize();

  try {
    const result = await seedStagingHealthyFamilies(dataSource);
    console.log(`Healthy Families staging invitation: ${result.invitationUrl}`);
  } finally {
    await dataSource.destroy();
  }
}

if (require.main === module) {
  void run().catch((error: unknown) => {
    console.error('Staging Healthy Families seed failed.', error);
    process.exitCode = 1;
  });
}
