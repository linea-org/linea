import {
  DocsAssistant,
  DocsMobileAskTrigger,
} from "@/components/docs-assistant"
import { DocsSidebarBanner } from "@/components/docs-sidebar-banner"
import { DocsSidebarFooter } from "@/components/docs-sidebar-footer"
import { docsOptions } from "@/lib/layout.shared"
import { source } from "@/lib/source"
import { DocsLayout } from "fumadocs-ui/layouts/notebook"

export default function Layout({ children }: LayoutProps<"/docs">) {
  const options = docsOptions()
  return (
    <DocsLayout
      tree={source.getPageTree()}
      {...options}
      themeSwitch={{ enabled: false }}
      sidebar={{
        banner: DocsSidebarBanner,
        footer: DocsSidebarFooter,
      }}
      nav={{
        ...options.nav,
        mode: "top",
      }}
      links={[
        {
          type: "custom",
          on: "nav",
          children: (
            <div className="hidden md:block">
              <DocsAssistant trigger="header" />
            </div>
          ),
        },
      ]}
    >
      <DocsMobileAskTrigger />
      {children}
    </DocsLayout>
  )
}
