import { createMDX } from "fumadocs-mdx/next"

const withMDX = createMDX()

/** @type {import("next").NextConfig} */
const config = {
  agentRules: false,
  reactStrictMode: true,
  async redirects() {
    return [
      {
        source: "/docs/modules/:path*",
        destination: "/docs/getting-started",
        permanent: true,
      },
      {
        source: "/docs/nodes/:path*",
        destination: "/docs/architecture",
        permanent: true,
      },
    ]
  },
}

export default withMDX(config)
