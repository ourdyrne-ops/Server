import { expect } from 'vitest';
import { vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ContentService } from './content.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('ContentService', () => {
  let service: ContentService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      content: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<ContentService>(ContentService);
  });

  it('findAll should enforce PUBLISHED and VISIBLE status', async () => {
    await service.findAll({});
    expect(prismaMock.content.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'PUBLISHED',
          visibility: 'VISIBLE',
        }),
      })
    );
  });

  it('findOne should enforce PUBLISHED status', async () => {
    prismaMock.content.findFirst.mockResolvedValue({ id: '1' });
    await service.findOne('1', 'student_1');
    
    expect(prismaMock.content.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: '1',
          status: 'PUBLISHED',
        }),
      })
    );
  });

  it('search should enforce PUBLISHED and VISIBLE status', async () => {
    await service.search('query');
    expect(prismaMock.content.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'PUBLISHED',
          visibility: 'VISIBLE',
        }),
      })
    );
  });
});
