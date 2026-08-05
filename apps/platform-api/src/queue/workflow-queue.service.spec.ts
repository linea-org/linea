import { WorkflowQueueService } from './workflow-queue.service'
import * as queueLib from '@linea/queue'

jest.mock('@linea/queue', () => ({
  createConnection: jest.fn(() => ({ quit: jest.fn() })),
  createWorkflowExecutionQueue: jest.fn(() => ({ close: jest.fn() })),
  enqueueWorkflowExecution: jest.fn(),
}))

describe('WorkflowQueueService', () => {
  afterEach(() => {
    jest.useRealTimers()
    jest.clearAllMocks()
  })

  it('rejects if enqueueing does not settle within the timeout', async () => {
    jest.useFakeTimers()
    ;(queueLib.enqueueWorkflowExecution as jest.Mock).mockReturnValue(
      new Promise(() => {}),
    )

    const service = new WorkflowQueueService()
    const assertion = expect(service.enqueue('exec-1')).rejects.toThrow(
      /Timed out enqueueing/,
    )

    await jest.advanceTimersByTimeAsync(10_000)
    await assertion
  })

  it('resolves once enqueueing settles before the timeout', async () => {
    ;(queueLib.enqueueWorkflowExecution as jest.Mock).mockResolvedValue(
      undefined,
    )

    const service = new WorkflowQueueService()
    await expect(service.enqueue('exec-1')).resolves.toBeUndefined()
  })
})
