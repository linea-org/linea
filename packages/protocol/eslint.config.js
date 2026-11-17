// @ts-check

import { createSharedEslintConfig } from "@linealabs/config/eslint"

export default createSharedEslintConfig({
  ignores: ["eslint.config.js", "dist/**", "scripts/**"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: [
              "node:*",
              "@nestjs/*",
              "@linealabs/db",
              "@linealabs/queue",
              "bullmq",
              "react",
              "react-native",
            ],
            message:
              "@linealabs/protocol runtime code must remain browser-safe.",
          },
        ],
      },
    ],
    "pnpm/json-enforce-catalog": "off",
  },
})
