import { createWorkflowContractSchema } from './create-workflow-contract.dto'

describe('create Workflow Contract input', () => {
  it('accepts valid input and output JSON Schemas', () => {
    expect(
      createWorkflowContractSchema.safeParse({
        inputSchema: { type: 'object', required: ['prompt'] },
        outputSchema: { type: 'string' },
      }).success,
    ).toBe(true)
  })

  it('rejects malformed JSON Schema keywords and non-JSON values', () => {
    expect(
      createWorkflowContractSchema.safeParse({
        inputSchema: { type: 'not-a-json-schema-type' },
        outputSchema: { type: 'string' },
      }).success,
    ).toBe(false)
    expect(
      createWorkflowContractSchema.safeParse({
        inputSchema: { transform: () => 'not JSON' },
        outputSchema: { type: 'string' },
      }).success,
    ).toBe(false)
  })
})
