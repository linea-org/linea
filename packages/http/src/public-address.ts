import { isIP } from "node:net"

function ipv4Number(address: string): number {
  return (
    address
      .split(".")
      .reduce((value, part) => (value << 8) + Number(part), 0) >>> 0
  )
}

function inIpv4Range(address: number, base: string, prefix: number): boolean {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
  return (address & mask) === (ipv4Number(base) & mask)
}

function ipv6Number(address: string): bigint {
  const withoutZone = address.split("%", 1)[0] ?? address
  const lastPart = withoutZone.split(":").at(-1)
  const normalized = lastPart?.includes(".")
    ? `${withoutZone.slice(0, withoutZone.lastIndexOf(":"))}:${(
        ipv4Number(lastPart) >>> 16
      ).toString(16)}:${(ipv4Number(lastPart) & 0xffff).toString(16)}`
    : withoutZone
  const halves = normalized.split("::")
  const left = halves[0]?.split(":").filter(Boolean) ?? []
  const right = halves[1]?.split(":").filter(Boolean) ?? []
  const groups =
    halves.length === 2
      ? [
          ...left,
          ...Array<string>(8 - left.length - right.length).fill("0"),
          ...right,
        ]
      : left
  return groups.reduce(
    (value, group) => (value << 16n) + BigInt(`0x${group}`),
    0n
  )
}

function inIpv6Range(address: bigint, base: string, prefix: number): boolean {
  const shift = BigInt(128 - prefix)
  return address >> shift === ipv6Number(base) >> shift
}

function isPublicIpv4(address: number): boolean {
  return ![
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.0.2.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["198.51.100.0", 24],
    ["203.0.113.0", 24],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
  ].some(([base, prefix]) => inIpv4Range(address, String(base), Number(prefix)))
}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 4) {
    return isPublicIpv4(ipv4Number(address))
  }
  if (family !== 6) return false
  const value = ipv6Number(address.toLowerCase())
  if (
    inIpv6Range(value, "::ffff:0:0", 96) ||
    inIpv6Range(value, "64:ff9b::", 96)
  ) {
    return isPublicIpv4(Number(value & 0xffffffffn))
  }
  if (!inIpv6Range(value, "2000::", 3)) return false
  return ![
    ["::", 96],
    ["64:ff9b:1::", 48],
    ["100::", 64],
    ["2001::", 23],
    ["2001:db8::", 32],
    ["2002::", 16],
    ["3fff::", 20],
    ["fc00::", 7],
    ["fe80::", 10],
    ["ff00::", 8],
  ].some(([base, prefix]) => inIpv6Range(value, String(base), Number(prefix)))
}

export function isLoopbackAddress(address: string): boolean {
  if (isIP(address) === 4) {
    return inIpv4Range(ipv4Number(address), "127.0.0.0", 8)
  }
  const normalized = address.toLowerCase()
  if (normalized === "::1") return true
  if (!normalized.startsWith("::ffff:")) return false
  return isLoopbackAddress(normalized.slice("::ffff:".length))
}

export function isLocalHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "")
  return normalized === "localhost" || isLoopbackAddress(normalized)
}
