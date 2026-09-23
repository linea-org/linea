import { createServer, type IncomingMessage } from 'node:http'

type ProviderRequest = {
  authorization: string | undefined
  method: string | undefined
  path: string
  body: string
}

async function body(request: IncomingMessage): Promise<string> {
  const chunks: Uint8Array[] = []
  for await (const chunk of request) {
    if (!(chunk instanceof Uint8Array)) throw new Error('Invalid provider body')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

export async function startConnectorApiProvider() {
  const requests: ProviderRequest[] = []
  const server = createServer((request, response) => {
    void (async () => {
      const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
      const requestBody = await body(request)
      requests.push({
        authorization: request.headers.authorization,
        method: request.method,
        path,
        body: requestBody,
      })
      if (
        path === '/gmail/v1/users/me/messages' &&
        request.method === 'GET' &&
        request.headers.authorization?.startsWith('Bearer google-access-')
      ) {
        response.writeHead(200, { 'content-type': 'application/json' }).end(
          JSON.stringify({
            messages: [{ id: 'message-one', threadId: 'thread-one' }],
            resultSizeEstimate: 1,
            rawProviderSecret: request.headers.authorization,
          }),
        )
        return
      }
      if (
        path === '/repos/octo/demo/issues' &&
        request.method === 'POST' &&
        request.headers.authorization?.startsWith('Bearer gho_')
      ) {
        const input: unknown = JSON.parse(requestBody)
        if (!input || typeof input !== 'object' || !('title' in input)) {
          response.writeHead(400).end()
          return
        }
        response.writeHead(201, { 'content-type': 'application/json' }).end(
          JSON.stringify({
            id: 42,
            number: 7,
            title: input.title,
            state: 'open',
            html_url: 'https://github.com/octo/demo/issues/7',
            rawProviderSecret: request.headers.authorization,
          }),
        )
        return
      }
      response.writeHead(404).end()
    })().catch((error: unknown) => {
      response.destroy(
        error instanceof Error ? error : new Error(String(error)),
      )
    })
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No API address')
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      }),
  }
}
