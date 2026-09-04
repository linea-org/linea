import { Module } from "@nestjs/common"
import { CheckpointsModule } from "./checkpoints/checkpoints.module"
import { EvalsModule } from "./evals/evals.module"
import { GraphModule } from "./graph/graph.module"
import { ReplayModule } from "./replay/replay.module"
import { RunsModule } from "./runs/runs.module"

@Module({
  imports: [
    CheckpointsModule,
    GraphModule,
    RunsModule,
    ReplayModule,
    EvalsModule,
  ],
})
export class AppModule {}
