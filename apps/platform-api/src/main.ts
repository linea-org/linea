import '@linea/config/env'
import type { NextFunction, Request, Response } from 'express'
import helmet from 'helmet'
import { NestFactory } from '@nestjs/core'
import { IoAdapter } from '@nestjs/platform-socket.io'
import { enabledSocialProviders } from '@linea/auth'
import { AppModule } from './app.module'
import { bigIntJsonReplacer } from './common/bigint-json-replacer'
import { getTrustedOrigins, isTrustedOrigin } from './common/trusted-origin'

function normalizeClientIp(raw: string | undefined) {
  if (!raw) return '127.0.0.1'
  if (raw === '::1' || raw === '::ffff:127.0.0.1') return '127.0.0.1'
  return raw.startsWith('::ffff:') ? raw.slice('::ffff:'.length) : raw
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
  })

  const expressApp = app.getHttpAdapter().getInstance() as {
    set: (key: string, value: unknown) => void
  }
  expressApp.set('trust proxy', 1)
  expressApp.set('json replacer', bigIntJsonReplacer)
  app.useWebSocketAdapter(new IoAdapter(app))

  app.use((req: Request, _res: Response, next: NextFunction) => {
    const ip = normalizeClientIp(req.socket.remoteAddress)
    if (!req.headers['x-real-ip']) {
      req.headers['x-real-ip'] = ip
    }
    if (!req.headers['x-forwarded-for']) {
      req.headers['x-forwarded-for'] = ip
    }
    next()
  })

  const trustedOrigins = getTrustedOrigins()

  app.use(
    helmet({
      contentSecurityPolicy: process.env.NODE_ENV === 'production',
      crossOriginEmbedderPolicy: false,
    }),
  )

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin || isTrustedOrigin(origin, trustedOrigins)) {
        callback(null, true)
        return
      }
      callback(new Error(`Origin ${origin} not allowed by CORS`), false)
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
  })

  await app.listen(process.env.PORT ?? 3000)

  const oauth =
    enabledSocialProviders.length > 0
      ? enabledSocialProviders.join(', ')
      : 'none'
  console.log(`OAuth providers: ${oauth}`)
}

void bootstrap()
