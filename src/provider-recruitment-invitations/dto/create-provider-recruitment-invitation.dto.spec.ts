import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateProviderRecruitmentInvitationDto } from './create-provider-recruitment-invitation.dto';

const valid = { organisationName: '  Eket General Hospital  ', email: ' CONTACT@Example.COM ', source: 'HEALTH_CHECK_NO_PROVIDER', packageCode: ' complete ', fulfilmentModeCode: ' provider_location ' };
const transform = async (input: object) => {
  const value = plainToInstance(CreateProviderRecruitmentInvitationDto, input);
  return { value, errors: await validate(value) };
};

describe('CreateProviderRecruitmentInvitationDto', () => {
  it('normalizes strings, email, and catalogue codes', async () => {
    const { value, errors } = await transform(valid);
    expect(errors).toEqual([]);
    expect(value).toMatchObject({ organisationName: 'Eket General Hospital', email: 'contact@example.com', packageCode: 'COMPLETE', fulfilmentModeCode: 'PROVIDER_LOCATION' });
  });

  it.each([
    [{ ...valid, email: 'invalid' }, 'email'],
    [{ ...valid, source: 'FIND_CARE_NO_PROVIDER' }, 'source'],
    [{ ...valid, organisationName: '   ' }, 'organisationName'],
    [{ ...valid, phone: 'not-a-phone' }, 'phone'],
    [{ ...valid, preferredTime: '25:90' }, 'preferredTime'],
  ])('rejects invalid external input %#', async (input, property) => {
    const { errors } = await transform(input);
    expect(errors).toEqual(expect.arrayContaining([expect.objectContaining({ property })]));
  });
});
