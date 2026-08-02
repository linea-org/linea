import { config as loadEnv } from 'dotenv'
import { resolve } from 'node:path'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

const rootDir = resolve(process.cwd(), '../..')

loadEnv({ path: resolve(rootDir, '.env') })
loadEnv({ path: resolve(rootDir, '.env.local') })

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  await app.listen(process.env.PORT ?? 3000)
}
void bootstrap()
