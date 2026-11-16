import type { CSSProperties } from "react"

// @xyflow/react ships its own light-mode colors via these CSS variables — remap them to our tokens so Controls/MiniMap/edges follow dark mode.
export const FLOW_THEME_VARS = {
  "--xy-background-color": "var(--surface-canvas)",
  "--xy-background-pattern-color":
    "color-mix(in oklch, var(--foreground) 22%, transparent)",
  "--xy-edge-stroke": "var(--muted-foreground)",
  "--xy-edge-stroke-selected": "var(--primary)",
  "--xy-connectionline-stroke": "var(--muted-foreground)",
  "--xy-edge-label-background-color": "var(--popover)",
  "--xy-edge-label-color": "var(--foreground)",
  "--xy-selection-background-color":
    "color-mix(in oklch, var(--primary) 12%, transparent)",
  "--xy-selection-border": "1px solid var(--primary)",
  "--xy-handle-background-color": "var(--muted-foreground)",
  "--xy-handle-border-color": "var(--card)",
  "--xy-node-background-color": "transparent",
  "--xy-node-color": "var(--foreground)",
  "--xy-node-border": "none",
  "--xy-controls-button-background-color": "var(--card)",
  "--xy-controls-button-background-color-hover": "var(--secondary)",
  "--xy-controls-button-color": "var(--foreground)",
  "--xy-controls-button-color-hover": "var(--foreground)",
  "--xy-controls-button-border-color": "var(--border)",
  "--xy-minimap-background-color": "var(--card)",
  "--xy-minimap-mask-background-color":
    "color-mix(in oklch, var(--surface-canvas) 70%, transparent)",
  "--xy-minimap-node-background-color": "var(--muted)",
  "--xy-minimap-node-stroke-color": "var(--border)",
} as CSSProperties
