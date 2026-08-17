import { FulfilmentMode } from './entities/fulfilment-mode.entity';
import { FulfilmentModesService } from './fulfilment-modes.service';

describe('FulfilmentModesService', () => {
  it('returns only active modes through the public response DTO', async () => {
    const fulfilmentModeRepository = {
      find: jest.fn().mockResolvedValue([
        {
          id: 'c67a8f4a-7338-42b4-a2c3-303c7d8d77b4',
          code: 'HOME_VISIT',
          name: 'Home visit',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as FulfilmentMode,
      ]),
    };
    const service = new FulfilmentModesService(fulfilmentModeRepository as never);

    await expect(service.findActive()).resolves.toEqual([
      {
        id: 'c67a8f4a-7338-42b4-a2c3-303c7d8d77b4',
        code: 'HOME_VISIT',
        name: 'Home visit',
        isActive: true,
      },
    ]);
    expect(fulfilmentModeRepository.find).toHaveBeenCalledWith({
      where: { isActive: true },
      order: { name: 'ASC' },
    });
  });
});
