// @ts-check
import { createSharedEslintConfig, globals } from "@linealabs/config/eslint"

export default createSharedEslintConfig({
  ignores: ["eslint.config.mjs"],
  globals: {
    ...globals.node,
    ...globals.jest,
  },
  tsconfigRootDir: import.meta.dirname,
})
