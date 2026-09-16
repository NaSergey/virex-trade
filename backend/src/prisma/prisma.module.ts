import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { DataVersionService } from './data-version.service';

// Global so any module can inject PrismaService without re-importing.
@Global()
@Module({
  providers: [PrismaService, DataVersionService],
  exports: [PrismaService, DataVersionService],
})
export class PrismaModule {}
