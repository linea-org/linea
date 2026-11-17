// @ts-check

import { createSharedEslintConfig, globals } from "@linealabs/config/eslint"

export default createSharedEslintConfig({
  ignores: ["eslint.config.js", "dist/**"],
  globals: {
    ...globals.node,
  },
  rules: {
    "import/no-cycle": "off",
    "import/order": "off",
    "sort-imports": "off",
    "@typescript-eslint/array-type": "off",
    "@typescript-eslint/require-await": "off",
    "pnpm/json-enforce-catalog": "off",
  },
})
