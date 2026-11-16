import { createApplicationFn, listApplicationsFn } from "./applications-api"
import { listEnvironmentsFn } from "./environments-api"
import { STARTER_APPLICATION } from "./starter-workflow"

export async function findOrCreateDefaultApplication() {
  const applications = await listApplicationsFn()
  return (
    applications[0] ??
    (await createApplicationFn({ data: STARTER_APPLICATION }))
  )
}

/** Model keys live in the default Application's Development Environment. */
export async function findOrCreateDevelopmentEnvironment() {
  const application = await findOrCreateDefaultApplication()
  const environments = await listEnvironmentsFn({
    data: { applicationId: application.id },
  })
  const development = environments.find((item) => item.environment === "dev")
  if (!development) throw new Error("Development Environment not found")
  return development
}
