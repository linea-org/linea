import { Redirect } from "expo-router"
import { useMobileAuth } from "../src/auth/mobile-auth"

export default function Index() {
  const { data: session } = useMobileAuth().useSession()
  if (!session) return <Redirect href="/sign-in" />
  return (
    <Redirect
      href={session.session.activeOrganizationId ? "/monitor" : "/workspaces"}
    />
  )
}
