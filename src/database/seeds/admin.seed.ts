import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';

import dataSource from '../data-source';
import { User } from '../../users/entities/user.entity';
import { UserCredential } from '../../users/entities/user-credential.entity';
import { UserRole } from '../../users/enums/user-role.enum';
import { UserStatus } from '../../users/enums/user-status.enum';

const BCRYPT_ROUNDS = 12;

export async function seedAdmin(connection: DataSource): Promise<void> {
  const email = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  const displayName =
    process.env.INITIAL_ADMIN_NAME?.trim() || 'SmartClinic Administrator';

  if (!email) {
    throw new Error('INITIAL_ADMIN_EMAIL is required.');
  }

  if (!password) {
    throw new Error('INITIAL_ADMIN_PASSWORD is required.');
  }

  if (password.length < 6) {
    throw new Error(
      'INITIAL_ADMIN_PASSWORD must contain at least 12 characters.',
    );
  }

  await connection.transaction(async (manager) => {
    const userRepository = manager.getRepository(User);
    const credentialRepository = manager.getRepository(UserCredential);

    const existingUser = await userRepository.findOne({
      where: {
        emailNormalized: email,
      },
      relations: {
        credential: true,
      },
    });

    if (existingUser) {
      /*
       * Don't silently promote an existing account to ADMIN.
       * This avoids accidentally turning a normal patient/provider account
       * into an administrator simply because its email was configured.
       */
      if (!existingUser.roles.includes(UserRole.ADMIN)) {
        throw new Error(
          `User ${email} already exists but is not an ADMIN. ` +
            'Refusing to modify the existing account.',
        );
      }

      if (!existingUser.credential) {
        throw new Error(
          `Admin ${email} exists but has no credential. ` +
            'Refusing to modify the account automatically.',
        );
      }

      console.log(`Initial admin already exists: ${email}`);
      return;
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const user = userRepository.create({
      email,
      emailNormalized: email,
      displayName,
      status: UserStatus.ACTIVE,
      roles: [UserRole.ADMIN],
    });

    const savedUser = await userRepository.save(user);

    const credential = credentialRepository.create({
      userId: savedUser.id,
      passwordHash,
    });

    await credentialRepository.save(credential);

    console.log(`Initial admin created: ${email}`);
  });
}

async function run(): Promise<void> {
  await dataSource.initialize();

  try {
    await seedAdmin(dataSource);
    console.log('Initial admin seed completed.');
  } finally {
    await dataSource.destroy();
  }
}

if (require.main === module) {
  void run().catch((error: unknown) => {
    console.error('Initial admin seed failed.', error);
    process.exitCode = 1;
  });
}