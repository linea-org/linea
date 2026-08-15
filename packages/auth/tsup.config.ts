import { defineConfig } from "tsup"

export default defineConfig({
  // Separate entry so consumers that only need sendEmail (e.g. execution-worker) don't pull in better-auth — a pure-ESM dependency that breaks CJS-mode Jest transforms in apps that haven't set up ESM test support.
  entry: { index: "src/index.ts", email: "src/email.ts" },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "es2022",
  external: [
    "better-auth",
    "@better-auth/drizzle-adapter",
    "resend",
    "@linea/db",
  ],
})
