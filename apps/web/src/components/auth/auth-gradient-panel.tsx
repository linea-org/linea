"use client"

import { GrainGradient } from "@paper-design/shaders-react"

const GRADIENT_COLORS = ["#FFFFFF", "#6B5CE7", "#8B7CF7", "#F3E8FF"]

export function AuthGradientPanel() {
  return (
    <div className="relative hidden h-full min-h-0 overflow-hidden bg-foreground text-primary-foreground lg:flex">
      <GrainGradient
        speed={1}
        scale={1}
        rotation={0}
        offsetX={0}
        offsetY={0}
        softness={0.55}
        intensity={0.5}
        noise={0.22}
        shape="corners"
        colors={GRADIENT_COLORS}
        colorBack="#00000000"
        className="absolute inset-0 size-full"
      />
      <div className="relative z-10 flex h-full w-full flex-col justify-between gap-10 p-12 xl:p-16">
        <div>
          <p className="text-sm font-medium tracking-wide text-white/70">
            Linea
          </p>
          <h2 className="mt-4 max-w-md font-heading text-4xl font-semibold tracking-tight text-white sm:text-5xl xl:text-[3.25rem] xl:leading-[1.05]">
            Build workflows,
            <br />
            ship faster.
          </h2>
        </div>
        <p className="max-w-sm text-sm leading-relaxed text-white/75 sm:text-base">
          Create a workspace, invite your team, and run automations in one
          place.
        </p>
      </div>
    </div>
  )
}
