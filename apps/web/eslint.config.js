//  @ts-check

import { createSharedEslintConfig, globals } from "@linealabs/config/eslint"

const serverOnlyPackages = ["db", "queue", "connectors", "ai"].map(
  (name) => `@linealabs/${name}`
)

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
    "@typescript-eslint/no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: serverOnlyPackages.flatMap((name) => [name, `${name}/*`]),
            allowTypeImports: true,
            message:
              "Server-only package: it must not reach the browser bundle. Call it from the API and import only types here (`import type`).",
          },
        ],
      },
    ],
  },
})
