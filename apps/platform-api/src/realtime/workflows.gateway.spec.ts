import { type INestApplication, Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { IoAdapter } from '@nestjs/platform-socket.io'
import { io, type Socket } from 'socket.io-client'
import { RealtimeTokenService } from './realtime-token.service'
import { WorkflowsGateway } from './workflows.gateway'

@Module({ providers: [RealtimeTokenService, WorkflowsGateway] })
class RealtimeTestModule {}

function connect(client: Socket): Promise<void> {
  return new Promise((resolve, reject) => {
    client.once('connect', resolve)
    client.once('connect_error', reject)
  })
}

describe('workflow realtime boundary', () => {
  let app: INestApplication
  let client: Socket
  beforeAll(async () => {
    app = await NestFactory.create(RealtimeTestModule, { logger: false })
    app.useWebSocketAdapter(new IoAdapter(app))
    await app.listen(0)
  })
  afterAll(async () => {
    client?.disconnect()
    await app.close()
  })
  it('connects to /v1/workflows over /v1/socket.io', async () => {
    const { token } = app.get(RealtimeTokenService).mint({
      userId: 'user-1',
      name: 'Ada Lovelace',
      image: null,
      workspaceId: 'workspace-1',
      workflowId: 'workflow-1',
    })
    client = io(`${await app.getUrl()}/v1/workflows`, {
      path: '/v1/socket.io',
      transports: ['websocket'],
      auth: { token },
      reconnection: false,
    })
    await connect(client)
    expect(client.connected).toBe(true)
  })
})
