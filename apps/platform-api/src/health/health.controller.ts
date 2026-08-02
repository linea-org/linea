import { Controller, Get } from '@nestjs/common'
import { AllowAnonymous } from '@thallesp/nestjs-better-auth'

@Controller('health')
export class HealthController {
  @Get()
  @AllowAnonymous()
  check() {
    return {
      status: 'ok',
      service: 'platform-api',
      timestamp: new Date().toISOString(),
    }
  }
}
