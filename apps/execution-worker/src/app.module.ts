import { Module } from "@nestjs/common"
import { CheckpointsModule } from "./checkpoints/checkpoints.module"
import { RegressionsModule } from "./regressions/regressions.module"
import { GraphModule } from "./graph/graph.module"
import { ReplayModule } from "./replay/replay.module"
import { RunsModule } from "./runs/runs.module"

@Module({
  imports: [
    CheckpointsModule,
    GraphModule,
    RunsModule,
    ReplayModule,
    RegressionsModule,
  ],
})
export class AppModule {}
