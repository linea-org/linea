import { applicationKeyScopes } from '@linea/protocol/resources'
import { createApplicationKeySchema } from './create-application-key.dto'

describe('createApplicationKeySchema', () => {
  it('accepts the complete explicit Application scope set', () => {
    expect(
      createApplicationKeySchema.parse({
        name: 'Production backend',
        scopes: applicationKeyScopes,
      }),
    ).toMatchObject({ scopes: applicationKeyScopes })
  })

  it('rejects empty, duplicate, and unknown scopes', () => {
    expect(
      createApplicationKeySchema.safeParse({ name: 'Key', scopes: [] }).success,
    ).toBe(false)
    expect(
      createApplicationKeySchema.safeParse({
        name: 'Key',
        scopes: ['executions:start', 'executions:start'],
      }).success,
    ).toBe(false)
    expect(
      createApplicationKeySchema.safeParse({
        name: 'Key',
        scopes: ['applications:admin'],
      }).success,
    ).toBe(false)
  })
})
