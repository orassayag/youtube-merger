import type { ApiResult } from '../types/index.js';

export const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function getErrorStatus(err: unknown): number | undefined {
  if (err && typeof err === 'object' && 'response' in err) {
    const r = (err as { response?: { status?: number } }).response;
    return r?.status;
  }
  return undefined;
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Runs `fn` with retries. HTTP 409 is treated as duplicate (success path for idempotent ops).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  retries = 3
): Promise<ApiResult<T>> {
  let lastError: unknown;
  for (let i = 0; i < retries; i++) {
    try {
      const data = await fn();
      return { status: 'success', data };
    } catch (err: unknown) {
      lastError = err;
      const status = getErrorStatus(err);
      if (status === 409) {
        return { status: 'duplicate' };
      }
      if (status === 403) {
        console.warn(`⚠️  Quota exceeded on "${label}". Waiting 60s...`);
        await delay(60000);
        continue;
      }
      console.warn(
        `⚠️  Error on "${label}" (attempt ${i + 1}): ${getErrorMessage(err)}`
      );
      await delay(2000);
    }
  }
  return { status: 'failed', error: lastError };
}
