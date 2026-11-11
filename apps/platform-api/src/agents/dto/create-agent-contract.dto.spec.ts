import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createAgentContractSchema } from './create-agent-contract.dto'

it('releases older tenant schemas after bounded compiler rotation', () => {
  const moduleUrl = pathToFileURL(
    join(__dirname, 'create-agent-contract.dto.ts'),
  ).href
  const result = spawnSync(
    process.execPath,
    [
      '--expose-gc',
      '--input-type=module',
      '-e',
      `
    const { createAgentContractSchema } = await import(${JSON.stringify(moduleUrl)});
    function compileSchemas() {
      const references = [];
      for (let i = 0; i < 300; i++) {
        const properties = { value: { type: 'string' } };
        const validated = createAgentContractSchema.parse({ inputSchema: { type: 'object', properties }, outputSchema: { type: 'object', properties: { result: { type: 'string' } } } });
        if (i < 10) references.push(new WeakRef(validated.inputSchema));
      }
      return references;
    }
    const references = compileSchemas();
    await new Promise(setImmediate);
    global.gc();
    await new Promise(setImmediate);
    global.gc();
    if (references.some(reference => reference.deref() !== undefined)) throw new Error('Compiled tenant schemas remain reachable after validation');
  `,
    ],
    { encoding: 'utf8', timeout: 10_000 },
  )
  if (result.status !== 0)
    throw new Error(
      result.stderr || result.error?.message || 'Schema retention check failed',
    )
  expect(() =>
    createAgentContractSchema.parse({
      inputSchema: { type: 'not-a-json-schema-type' },
      outputSchema: { type: 'object' },
    }),
  ).toThrow()
}, 15_000)
