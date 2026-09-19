// @ts-check
import { createSharedEslintConfig, globals } from "@linea/config/eslint"

export default createSharedEslintConfig({
  ignores: [
    ".next/**",
    ".source/**",
    "*.config.mjs",
    "eslint.config.mjs",
    "next-env.d.ts",
  ],
  globals: {
    ...globals.browser,
    ...globals.node,
  },
  rules: {
    "import/no-cycle": "off",
    "import/order": "off",
    "sort-imports": "off",
    "@typescript-eslint/array-type": "off",
    "pnpm/json-enforce-catalog": "off",
  },
})
