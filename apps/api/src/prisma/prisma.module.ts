import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Global module so any feature module can inject PrismaService without
 * re-importing PrismaModule everywhere. Real DB wiring lands in Phase 2.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
