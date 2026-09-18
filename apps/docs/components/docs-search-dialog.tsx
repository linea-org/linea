"use client"

import { fetchClient } from "fumadocs-core/search/client/fetch"
import { useDocsSearch } from "fumadocs-core/search/client"
import {
  SearchDialog,
  SearchDialogClose,
  SearchDialogContent,
  SearchDialogHeader,
  SearchDialogIcon,
  SearchDialogInput,
  SearchDialogList,
  SearchDialogOverlay,
} from "fumadocs-ui/components/dialog/search"
import { useI18n } from "fumadocs-ui/contexts/i18n"
import type { SharedProps } from "fumadocs-ui/contexts/search"

export function DocsSearchDialog(props: SharedProps) {
  const { locale } = useI18n()
  const { search, setSearch, query } = useDocsSearch({
    client: fetchClient({ locale }),
  })
  return (
    <SearchDialog
      search={search}
      onSearchChange={setSearch}
      isLoading={query.isLoading}
      {...props}
    >
      <SearchDialogOverlay />
      <SearchDialogContent className="top-3 w-[calc(100%-1.5rem)] rounded-md md:top-[18vh]">
        <SearchDialogHeader className="h-12 gap-2 px-3 py-0">
          <SearchDialogIcon />
          <SearchDialogInput className="text-sm" />
          <SearchDialogClose className="rounded-md" />
        </SearchDialogHeader>
        <SearchDialogList items={query.data !== "empty" ? query.data : null} />
      </SearchDialogContent>
    </SearchDialog>
  )
}
