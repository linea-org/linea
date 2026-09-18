import { getMDXComponents } from "@/components/mdx"
import { TocPlate } from "@/components/toc-plate"
import { source } from "@/lib/source"
import { getPageImageUrl, getPageMarkdownUrl, gitConfig } from "@/lib/shared"
import { createRelativeLink } from "fumadocs-ui/mdx"
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
  MarkdownCopyButton,
  ViewOptionsPopover,
} from "fumadocs-ui/layouts/notebook/page"
import type { Metadata } from "next"
import { notFound } from "next/navigation"

type DocsPageProps = {
  params: Promise<{ slug?: string[] }>
}

export default async function Page(props: DocsPageProps) {
  const params = await props.params
  const page = source.getPage(params.slug)
  if (!page) notFound()
  const MDX = page.data.body
  const markdownUrl = getPageMarkdownUrl(page).url
  return (
    <DocsPage
      toc={page.data.toc}
      full={page.data.full}
      className="*:mx-auto *:w-full md:pt-6 xl:pt-8"
      breadcrumb={{ enabled: false }}
      tableOfContent={{
        single: false,
        style: "clerk",
        footer: <TocPlate />,
        container: { className: "linea-toc pt-6" },
      }}
      tableOfContentPopover={{
        style: "clerk",
      }}
    >
      <header className="border-fd-border border-b pb-6">
        <div className="grid grid-cols-1 items-start gap-x-3 gap-y-2 md:grid-cols-[minmax(0,1fr)_auto]">
          <DocsTitle className="font-display tracking-tight md:col-start-1 md:row-start-1">
            {page.data.title}
          </DocsTitle>
          <div className="flex items-center gap-1.5 max-md:order-last md:col-start-2 md:row-start-1">
            <MarkdownCopyButton markdownUrl={markdownUrl} />
            <ViewOptionsPopover
              markdownUrl={markdownUrl}
              githubUrl={`https://github.com/${gitConfig.user}/${gitConfig.repo}/blob/${gitConfig.branch}/apps/docs/content/docs/${page.path}`}
            />
          </div>
          <DocsDescription className="mt-0 mb-0 md:col-span-2">
            {page.data.description}
          </DocsDescription>
        </div>
      </header>
      <DocsBody>
        <MDX
          components={getMDXComponents({
            a: createRelativeLink(source, page),
          })}
        />
      </DocsBody>
    </DocsPage>
  )
}

export function generateStaticParams() {
  return source.generateParams()
}

export async function generateMetadata(
  props: DocsPageProps
): Promise<Metadata> {
  const params = await props.params
  const page = source.getPage(params.slug)
  if (!page) notFound()
  return {
    title: page.data.title,
    description: page.data.description,
    openGraph: {
      images: getPageImageUrl(page).url,
    },
  }
}
