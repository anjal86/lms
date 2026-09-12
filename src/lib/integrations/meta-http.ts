import 'server-only';

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_RETRIES = 3;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function metaFetchJson<T = Record<string, unknown>>(
  input: URL | string,
  init: RequestInit = {},
  options: { timeoutMs?: number; retries?: number } = {}
): Promise<{ response: Response; data: T }> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? DEFAULT_RETRIES;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(input, {
        ...init,
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
      });
      const data = await response.json().catch(() => ({})) as T;

      if (response.ok || (response.status !== 429 && response.status < 500) || attempt === retries) {
        return { response, data };
      }

      const retryAfter = Number(response.headers.get('retry-after'));
      const backoff = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 30_000)
        : Math.min(500 * (2 ** attempt) + Math.floor(Math.random() * 250), 8_000);
      await sleep(backoff);
    } catch (error) {
      lastError = error;
      if (attempt === retries) throw error;
      await sleep(Math.min(500 * (2 ** attempt) + Math.floor(Math.random() * 250), 8_000));
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Meta request failed.');
}
