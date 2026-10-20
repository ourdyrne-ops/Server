import { Controller, Get, Post, Body, Param, Req } from '@nestjs/common';
import { ProgressService } from './progress.service.js';
import { IsNumber, IsBoolean, IsOptional } from 'class-validator';

class UpdateProgressDto {
  @IsNumber()
  @IsOptional()
  last_position?: number;

  @IsBoolean()
  @IsOptional()
  completed?: boolean;

  @IsBoolean()
  @IsOptional()
  opened?: boolean;
}

@Controller('progress')
export class ProgressController {
  constructor(private readonly progressService: ProgressService) {}

  @Get()
  async getAllProgress(@Req() req: any) {
    return this.progressService.getProgress(req.user.id);
  }

  @Get(':contentId')
  async getContentProgress(@Param('contentId') contentId: string, @Req() req: any) {
    return this.progressService.getProgress(req.user.id, contentId);
  }

  @Post(':contentId')
  async updateProgress(
    @Param('contentId') contentId: string,
    @Body() dto: UpdateProgressDto,
    @Req() req: any,
  ) {
    return this.progressService.updateProgress(req.user.id, contentId, dto);
  }
}
