import { z } from "zod"

export async function agentApiResponse<T>(
  response: Response,
  schema: z.ZodType<T>
): Promise<T> {
  const body: unknown = await response.json()
  if (!response.ok) {
    if (response.status === 403)
      throw new Error(
        "Agent management requires a signed-in workspace admin or owner."
      )
    const error = z
      .object({
        message: z.union([
          z.string(),
          z.array(z.union([z.string(), z.object({ message: z.string() })])),
        ]),
      })
      .safeParse(body)
    throw new Error(
      error.success
        ? [error.data.message]
            .flat()
            .map((issue) => (typeof issue === "string" ? issue : issue.message))
            .join(" · ")
        : `Agent request failed (${response.status})`
    )
  }
  return schema.parse(body)
}
