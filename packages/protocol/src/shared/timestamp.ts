import { z } from "zod"

export const timestampSchema = z.iso.datetime({ offset: true })

export type Timestamp = z.infer<typeof timestampSchema>
