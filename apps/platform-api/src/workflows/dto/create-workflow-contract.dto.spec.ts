import { spawnSync } from 'node:child_process'
import { createAgentContractSchema } from '../../agents/dto/create-agent-contract.dto'
import { createWorkflowContractSchema } from './create-workflow-contract.dto'

it.each([
  ['Agent Contract', createAgentContractSchema],
  ['Workflow Contract', createWorkflowContractSchema],
])('enforces bounded regex compatibility when authoring a %s', (_, schema) => {
  for (const field of ['inputSchema', 'outputSchema']) {
    for (const contractSchema of [
      { type: 'string', pattern: '(?=a)a' },
      { type: 'object', propertyNames: { pattern: '^(a)\\1$' } },
      { type: 'object', patternProperties: { '(?<=a)b': true } },
    ]) {
      const result = schema.safeParse({
        inputSchema: {},
        outputSchema: {},
        [field]: contractSchema,
      })
      expect(result.success).toBe(false)
      expect(result.error?.issues[0]?.message).toContain(
        'Unsupported contract regex',
      )
    }
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

it('bounds hostile matching and strict overlap checks in a killable process', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import { strict as assert } from 'node:assert';
    const { compileContractSchema: compile } = await import('@linea/protocol/json-schema');
    const hostile = 'a'.repeat(100_000) + '!';
    for (const pattern of ['^(a+)+$', '^(a|aa)+$']) {
      assert.equal(compile({ type: 'string', pattern })(hostile), false);
      assert.equal(compile({ type: 'object', propertyNames: { pattern } })({ [hostile]: 1 }), false);
      assert.equal(compile({ type: 'object', patternProperties: { [pattern]: { type: 'number' } }, additionalProperties: false })({ [hostile]: 1 }), false);
      assert.equal(compile({ type: 'object', properties: { [hostile]: { type: 'number' } }, patternProperties: { [pattern]: { type: 'string' } } })({ [hostile]: 1 }), true);
    }
  `,
    ],
    { encoding: 'utf8', timeout: 5_000 },
  )
  if (result.error) throw result.error
  if (result.status !== 0)
    throw new Error(result.stderr || 'Hostile regex validation failed')
}, 10_000)
