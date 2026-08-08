import { Outlet, createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/w/$slug/workflows/$workflowId")({
  component: () => <Outlet />,
})
