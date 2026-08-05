import { Module } from "@nestjs/common"
import { CheckpointsModule } from "./checkpoints/checkpoints.module"
import { GraphModule } from "./graph/graph.module"
import { RunsModule } from "./runs/runs.module"

@Module({
  imports: [CheckpointsModule, GraphModule, RunsModule],
})
export class AppModule {}
