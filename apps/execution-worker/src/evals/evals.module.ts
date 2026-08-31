import { Module } from "@nestjs/common"
import { GraphModule } from "../graph/graph.module"
import { EvalExecutionService } from "./eval-execution.service"
import { EvalRunConsumer } from "./eval-run.consumer"

@Module({
  imports: [GraphModule],
  providers: [EvalExecutionService, EvalRunConsumer],
  exports: [EvalExecutionService],
})
export class EvalsModule {}
