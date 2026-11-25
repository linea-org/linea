// @ts-check

import { createSharedEslintConfig } from "@linealabs/config/eslint"

export default createSharedEslintConfig({
  ignores: ["eslint.config.js", "dist/**"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["node:*", "react", "react-native"],
            message:
              "@linealabs/protocol runtime code must remain browser-safe.",
          },
        ],
      },
    ],
    "pnpm/json-enforce-catalog": "off",
  },
})
