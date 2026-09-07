import * as WebBrowser from "expo-web-browser"
import { WorkspacesScreen } from "../src/features/workspaces/workspaces-screen"

async function openWorkspaceOnboarding() {
  const appURL = process.env.EXPO_PUBLIC_APP_URL
  if (!appURL) throw new Error("EXPO_PUBLIC_APP_URL is required")
  await WebBrowser.openBrowserAsync(
    new URL("/onboarding/workspace", appURL).toString()
  )
}

export default function WorkspacesRoute() {
  return <WorkspacesScreen onCreateWorkspace={openWorkspaceOnboarding} />
}
