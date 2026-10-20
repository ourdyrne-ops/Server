import { Test, TestingModule } from '@nestjs/testing';
import { JobsService } from './jobs.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MediaProcessor } from '../media/media.processor.js';

describe('JobsService', () => {
  let service: JobsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobsService,
        {
          provide: PrismaService,
          useValue: {},
        },
        {
          provide: MediaProcessor,
          useValue: {},
        }
      ],
    }).compile();

    service = module.get<JobsService>(JobsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
