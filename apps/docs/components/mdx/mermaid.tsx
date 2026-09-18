"use client"

import { useTheme } from "next-themes"
import { useEffect, useId, useRef, useState } from "react"

export function Mermaid({ chart }: { chart: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const id = useId().replaceAll(":", "")
  const { resolvedTheme } = useTheme()
  const [error, setError] = useState<Error>()
  useEffect(() => {
    let active = true
    async function renderDiagram() {
      try {
        const { default: mermaid } = await import("mermaid")
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          fontFamily: "inherit",
          theme: resolvedTheme === "dark" ? "dark" : "neutral",
        })
        const { svg, bindFunctions } = await mermaid.render(
          id,
          chart.replaceAll("\\n", "\n")
        )
        if (!active || !containerRef.current) return
        containerRef.current.innerHTML = svg
        bindFunctions?.(containerRef.current)
      } catch (caught) {
        if (active)
          setError(
            caught instanceof Error
              ? caught
              : new Error("Mermaid rendering failed")
          )
      }
    }
    void renderDiagram()
    return () => {
      active = false
    }
  }, [chart, id, resolvedTheme])
  if (error) throw error
  return (
    <div
      ref={containerRef}
      className="my-6 flex min-h-24 justify-center overflow-x-auto"
    />
  )
}
