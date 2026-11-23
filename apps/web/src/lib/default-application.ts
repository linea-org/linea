import { createApplicationFn, listApplicationsFn } from "./applications-api"
import { listEnvironmentsFn } from "./environments-api"
import type { ExecutionEnvironment } from "./execution-detail-schema"
import { STARTER_APPLICATION } from "./starter-workflow"

/** The oldest Application, so creating another never moves where keys and chats live. */
export async function findOrCreateDefaultApplication() {
  const applications = await listApplicationsFn()
  return (
    applications.at(-1) ??
    (await createApplicationFn({ data: STARTER_APPLICATION }))
  )
}

/** Model keys live in the default Application's Development Environment. */
export async function findOrCreateDevelopmentEnvironment() {
  const application = await findOrCreateDefaultApplication()
  return getRunEnvironment(application.id, "dev")
}

/** The Environment a run reads its secrets from; a draft runs in Development. */
export async function getRunEnvironment(
  applicationId: string,
  ranIn: ExecutionEnvironment
) {
  const name = ranIn === "production" ? "production" : "dev"
  const environments = await listEnvironmentsFn({ data: { applicationId } })
  const environment = environments.find((item) => item.environment === name)
  if (!environment) throw new Error(`No ${name} Environment found`)
  return environment
}
