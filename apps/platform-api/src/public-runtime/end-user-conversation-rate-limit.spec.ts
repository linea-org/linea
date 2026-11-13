import 'dotenv/config'
import { createHash, randomUUID } from 'node:crypto'
import { pool } from '@linea/db'
import { PublicRuntimeRateLimitException } from './public-runtime-rate-limit.filter'
import { PublicRuntimeService } from './public-runtime.service'

function principal(externalSubjectId: string) {
  return {
    sessionId: randomUUID(),
    workspaceId: randomUUID(),
    environmentId: randomUUID(),
    externalSubjectId,
  }
}

async function rejection(operation: Promise<unknown>) {
  try {
    await operation
  } catch (error) {
    return error
  }
  throw new Error('Expected the conversation start to be rejected')
}

describe('End-user conversation creation limit (Postgres)', () => {
  const runtime = new PublicRuntimeService()
  const subjects = [randomUUID(), randomUUID()]
  beforeAll(() => {
    // Freeze Date at a minute boundary so the counter bucket cannot roll over mid-test.
    jest.useFakeTimers({
      now: Math.ceil(Date.now() / 60_000) * 60_000 + 1_000,
      doNotFake: [
        'hrtime',
        'nextTick',
        'performance',
        'queueMicrotask',
        'setImmediate',
        'clearImmediate',
        'setInterval',
        'clearInterval',
        'setTimeout',
        'clearTimeout',
      ],
    })
  })
  afterAll(async () => {
    const bucket = Math.floor(Date.now() / 60_000)
    jest.useRealTimers()
    await pool.query(
      'DELETE FROM end_user_authorization_rate_limits WHERE key = ANY($1::text[])',
      [
        subjects.map((subject) =>
          createHash('sha256')
            .update(`runtime:conversation:${subject}:${bucket}`)
            .digest('hex'),
        ),
      ],
    )
    await pool.end()
  })

  it('refuses the 21st conversation per External Subject in a minute', async () => {
    const [subject, otherSubject] = subjects
    const input = { workflowId: randomUUID(), metadata: {} }
    for (let attempt = 0; attempt < 20; attempt++) {
      const error = await rejection(
        runtime.createEndUserConversation(
          principal(subject),
          input,
          randomUUID(),
        ),
      )
      expect(error).not.toBeInstanceOf(PublicRuntimeRateLimitException)
    }
    expect(
      await rejection(
        runtime.createEndUserConversation(
          principal(subject),
          input,
          randomUUID(),
        ),
      ),
    ).toBeInstanceOf(PublicRuntimeRateLimitException)
    expect(
      await rejection(
        runtime.createEndUserConversation(
          principal(otherSubject),
          input,
          randomUUID(),
        ),
      ),
    ).not.toBeInstanceOf(PublicRuntimeRateLimitException)
  })
})
