import { Module } from "@nestjs/common"
import { CheckpointsModule } from "../checkpoints/checkpoints.module"
import { InterpreterService } from "./interpreter.service"
import { AiNode } from "./nodes/ai.node"
import { ApprovalNode } from "./nodes/approval.node"
import { BranchNode } from "./nodes/branch.node"
import { HttpNode } from "./nodes/http.node"
import { MemoryNode } from "./nodes/memory.node"
import { TransformNode } from "./nodes/transform.node"

@Module({
  imports: [CheckpointsModule],
  providers: [
    InterpreterService,
    HttpNode,
    TransformNode,
    BranchNode,
    AiNode,
    ApprovalNode,
    MemoryNode,
  ],
  exports: [InterpreterService],
})
export class GraphModule {}
