import { Module } from '@nestjs/common';
import { BattlePassModule } from '../battlepass/battlepass.module';
import { TagsController } from './tags.controller';
import { TagsService } from './tags.service';

@Module({
  imports: [BattlePassModule],
  controllers: [TagsController],
  providers: [TagsService],
  exports: [TagsService],
})
export class TagsModule {}
