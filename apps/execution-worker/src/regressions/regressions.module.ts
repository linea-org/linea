import { Module } from "@nestjs/common"
import { GraphModule } from "../graph/graph.module"
import { RegressionExecutionService } from "./regression-execution.service"
import { RegressionRunConsumer } from "./regression-run.consumer"

@Module({
  imports: [GraphModule],
  providers: [RegressionExecutionService, RegressionRunConsumer],
  exports: [RegressionExecutionService],
})
export class RegressionsModule {}
