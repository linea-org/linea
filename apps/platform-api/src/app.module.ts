import './env'
import { Module } from '@nestjs/common'
import { AuthModule } from '@thallesp/nestjs-better-auth'
import { auth } from '@linea/auth'
import { ApiKeysModule } from './api-keys/api-keys.module'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { HealthController } from './health/health.controller'
import { MeController } from './me/me.controller'
import { WorkflowsModule } from './workflows/workflows.module'

@Module({
  imports: [
    AuthModule.forRoot({
      auth,
      isGlobal: true,
    }),
    ApiKeysModule,
    WorkflowsModule,
  ],
  controllers: [AppController, HealthController, MeController],
  providers: [AppService],
})
export class AppModule {}
