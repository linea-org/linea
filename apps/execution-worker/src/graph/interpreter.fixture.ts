import type { CheckpointsService } from "../checkpoints/checkpoints.service"
import { InterpreterService } from "./interpreter.service"
import { AiNode } from "./nodes/ai.node"
import { ApprovalNode } from "./nodes/approval.node"
import { BranchNode } from "./nodes/branch.node"
import { DatetimeNode } from "./nodes/datetime.node"
import { FilterNode } from "./nodes/filter.node"
import { HttpNode } from "./nodes/http.node"
import { MemoryNode } from "./nodes/memory.node"
import { MergeNode } from "./nodes/merge.node"
import { TransformNode } from "./nodes/transform.node"
import { VariablesNode } from "./nodes/variables.node"
import { WaitNode } from "./nodes/wait.node"

export function createInterpreter(
  checkpoints: CheckpointsService,
  {
    http = new HttpNode(),
    ai = new AiNode(),
    approval = new ApprovalNode(),
  } = {}
): InterpreterService {
  return new InterpreterService(
    checkpoints,
    http,
    new TransformNode(),
    new BranchNode(),
    ai,
    approval,
    new MemoryNode(),
    new WaitNode(),
    new DatetimeNode(),
    new FilterNode(),
    new MergeNode(),
    new VariablesNode()
  )
}
