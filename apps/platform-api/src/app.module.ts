import './env'
import { Module } from '@nestjs/common'
import { AuthModule } from '@thallesp/nestjs-better-auth'
import { auth } from '@linea/auth'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { HealthController } from './health/health.controller'
import { MeController } from './me/me.controller'

@Module({
  imports: [
    AuthModule.forRoot({
      auth,
      isGlobal: true,
    }),
  ],
  controllers: [AppController, HealthController, MeController],
  providers: [AppService],
})
export class AppModule {}
