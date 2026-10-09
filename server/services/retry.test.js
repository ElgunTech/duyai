import { describe, expect, it } from "vitest";
import { withNetworkRetry } from "./retry.js";

describe("withNetworkRetry", () => {
  it("retries network failures and returns the first success", async () => {
    let calls = 0;
    const result = await withNetworkRetry(async () => {
      calls++;
      if (calls < 2) throw new TypeError("fetch failed");
      return "ok";
    });
    expect(result).toBe("ok");
    expect(calls).toBe(2);
  });

  it("does not retry other errors", async () => {
    let calls = 0;
    await expect(
      withNetworkRetry(async () => {
        calls++;
        throw new Error("Azure açarı qəbul olunmadı (HTTP 401)");
      }),
    ).rejects.toThrow("401");
    expect(calls).toBe(1);
  });
});
