import { NotFoundException, type ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { isFlagEnabled } from '@linealabs/flags'
import type { AuthenticatedRequest } from '../auth/workspace-auth.guard'
import { FeatureFlagGuard, RequireFlag } from './require-flag'

jest.mock('@linealabs/flags', () => ({ isFlagEnabled: jest.fn() }))

class FakeController {
  @RequireFlag('platformModelKey')
  flaggedAction() {}
}

// Only ever read for Reflector metadata lookup, never invoked with `this`.
// eslint-disable-next-line @typescript-eslint/unbound-method
const flaggedHandler = new FakeController().flaggedAction

function contextFor(request: Partial<AuthenticatedRequest>) {
  return {
    getHandler: () => flaggedHandler,
    getClass: () => FakeController,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext
}

describe('RequireFlag', () => {
  const guard = new FeatureFlagGuard(new Reflector())
  const flagEnabled = jest.mocked(isFlagEnabled)

  afterEach(() => flagEnabled.mockReset())

  it('lets the request through when the flag is on for its workspace', async () => {
    flagEnabled.mockResolvedValue(true)
    await expect(
      guard.canActivate(contextFor({ workspaceId: 'ws-1' })),
    ).resolves.toBe(true)
    expect(flagEnabled).toHaveBeenCalledWith('platformModelKey', 'ws-1')
  })

  it('answers 404 when the flag is off for its workspace', async () => {
    flagEnabled.mockResolvedValue(false)
    await expect(
      guard.canActivate(contextFor({ workspaceId: 'ws-1' })),
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('refuses to evaluate without a workspace', async () => {
    await expect(guard.canActivate(contextFor({}))).rejects.toThrow(
      'RequireFlag needs WorkspaceAuthGuard to run first',
    )
    expect(flagEnabled).not.toHaveBeenCalled()
  })
})
