import { Module } from '@nestjs/common';
import { AdminGuard } from '../admin/guards/admin.guard';
import { EnglishController } from './english.controller';
import { EnglishService } from './english.service';

/**
 * Учебник английского в админке. Раздел изолирован: снаружи берёт только
 * Prisma и guard'ы, продукт от него не берёт ничего — снос и перенос описаны в
 * `frontend/src/views/english/README.md`.
 */
@Module({
  controllers: [EnglishController],
  providers: [EnglishService, AdminGuard],
})
export class EnglishModule {}
