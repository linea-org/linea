//  @ts-check

import { createSharedEslintConfig, globals } from "@linea/config/eslint"

export default createSharedEslintConfig({
  ignores: ["eslint.config.js", ".prettierrc", "dist/**"],
  globals: {
    ...globals.browser,
    ...globals.node,
  },
  rules: {
    "import/no-cycle": "off",
    "import/order": "off",
    "sort-imports": "off",
    "@typescript-eslint/array-type": "off",
    "@typescript-eslint/require-await": "off",
    // TanStack Router uses `throw redirect(...)` for navigation control.
    "@typescript-eslint/only-throw-error": "off",
    "pnpm/json-enforce-catalog": "off",
  },
})
