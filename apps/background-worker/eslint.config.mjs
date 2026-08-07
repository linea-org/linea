// @ts-check
import { createSharedEslintConfig, globals } from "@linea/config/eslint"

export default createSharedEslintConfig({
  ignores: ["eslint.config.mjs"],
  globals: {
    ...globals.node,
    ...globals.jest,
  },
  tsconfigRootDir: import.meta.dirname,
})
