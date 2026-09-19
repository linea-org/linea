import { docsContentRoute, docsRoute } from "@/lib/shared"
import { isMarkdownPreferred, rewritePath } from "fumadocs-core/negotiation"
import { type NextRequest, NextResponse } from "next/server"

const docsPathRewriter = rewritePath(
  `${docsRoute}{/*path}`,
  `${docsContentRoute}{/*path}/content.md`
)
const suffixPathRewriter = rewritePath(
  `${docsRoute}{/*path}.md`,
  `${docsContentRoute}{/*path}/content.md`
)

export default function proxy(request: NextRequest) {
  const suffixResult = suffixPathRewriter.rewrite(request.nextUrl.pathname)
  if (suffixResult)
    return NextResponse.rewrite(new URL(suffixResult, request.nextUrl))
  if (isMarkdownPreferred(request)) {
    const docsResult = docsPathRewriter.rewrite(request.nextUrl.pathname)
    if (docsResult) {
      return NextResponse.rewrite(new URL(docsResult, request.nextUrl), {
        headers: { Vary: "Accept" },
      })
    }
  }
  return NextResponse.next()
}
