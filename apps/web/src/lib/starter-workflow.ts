export const STARTER_APPLICATION = {
  name: "My first app",
  slug: "my-first-app",
}

export function uniqueSlug(base: string, taken: string[]): string {
  if (!taken.includes(base)) return base
  let suffix = 2
  while (taken.includes(`${base}-${suffix}`)) suffix += 1
  return `${base}-${suffix}`
}
