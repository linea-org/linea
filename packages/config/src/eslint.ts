import type { Linter } from "eslint"
import eslint from "@eslint/js"
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended"
import globals from "globals"
import tseslint from "typescript-eslint"

const sharedRules = {
  "@typescript-eslint/no-explicit-any": "off",
  "@typescript-eslint/no-floating-promises": "warn",
  "@typescript-eslint/no-unsafe-argument": "warn",
  "prettier/prettier": ["error", { endOfLine: "auto" }],
} satisfies Partial<Record<string, Linter.RuleEntry>>

type SharedEslintConfigOptions = {
  ignores?: string[]
  sourceType?: "module" | "commonjs"
  tsconfigRootDir?: string
  globals?: Record<string, boolean>
  rules?: Partial<Record<string, Linter.RuleEntry>>
  parserOptions?: Record<string, unknown>
}

export function createSharedEslintConfig({
  ignores = [],
  sourceType = "module",
  tsconfigRootDir,
  globals: customGlobals = {},
  rules = {},
  parserOptions = {},
}: SharedEslintConfigOptions = {}) {
  return tseslint.config(
    { ignores },
    eslint.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    eslintPluginPrettierRecommended,
    {
      languageOptions: {
        globals: customGlobals,
        sourceType,
        parserOptions: {
          projectService: true,
          tsconfigRootDir,
          ...parserOptions,
        },
      },
    },
    {
      rules: {
        ...sharedRules,
        ...rules,
      },
    }
  )
}

export { globals }
export { sharedRules as sharedEslintRules }
