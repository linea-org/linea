import { Module } from "@nestjs/common"
import { GraphModule } from "../graph/graph.module"
import { EvalExecutionService } from "./eval-execution.service"

@Module({
  imports: [GraphModule],
  providers: [EvalExecutionService],
  exports: [EvalExecutionService],
})
export class EvalsModule {}
