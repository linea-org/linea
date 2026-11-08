import { AgentExecutionService } from "./agent-execution.service"
import { ConnectorGatewayService } from "../connectors/connector-gateway.service"
import { Module } from "@nestjs/common"
import { CheckpointsModule } from "../checkpoints/checkpoints.module"
import { GraphModule } from "../graph/graph.module"
import { RunLeaseService } from "./run-lease.service"
import { RunsConsumer } from "./runs.consumer"
import { RunsService } from "./runs.service"

@Module({
  imports: [CheckpointsModule, GraphModule],
  providers: [
    AgentExecutionService,
    ConnectorGatewayService,
    RunsService,
    RunLeaseService,
    RunsConsumer,
  ],
})
export class RunsModule {}
