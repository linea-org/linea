import { Controller, Get } from '@nestjs/common'
import { Session, type UserSession } from '@thallesp/nestjs-better-auth'
import type { auth } from '@linea/auth'
import { db, repositories } from '@linea/db'

@Controller('me')
export class MeController {
  @Get()
  getMe(@Session() session: UserSession<typeof auth>) {
    return {
      user: session.user,
      session: session.session,
    }
  }

  @Get('workspaces')
  listWorkspaces(@Session() session: UserSession<typeof auth>) {
    return repositories.organization.listUserWorkspaces(db, session.user.id)
  }
}
