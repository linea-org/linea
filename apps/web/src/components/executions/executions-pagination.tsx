import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
} from "@linealabs/ui/components/pagination"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@linealabs/ui/components/select"
import { cn } from "@linealabs/ui/lib/utils"

export const PAGE_SIZES = [10, 25, 50, 100] as const
export type PageSize = (typeof PAGE_SIZES)[number]
export const DEFAULT_PAGE_SIZE: PageSize = 25

export function parsePageSize(value: unknown): PageSize | undefined {
  return PAGE_SIZES.find((size) => size === Number(value))
}

type PageLink = { href: string; enabled: boolean; onGo: () => void }

/** Keyset pagination: only the current page number is known, so there is no page list. */
export function ExecutionsPagination({
  page,
  pageSize,
  rowCount,
  total,
  previous,
  next,
  onPageSizeChange,
}: Readonly<{
  page: number
  pageSize: PageSize
  rowCount: number
  total: number
  previous: PageLink
  next: PageLink
  onPageSizeChange: (size: PageSize) => void
}>) {
  const first = (page - 1) * pageSize + 1
  return (
    <div className="flex shrink-0 items-center justify-between gap-4 border-t bg-muted/50 px-3 py-2 text-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        Rows per page
        <Select
          value={String(pageSize)}
          onValueChange={(value) => {
            const size = parsePageSize(value)
            if (size) onPageSizeChange(size)
          }}
        >
          <SelectTrigger aria-label="Rows per page" className="w-20">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground tabular-nums">
          {rowCount === 0
            ? `0 of ${total}`
            : `${first}–${first + rowCount - 1} of ${total}`}
        </span>
        <Pagination className="mx-0 w-auto">
          <PaginationContent>
            <PageArrow label="Previous page" link={previous}>
              <ChevronLeftIcon />
            </PageArrow>
            <PaginationItem>
              <PaginationLink isActive className="tabular-nums">
                {page}
              </PaginationLink>
            </PaginationItem>
            <PageArrow label="Next page" link={next}>
              <ChevronRightIcon />
            </PageArrow>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  )
}

function PageArrow({
  label,
  link,
  children,
}: Readonly<{ label: string; link: PageLink; children: React.ReactNode }>) {
  return (
    <PaginationItem>
      <PaginationLink
        href={link.href}
        aria-label={label}
        aria-disabled={!link.enabled}
        className={cn(!link.enabled && "pointer-events-none opacity-50")}
        onClick={(event) => {
          event.preventDefault()
          link.onGo()
        }}
      >
        {children}
      </PaginationLink>
    </PaginationItem>
  )
}
