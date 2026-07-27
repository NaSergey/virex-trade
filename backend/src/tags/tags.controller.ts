import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TagsService } from './tags.service';
import {
  CreateSavedComboDto,
  CreateTagDto,
  DismissComboDto,
  MergeTagDto,
  SetPositionTagsDto,
  SetTradeTagsDto,
  UpdateSavedComboDto,
  UpdateTagDto,
} from './dto/tags.dto';

@UseGuards(JwtAuthGuard)
@Controller('api/tags')
export class TagsController {
  constructor(private readonly tags: TagsService) {}

  @Get()
  list(@CurrentUser('userId') userId: string) {
    return this.tags.list(userId);
  }

  @Post()
  create(@CurrentUser('userId') userId: string, @Body() dto: CreateTagDto) {
    return this.tags.create(userId, dto.name, dto.type);
  }

  // Pin a user-composed combination card (counts trades containing all tags).
  @Post('combos')
  createSavedCombo(@CurrentUser('userId') userId: string, @Body() dto: CreateSavedComboDto) {
    return this.tags.createSavedCombo(userId, dto.tagIds);
  }

  // Toggle pin state and/or edit the tag set — never deletes the card.
  @Patch('combos/:id')
  updateSavedCombo(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateSavedComboDto,
  ) {
    return this.tags.updateSavedCombo(id, userId, dto);
  }

  // Explicit, deliberate delete — as opposed to unpinning (see updateSavedCombo).
  @Delete('combos/:id')
  deleteSavedCombo(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.tags.deleteSavedCombo(id, userId);
  }

  // Hide an auto-derived combo card from the grid going forward.
  @Post('combos/dismiss')
  dismissCombo(@CurrentUser('userId') userId: string, @Body() dto: DismissComboDto) {
    return this.tags.dismissCombo(userId, dto.tagIds);
  }

  // Rename / re-categorize a tag (links stay, stats keep working).
  @Patch(':id')
  update(@CurrentUser('userId') userId: string, @Param('id') id: string, @Body() dto: UpdateTagDto) {
    return this.tags.update(id, userId, dto);
  }

  // Merge tag :id into dto.intoTagId, moving all links; :id is deleted.
  @Post(':id/merge')
  merge(@CurrentUser('userId') userId: string, @Param('id') id: string, @Body() dto: MergeTagDto) {
    return this.tags.merge(userId, id, dto.intoTagId);
  }

  // Current tag set of an open position.
  @Get('position')
  positionTags(
    @CurrentUser('userId') userId: string,
    @Query('symbol') symbol: string,
    @Query('direction') direction: string,
  ) {
    return this.tags.positionTags(userId, symbol ?? '', direction ?? '');
  }

  // Replace the tag set of an open position (empty tagIds clears it).
  @Put('position')
  setPositionTags(@CurrentUser('userId') userId: string, @Body() dto: SetPositionTagsDto) {
    return this.tags.setPositionTags(userId, dto.symbol, dto.direction, dto.tagIds);
  }

  // Replace the tag set of a single closed trade (empty tagIds clears it).
  @Put('trade/:tradeId')
  setTradeTags(
    @CurrentUser('userId') userId: string,
    @Param('tradeId') tradeId: string,
    @Body() dto: SetTradeTagsDto,
  ) {
    return this.tags.setTradeTags(userId, tradeId, dto.tagIds);
  }

  @Delete(':id')
  remove(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.tags.remove(id, userId);
  }
}
