import 'dotenv/config'
import type { Request } from 'express'
import helmet from 'helmet'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { IoAdapter } from '@nestjs/platform-socket.io'
import { enabledSocialProviders } from '@linea/auth'
import { AppModule } from './app.module'
import { API_PREFIX } from './common/api-prefix'
import { configureAuthClientIp } from './common/auth-client-ip'
import { bigIntJsonReplacer } from './common/bigint-json-replacer'
import {
  getTrustedOrigins,
  isTrustedOrigin,
  usesEnvironmentOriginPolicy,
} from './common/trusted-origin'

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  })
  app.setGlobalPrefix(API_PREFIX)
  app.set('json replacer', bigIntJsonReplacer)
  configureAuthClientIp(app, process.env.TRUSTED_PROXIES)
  app.useWebSocketAdapter(new IoAdapter(app))
  const trustedOrigins = getTrustedOrigins()
  app.use(
    helmet({
      contentSecurityPolicy: process.env.NODE_ENV === 'production',
      crossOriginEmbedderPolicy: false,
    }),
  )
  app.enableCors(
    (
      request: Request,
      callback: (error: Error | null, options: object) => void,
    ) => {
      const origin = request.headers.origin
      const allowed =
        !origin ||
        usesEnvironmentOriginPolicy(request.path) ||
        isTrustedOrigin(origin, trustedOrigins)
      callback(
        allowed ? null : new Error(`Origin ${origin} not allowed by CORS`),
        {
          origin: allowed,
          credentials: true,
          methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
          allowedHeaders: [
            'Content-Type',
            'Authorization',
            'Cookie',
            'DPoP',
            'Idempotency-Key',
            'Last-Event-ID',
          ],
          exposedHeaders: [
            'DPoP-Nonce',
            'Location',
            'Retry-After',
            'X-RateLimit-Limit',
            'X-RateLimit-Remaining',
            'X-RateLimit-Reset',
          ],
        },
      )
    },
  )
  await app.listen(process.env.PORT ?? 3000)
  const oauth =
    enabledSocialProviders.length > 0
      ? enabledSocialProviders.join(', ')
      : 'none'
  console.log(`OAuth providers: ${oauth}`)
}

void bootstrap()
