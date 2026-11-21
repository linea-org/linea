import { encodeExecutionListCursor } from './execution-list-cursor'
import { listWorkspaceExecutionsSchema } from './list-workspace-executions.dto'

const id = '0b0f6f0e-6d0a-4f0e-9d53-6f1f3f1c2a11'

describe('listWorkspaceExecutionsSchema', () => {
  it('parses a sort and the cursor issued for it', () => {
    const cursor = encodeExecutionListCursor({ value: 'my_workflow', id })
    expect(
      listWorkspaceExecutionsSchema.parse({ sort: 'workflow.asc', cursor }),
    ).toMatchObject({
      sort: { column: 'workflow', direction: 'asc' },
      cursor: { value: 'my_workflow', id },
    })
  })

  it('accepts a created-at cursor without a sort', () => {
    expect(
      listWorkspaceExecutionsSchema.parse({
        cursor: `2026-09-05T00:00:00.000Z_${id}`,
      }).cursor,
    ).toEqual({ value: '2026-09-05T00:00:00.000Z', id })
  })

  it.each([
    { sort: 'cost.sideways' },
    { sort: 'secret.asc' },
    { cursor: 'not-a-cursor' },
    { cursor: `2026-09-05T00:00:00.000Z_not-a-uuid` },
    { sort: 'cost.desc', cursor: `2026-09-05T00:00:00.000Z_${id}` },
    { sort: 'duration.asc', cursor: `9223372036854775808_${id}` },
    { cursor: `120_${id}` },
  ])('rejects %j', (query) => {
    expect(listWorkspaceExecutionsSchema.safeParse(query).success).toBe(false)
  })
})
