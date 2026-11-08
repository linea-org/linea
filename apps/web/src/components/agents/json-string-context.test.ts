import { describe, expect, it } from "vitest"
import { jsonStringContext } from "./json-string-context"

describe("JSON string editing context", () => {
  it.each([
    { prefix: '{"key": ', inString: false, escaped: false },
    { prefix: '{"key": "', inString: true, escaped: false },
    { prefix: '{"key": "say ' + "\\", inString: true, escaped: true },
    { prefix: '{"key": "path ' + "\\\\", inString: true, escaped: false },
    {
      prefix: '{"key": "path ' + "\\\\" + '"',
      inString: false,
      escaped: false,
    },
    {
      prefix: String.raw`{"key": "say \"hello`,
      inString: true,
      escaped: false,
    },
    { prefix: '{"key": "done"}', inString: false, escaped: false },
  ])(
    "tracks quotes and escapes in $prefix",
    ({ prefix, inString, escaped }) => {
      expect(jsonStringContext(prefix, prefix.length)).toEqual({
        inString,
        escaped,
      })
    }
  )
})
