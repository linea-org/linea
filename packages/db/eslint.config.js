//  @ts-check

import { createSharedEslintConfig, globals } from "@linea/config/eslint"

export default createSharedEslintConfig({
  ignores: ["eslint.config.js", ".prettierrc", "drizzle/**"],
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
