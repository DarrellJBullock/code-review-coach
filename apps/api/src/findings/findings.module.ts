import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { FindingsController } from './findings.controller';
import { FindingsService } from './findings.service';

/**
 * Real FindingsModule (Phase 6). AuthModule/UsersModule imported explicitly
 * for the same reason ReviewsModule imports them — SessionAuthGuard's
 * constructor dependency (UsersService) needs to resolve directly against
 * this module's DI graph.
 */
@Module({
  imports: [AuthModule, UsersModule],
  controllers: [FindingsController],
  providers: [FindingsService],
  exports: [FindingsService],
})
export class FindingsModule {}
