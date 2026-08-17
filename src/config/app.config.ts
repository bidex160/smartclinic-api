import { registerAs } from '@nestjs/config';

import { createAppConfiguration } from './environment';

export const appConfig = registerAs('app', () => createAppConfiguration());
