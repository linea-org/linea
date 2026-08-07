import "./env"
import { NestFactory } from "@nestjs/core"
import { AppModule } from "./app.module"

async function bootstrap() {
  await NestFactory.createApplicationContext(AppModule)
  console.log("background-worker started, polling schedules")
}

void bootstrap()
