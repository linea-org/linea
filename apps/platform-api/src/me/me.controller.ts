import { Controller, Get } from '@nestjs/common'
import { Session, type UserSession } from '@thallesp/nestjs-better-auth'
import type { auth } from '@linea/auth'

@Controller('me')
export class MeController {
  @Get()
  getMe(@Session() session: UserSession<typeof auth>) {
    return {
      user: session.user,
      session: session.session,
    }
  }
}
