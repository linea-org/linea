import "dotenv/config"
import { Logger } from "@nestjs/common"
import { NestFactory } from "@nestjs/core"
import { AppModule } from "./app.module"

async function bootstrap() {
  await NestFactory.createApplicationContext(AppModule)
  new Logger("Bootstrap").log(
    "execution-worker started, consuming workflow-execution queue"
  )
}

void bootstrap()
