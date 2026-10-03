import { environmentKeyScopes } from '@linea/protocol/resources'
import { createEnvironmentKeySchema } from './create-environment-key.dto'

describe('createEnvironmentKeySchema', () => {
  it('accepts the complete explicit Environment scope set', () => {
    expect(
      createEnvironmentKeySchema.parse({
        name: 'Production backend',
        scopes: environmentKeyScopes,
      }),
    ).toMatchObject({ scopes: environmentKeyScopes })
  })
  it('rejects empty, duplicate, and unknown scopes', () => {
    expect(
      createEnvironmentKeySchema.safeParse({ name: 'Key', scopes: [] }).success,
    ).toBe(false)
    expect(
      createEnvironmentKeySchema.safeParse({
        name: 'Key',
        scopes: ['executions:start', 'executions:start'],
      }).success,
    ).toBe(false)
    expect(
      createEnvironmentKeySchema.safeParse({
        name: 'Key',
        scopes: ['environments:admin'],
      }).success,
    ).toBe(false)
  })
})
