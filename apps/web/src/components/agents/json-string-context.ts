export function jsonStringContext(value: string, position: number) {
  let inString = false
  let escaped = false
  for (const character of value.slice(0, position)) {
    if (escaped) {
      escaped = false
      continue
    }
    if (inString && character === "\\") {
      escaped = true
      continue
    }
    if (character === '"') inString = !inString
  }
  return { inString, escaped }
}
