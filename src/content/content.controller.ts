import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, Req } from '@nestjs/common';
import { ContentService } from './content.service.js';
import { MediaType } from '@prisma/client';
import { Public } from '../auth/decorators/public.decorator.js';

@Public()
@Controller('content')
export class ContentController {
  constructor(private readonly contentService: ContentService) {}

  @Get()
  async findAll(
    @Query('type') type?: MediaType,
    @Query('categoryId') categoryId?: string,
    @Query('all') all?: string,
    @Req() req?: any,
  ) {
    const studentId = req?.user?.id;
    const isAdmin = req?.user?.role === 'SUPER_ADMIN' || req?.user?.role === 'ADMIN' || all === 'true';
    return this.contentService.findAll({ mediaType: type, categoryId, studentId, all: isAdmin });
  }

  @Get('categories')
  async getCategories() {
    return this.contentService.getCategories();
  }

  @Get('search')
  async search(@Query('q') query: string) {
    return this.contentService.search(query);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req?: any) {
    const studentId = req?.user?.id;
    return this.contentService.findOne(id, studentId);
  }

  @Post()
  async create(@Body() body: any, @Req() req?: any) {
    const userId = req?.user?.email || req?.user?.id || 'admin@admin.com';
    return this.contentService.create({ ...body, userId });
  }

  @Put(':id')
  async updatePut(@Param('id') id: string, @Body() body: any) {
    return this.contentService.update(id, body);
  }

  @Patch(':id')
  async updatePatch(@Param('id') id: string, @Body() body: any) {
    return this.contentService.update(id, body);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.contentService.delete(id);
  }
}
