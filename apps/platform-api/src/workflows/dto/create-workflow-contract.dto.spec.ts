import { createAgentContractSchema } from '../../agents/dto/create-agent-contract.dto'
import { createWorkflowContractSchema } from './create-workflow-contract.dto'

it.each([
  ['Agent Contract', createAgentContractSchema],
  ['Workflow Contract', createWorkflowContractSchema],
])('refuses a pattern that is not valid when authoring a %s', (_, schema) => {
  for (const field of ['inputSchema', 'outputSchema']) {
    const result = schema.safeParse({
      inputSchema: {},
      outputSchema: {},
      [field]: { type: 'string', pattern: '[' },
    })
    expect(result.success).toBe(false)
  }
  expect(
    schema.safeParse({
      inputSchema: { type: 'string', pattern: '^(a+)+$' },
      outputSchema: { type: 'string', pattern: '^\\p{Letter}+$' },
    }).success,
  ).toBe(true)
})

describe('create Workflow Contract input', () => {
  it('accepts valid input and output JSON Schemas', () => {
    expect(
      createWorkflowContractSchema.safeParse({
        inputSchema: {
          type: 'object',
          properties: { prompt: { type: 'string' } },
          required: ['prompt'],
        },
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
