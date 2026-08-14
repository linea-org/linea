import type { MouseEvent, ReactNode } from "react"
import { Link } from "@tanstack/react-router"

import type { NotificationTarget } from "./resolve-notification-target"

export function NotificationTargetLink({
  slug,
  target,
  className,
  onClick,
  children,
}: {
  slug: string
  target: NotificationTarget
  className?: string
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void
  children: ReactNode
}) {
  switch (target.kind) {
    case "execution":
      return (
        <Link
          to="/w/$slug/workflows/$workflowId/executions/$executionId"
          params={{
            slug,
            workflowId: target.workflowId,
            executionId: target.executionId,
          }}
          className={className}
          onClick={onClick}
        >
          {children}
        </Link>
      )
    case "workflow":
      return (
        <Link
          to="/w/$slug/workflows/$workflowId"
          params={{ slug, workflowId: target.workflowId }}
          className={className}
          onClick={onClick}
        >
          {children}
        </Link>
      )
    case "workflows":
      return (
        <Link
          to="/w/$slug/workflows"
          params={{ slug }}
          className={className}
          onClick={onClick}
        >
          {children}
        </Link>
      )
    case "members":
      return (
        <Link
          to="/w/$slug/settings/members"
          params={{ slug }}
          className={className}
          onClick={onClick}
        >
          {children}
        </Link>
      )
    case "settings":
      return (
        <Link
          to="/w/$slug/settings"
          params={{ slug }}
          className={className}
          onClick={onClick}
        >
          {children}
        </Link>
      )
    default: {
      const exhaustive: never = target
      return exhaustive
    }
  }
}
