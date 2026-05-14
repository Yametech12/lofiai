/**
 * Shared fetch utility with exponential-backoff retry.
 * Used by all API route handlers to avoid duplication.
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries: number,
  backoff: number,
  timeoutMs: number
): Promise<Response> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const resp = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      return resp;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, backoff * Math.pow(2, attempt)));
      }
    }
  }

  throw lastError;
}

/**
 * Detect whether a caught error is a network-level failure
 * (DNS, connection refused, timeout) vs an HTTP error.
 */
export function isNetworkError(message: string): boolean {
  return (
    message.includes('fetch failed') ||
    message.includes('ETIMEDOUT') ||
    message.includes('ECONNREFUSED') ||
    message.includes('ENOTFOUND') ||
    message.includes('ConnectTimeoutError') ||
    message.includes('AbortError')
  );
}
