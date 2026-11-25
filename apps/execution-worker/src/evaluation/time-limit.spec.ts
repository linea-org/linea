import { TimeLimitError } from "@linealabs/protocol/json-schema"
import { withTimeLimit } from "./time-limit"

const slow = () => /x+x+y/.test("x".repeat(99_000))

describe("withTimeLimit", () => {
  it("returns the result and keeps its own errors", async () => {
    await expect(withTimeLimit(() => 1 + 1)).resolves.toBe(2)
    await expect(
      withTimeLimit(() => {
        throw new RangeError("own")
      })
    ).rejects.toThrow(RangeError)
  })

  it("stops a regex that backtracks, and runs the next call", async () => {
    const stopped = withTimeLimit(slow)
    const next = withTimeLimit(() => "next")
    await expect(stopped).rejects.toThrow(TimeLimitError)
    await expect(next).resolves.toBe("next")
  })

  it("leaves most of the time to other work between slow calls", async () => {
    const started = performance.now()
    await Promise.allSettled([1, 2].map(() => withTimeLimit(slow)))
    expect(performance.now() - started).toBeGreaterThan(1200)
  })
})
