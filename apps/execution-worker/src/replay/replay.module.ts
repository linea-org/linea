import { Module } from "@nestjs/common"
import { GraphModule } from "../graph/graph.module"
import { ReplayConsumer } from "./replay.consumer"
import { ReplayService } from "./replay.service"

@Module({
  imports: [GraphModule],
  providers: [ReplayService, ReplayConsumer],
})
export class ReplayModule {}
