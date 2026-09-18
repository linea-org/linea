// @ts-check

import { createSharedEslintConfig, globals } from "@linea/config/eslint"

export default createSharedEslintConfig({
  ignores: ["eslint.config.js", "dist/**", "test/*.mjs"],
  globals: { ...globals.node, ...globals.browser },
  rules: {
    "import/no-cycle": "off",
    "import/order": "off",
    "sort-imports": "off",
    "@typescript-eslint/array-type": "off",
    "@typescript-eslint/require-await": "off",
    "pnpm/json-enforce-catalog": "off",
  },
})
