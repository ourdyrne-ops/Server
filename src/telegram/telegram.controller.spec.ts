import { Test, TestingModule } from '@nestjs/testing';
import { TelegramController } from './telegram.controller.js';
import { TelegramService } from './telegram.service.js';
import { PaymentsService } from '../payments/payments.service.js';

describe('TelegramController', () => {
  let controller: TelegramController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TelegramController],
      providers: [
        {
          provide: TelegramService,
          useValue: {},
        },
        {
          provide: PaymentsService,
          useValue: {
            extendStudentSubscription: vitest.fn(),
            updateStudentStatus: vitest.fn(),
          },
        },
      ]
    }).compile();

    controller = module.get<TelegramController>(TelegramController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
