import { TimeLimitError, withTimeLimit } from "./time-limit"

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

  it("lets other work run between calls", async () => {
    let turns = 0
    const timer = setInterval(() => (turns += 1), 1)
    await Promise.allSettled([1, 2, 3].map(() => withTimeLimit(slow)))
    clearInterval(timer)
    expect(turns).toBeGreaterThanOrEqual(2)
  })
})
