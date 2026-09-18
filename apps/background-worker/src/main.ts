import "@linea/config/env"
import { Logger } from "@nestjs/common"
import { NestFactory } from "@nestjs/core"
import { AppModule } from "./app.module"

async function bootstrap() {
  await NestFactory.createApplicationContext(AppModule)
  new Logger("Bootstrap").log("background-worker started")
}

void bootstrap()
