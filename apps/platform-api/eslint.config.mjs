// @ts-check
import { createSharedEslintConfig, globals } from '@linealabs/config/eslint'

export default [
  ...createSharedEslintConfig({
    ignores: ['eslint.config.mjs'],
    globals: {
      ...globals.node,
      ...globals.jest,
    },
    sourceType: 'commonjs',
    tsconfigRootDir: import.meta.dirname,
  }),
  { files: ['scripts/**'], rules: { 'no-console': 'off' } },
]
