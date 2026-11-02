// Fork: a big regex pack imported one script per request can outrun the server's per-minute request
// limit (Undertow 2.0's 197 scripts stopped at 57 with "Too many requests"). A rate-limited call
// waits and tries again instead of being skipped, so a pack lands whole and in order.
import { ApiError } from "../api-client";

const WAIT_MS = 10_000;
/** Enough waits to outlast the server's one-minute window. */
const MAX_WAITS = 8;

export function isRateLimited(error: unknown): boolean {
  return error instanceof ApiError && error.status === 429;
}

export async function retryWhenRateLimited<T>(
  call: () => Promise<T>,
  onWait?: () => void,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<T> {
  for (let waits = 0; ; waits += 1) {
    try {
      return await call();
    } catch (error) {
      if (!isRateLimited(error) || waits >= MAX_WAITS) throw error;
      onWait?.();
      await sleep(WAIT_MS);
    }
  }
}
