import { request, type RequestConfig } from "../http/fetch-client.js"

export type WorkspaceRequest = <T>(
  config: Omit<RequestConfig, "baseUrl" | "apiKey">
) => Promise<T>

export function workspaceRequest(
  baseUrl: string,
  apiKey: string
): WorkspaceRequest {
  return (config) => request({ baseUrl, apiKey, ...config })
}

/** Builds a request path, URL-encoding every interpolated segment. */
export function path(
  strings: TemplateStringsArray,
  ...segments: string[]
): string {
  return strings.reduce(
    (built, part, index) =>
      built + encodeURIComponent(segments[index - 1] ?? "") + part
  )
}
