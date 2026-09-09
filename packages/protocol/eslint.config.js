// @ts-check

import { createSharedEslintConfig } from "@linea/config/eslint"

export default createSharedEslintConfig({
  ignores: ["eslint.config.js", "dist/**"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: [
              "node:*",
              "@nestjs/*",
              "@linea/db",
              "@linea/queue",
              "bullmq",
              "react",
              "react-native",
            ],
            message: "@linea/protocol runtime code must remain browser-safe.",
          },
        ],
      },
    ],
    "pnpm/json-enforce-catalog": "off",
  },
})
