export function AuthGradientPanel() {
  return (
    <div className="relative hidden h-full min-h-0 overflow-hidden bg-auth-panel text-auth-panel-foreground lg:flex">
      <img
        src="/assets/auth-panel.jpg"
        alt=""
        className="absolute inset-0 size-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-auth-panel/45 via-auth-panel/15 to-auth-panel/50" />
      <div className="relative z-10 flex h-full w-full flex-col justify-between gap-10 p-12 xl:p-16">
        <div>
          <p className="text-xs font-medium tracking-wide text-auth-panel-foreground/70">
            Linea
          </p>
          <h2 className="mt-4 max-w-md font-heading text-4xl font-semibold tracking-tight sm:text-5xl xl:text-[3.25rem] xl:leading-[1.05]">
            Build workflows,
            <br />
            ship faster.
          </h2>
        </div>
        <p className="max-w-sm text-xs leading-relaxed text-auth-panel-foreground/75 sm:text-base">
          Create a workspace, invite your team, and run automations in one
          place.
        </p>
      </div>
    </div>
  )
}
