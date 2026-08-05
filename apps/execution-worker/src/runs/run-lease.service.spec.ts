import "../env"
import { RunLeaseService } from "./run-lease.service"

describe("RunLeaseService heartbeat isolation", () => {
  it("clears only the targeted attempt's timer, not a different attempt on the same execution", () => {
    const lease = new RunLeaseService()
    const clearSpy = jest.spyOn(global, "clearInterval")

    try {
      lease.startHeartbeat("exec-1", "attempt-A")
      lease.startHeartbeat("exec-1", "attempt-B")

      lease.stopHeartbeat("attempt-A")
      expect(clearSpy).toHaveBeenCalledTimes(1)

      lease.stopHeartbeat("attempt-B")
      expect(clearSpy).toHaveBeenCalledTimes(2)
    } finally {
      // Belt-and-suspenders: an assertion failure above shouldn't leave a
      // real setInterval running past the test.
      lease.stopHeartbeat("attempt-A")
      lease.stopHeartbeat("attempt-B")
      clearSpy.mockRestore()
    }
  })
})
