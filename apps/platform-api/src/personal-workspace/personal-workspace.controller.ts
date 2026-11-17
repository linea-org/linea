import { Controller, ForbiddenException, Post } from '@nestjs/common'
import { Session, type UserSession } from '@thallesp/nestjs-better-auth'
import { PERSONAL_WORKSPACE_METADATA } from '@linealabs/auth/personal-workspace'
import type { auth } from '@linealabs/auth'
import { db, repositories } from '@linealabs/db'

@Controller('personal-workspace')
export class PersonalWorkspaceController {
  @Post()
  ensure(@Session() session: UserSession<typeof auth>) {
    if (!session.user.emailVerified) {
      throw new ForbiddenException('Verify your email first')
    }
    return repositories.personalWorkspace.ensurePersonalWorkspace(
      db,
      session.user,
      JSON.stringify(PERSONAL_WORKSPACE_METADATA),
    )
  }
}
