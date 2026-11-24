import { useLayoutEffect, useRef, useState, type ReactNode } from "react"

import { InputGroup } from "@linealabs/ui/components/input-group"
import { cn } from "@linealabs/ui/lib/utils"

const ONE_LINE_PX = 44

/** The box every message is typed in: one row until the text needs more, then controls move below it. */
export function ComposerFrame({
  value,
  menu,
  above,
  leading,
  trailing,
  children,
}: Readonly<{
  value: string
  menu?: ReactNode
  above?: ReactNode
  leading?: ReactNode
  trailing: ReactNode
  children: ReactNode
}>) {
  const frame = useRef<HTMLDivElement>(null)
  const [tall, setTall] = useState(false)
  useLayoutEffect(() => {
    const control = frame.current?.querySelector(
      "[data-slot=input-group-control]"
    )
    // Stays tall until cleared: the narrower one-row field would wrap again and flip back.
    setTall(
      (before) =>
        value !== "" && (before || (control?.scrollHeight ?? 0) > ONE_LINE_PX)
    )
  }, [value])
  // A box with no menu has room beside the text at any height.
  const oneRow = leading
    ? !tall && "@lg:order-1 @lg:col-span-1"
    : "order-1 col-span-2"
  return (
    <div ref={frame} className="@container mx-auto w-full max-w-3xl">
      <InputGroup className="grid h-auto grid-cols-[auto_1fr_auto] items-end gap-x-1 rounded-3xl bg-card p-1.5 shadow-sm">
        {menu}
        {above ? <div className="col-span-3">{above}</div> : null}
        <div className={cn("col-span-3 flex min-w-0", oneRow)}>{children}</div>
        {leading ? (
          <div className="col-start-1 flex min-h-9 items-center gap-1">
            {leading}
          </div>
        ) : null}
        <div
          className={cn(
            "col-start-3 flex min-h-9 min-w-0 items-center gap-1",
            (!tall || !leading) && "order-2"
          )}
        >
          {trailing}
        </div>
      </InputGroup>
    </div>
  )
}
