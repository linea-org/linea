import { BellIcon } from "lucide-react"
import { useState } from "react"

import { Button } from "@linea/ui/components/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@linea/ui/components/empty"
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@linea/ui/components/item"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@linea/ui/components/sheet"

type Notification = {
  id: string
  title: string
  description: string
}

export function TopBarNotifications() {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Notification | null>(null)
  const notifications: Notification[] = []

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Notifications"
        onClick={() => setOpen(true)}
      >
        <BellIcon />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>Notifications</SheetTitle>
            <SheetDescription>
              Recent activity across this workspace.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-auto px-4 pb-4">
            {notifications.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <BellIcon />
                  </EmptyMedia>
                  <EmptyTitle>No notifications yet</EmptyTitle>
                  <EmptyDescription>You're all caught up.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="flex flex-col gap-2">
                {notifications.map((notification) => (
                  <Item
                    key={notification.id}
                    render={<button type="button" />}
                    onClick={() => setSelected(notification)}
                  >
                    <ItemContent>
                      <ItemTitle>{notification.title}</ItemTitle>
                      <ItemDescription>
                        {notification.description}
                      </ItemDescription>
                    </ItemContent>
                  </Item>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet
        open={selected !== null}
        onOpenChange={(next) => {
          if (!next) setSelected(null)
        }}
      >
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>{selected?.title}</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-4 text-sm text-muted-foreground">
            {selected?.description}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
