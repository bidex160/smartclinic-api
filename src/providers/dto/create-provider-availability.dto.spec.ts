import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateProviderAvailabilityDto } from './create-provider-availability.dto';
import { DayOfWeek } from '../enums/day-of-week.enum';
const valid = { dayOfWeek: DayOfWeek.MONDAY, startTime: '09:00', endTime: '17:00', timezone: 'Africa/Lagos' };
describe('CreateProviderAvailabilityDto', () => {
  it('accepts an IANA timezone and weekly times', async () => expect(await validate(plainToInstance(CreateProviderAvailabilityDto, valid))).toHaveLength(0));
  it('rejects an invalid timezone', async () => expect(await validate(plainToInstance(CreateProviderAvailabilityDto, { ...valid, timezone: 'Lagos' }))).not.toHaveLength(0));
  it('rejects malformed times', async () => expect(await validate(plainToInstance(CreateProviderAvailabilityDto, { ...valid, startTime: '25:00' }))).not.toHaveLength(0));
  it('accepts a nullable or valid booking stop time', async () => { expect(await validate(plainToInstance(CreateProviderAvailabilityDto, { ...valid, bookingStopTime: null }))).toHaveLength(0); expect(await validate(plainToInstance(CreateProviderAvailabilityDto, { ...valid, bookingStopTime: '16:30' }))).toHaveLength(0); });
});
