import { Redirect } from "expo-router"
import { useMobileAuth } from "../src/auth/mobile-auth"

export default function Index() {
  const { data: session } = useMobileAuth().useSession()
  return <Redirect href={session ? "/workspaces" : "/sign-in"} />
}
