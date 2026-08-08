/** Express's `res.json()` calls JSON.stringify with this as the replacer — bigint columns (costMicros) otherwise throw "Do not know how to serialize a BigInt". */
export function bigIntJsonReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value
}
