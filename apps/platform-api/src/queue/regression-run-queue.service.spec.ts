import { RegressionRunQueueService } from './regression-run-queue.service'
import * as queueLib from '@linea/queue'

jest.mock('@linea/queue', () => ({
  createConnection: jest.fn(() => ({ quit: jest.fn() })),
  createWorkflowRegressionRunQueue: jest.fn(() => ({ close: jest.fn() })),
  enqueueWorkflowRegressionRun: jest.fn(),
}))

const job = {
  workspaceId: 'ws1',
  workflowId: 'wf1',
  workflowVersionId: 'v1',
  trigger: 'publish' as const,
}

describe('RegressionRunQueueService', () => {
  afterEach(() => {
    jest.useRealTimers()
    jest.clearAllMocks()
  })

  it('resolves once enqueueing settles before the timeout', async () => {
    ;(queueLib.enqueueWorkflowRegressionRun as jest.Mock).mockResolvedValue(
      undefined,
    )

    const service = new RegressionRunQueueService()
    await expect(service.enqueue(job)).resolves.toBeUndefined()
  })

  // The contract publishVersion's fire-and-forget call site leans on: this must never reject,
  // no matter what goes wrong underneath, since nothing downstream ever awaits or catches it.
  it('never rejects even when the underlying enqueue call rejects', async () => {
    ;(queueLib.enqueueWorkflowRegressionRun as jest.Mock).mockRejectedValue(
      new Error('redis unreachable'),
    )

    const service = new RegressionRunQueueService()
    await expect(service.enqueue(job)).resolves.toBeUndefined()
  })

  it('never rejects if enqueueing does not settle within the timeout', async () => {
    jest.useFakeTimers()
    ;(queueLib.enqueueWorkflowRegressionRun as jest.Mock).mockReturnValue(
      new Promise(() => {}),
    )

    const service = new RegressionRunQueueService()
    const assertion = expect(service.enqueue(job)).resolves.toBeUndefined()

    await jest.advanceTimersByTimeAsync(10_000)
    await assertion
  })
})
