import "@linea/config/env"
import { NestFactory } from "@nestjs/core"
import { AppModule } from "./app.module"

async function bootstrap() {
  await NestFactory.createApplicationContext(AppModule)
  console.log("execution-worker started, consuming workflow-execution queue")
}

void bootstrap()
