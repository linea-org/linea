import { createAgentVersionSchema, updateAgentSchema } from './agent-input.dto'
import { createAgentContractSchema } from './create-agent-contract.dto'

const input = {
  agentContractRevisionId: '719b1d02-27ef-40df-ab8b-950b69d4a15b',
  definition: {
    version: 1,
    instructions: 'Resolve the requested GitHub task',
    model: 'gpt-5',
    tools: [{ name: 'create_issue', operation: 'github.issues.create' }],
    maxIterations: 4,
  },
}

describe('Agent authoring input', () => {
  it('accepts registered read and side-effect tools without embedding credentials', () => {
    expect(createAgentVersionSchema.safeParse(input).success).toBe(true)
    expect(
      createAgentVersionSchema.safeParse({
        ...input,
        definition: {
          ...input.definition,
          tools: [{ name: 'list_issues', operation: 'github.issues.list' }],
        },
      }).success,
    ).toBe(true)
    expect(
      createAgentVersionSchema.safeParse({
        ...input,
        definition: { ...input.definition, apiKey: 'credential' },
      }).success,
    ).toBe(false)
    expect(
      createAgentVersionSchema.safeParse({
        ...input,
        definition: {
          ...input.definition,
          tools: [{ ...input.definition.tools[0], url: 'https://example.com' }],
        },
      }).success,
    ).toBe(false)
  })
  it('rejects unknown models, unknown operations, duplicate names and invalid budgets', () => {
    for (const definition of [
      { ...input.definition, model: 'unknown' },
      { ...input.definition, model: 'toString' },
      { ...input.definition, tools: [{ name: 'bad', operation: 'unknown' }] },
      {
        ...input.definition,
        tools: [input.definition.tools[0], input.definition.tools[0]],
      },
      { ...input.definition, maxIterations: 0 },
      { ...input.definition, maxIterations: 1.5 },
    ])
      expect(
        createAgentVersionSchema.safeParse({ ...input, definition }).success,
      ).toBe(false)
  })
  it('requires an explicit Contract and rejects empty updates', () => {
    expect(
      createAgentVersionSchema.safeParse({ definition: input.definition })
        .success,
    ).toBe(false)
    expect(updateAgentSchema.safeParse({}).success).toBe(false)
    expect(
      updateAgentSchema.safeParse({
        applicationId: input.agentContractRevisionId,
      }).success,
    ).toBe(false)
  })
  it('requires compilable local JSON Schemas for both sides of the Contract', () => {
    expect(
      createAgentContractSchema.safeParse({
        inputSchema: {
          type: 'object',
          properties: { task: { type: 'string' } },
          required: ['task'],
        },
        outputSchema: { type: 'string' },
      }).success,
    ).toBe(true)
    for (const schema of [
      { type: 'invalid' },
      { $ref: 'https://example.com/remote-schema' },
      { type: 'object', required: ['missing'] },
      { unknownKeyword: true },
      { transform: () => 'invalid' },
    ]) {
      expect(
        createAgentContractSchema.safeParse({
          inputSchema: schema,
          outputSchema: {},
        }).success,
      ).toBe(false)
    }
  })
})
