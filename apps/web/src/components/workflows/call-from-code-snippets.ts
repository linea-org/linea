export type SnippetLanguage = "curl" | "javascript"

export const snippetLanguages: { value: SnippetLanguage; label: string }[] = [
  { value: "curl", label: "cURL" },
  { value: "javascript", label: "JavaScript" },
]

const apiUrl =
  import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "http://localhost:3000"

export function callSnippet(
  language: SnippetLanguage,
  workflowId: string
): string {
  const url = `${apiUrl}/v1/workflows/${workflowId}/executions`
  if (language === "curl") {
    return [
      `# Replace {} with your workflow's input`,
      `curl -X POST ${url} \\`,
      `  -H "Authorization: Bearer $LINEA_API_KEY" \\`,
      `  -H "Content-Type: application/json" \\`,
      `  -d '{"triggerPayload": {}}'`,
    ].join("\n")
  }
  return [
    `const input = {} // Your workflow's input`,
    ``,
    `const response = await fetch("${url}", {`,
    `  method: "POST",`,
    `  headers: {`,
    "    Authorization: `Bearer ${process.env.LINEA_API_KEY}`,",
    `    "Content-Type": "application/json",`,
    `  },`,
    `  body: JSON.stringify({ triggerPayload: input }),`,
    `})`,
    `const execution = await response.json()`,
  ].join("\n")
}
