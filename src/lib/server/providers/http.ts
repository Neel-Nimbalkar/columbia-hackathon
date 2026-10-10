import { HttpError } from '../errors';

/** fetch with timeout and bounded retries on 429/5xx. Upstream bodies never reach the client. */
export async function upstreamFetch(
  provider: string,
  url: string,
  init: RequestInit,
  opts: { timeoutMs: number; retries: number },
): Promise<Response> {
  let lastStatus = 0;
  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { ...init, signal: AbortSignal.timeout(opts.timeoutMs) });
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
      if (attempt < opts.retries) continue;
      throw timedOut
        ? new HttpError(504, 'UPSTREAM_TIMEOUT', `${provider} did not respond within ${Math.round(opts.timeoutMs / 1000)}s. Please retry.`)
        : new HttpError(502, 'UPSTREAM_ERROR', `Could not reach ${provider}. Please retry.`);
    }
    if (res.ok) return res;
    lastStatus = res.status;
    // Server log only; upstream bodies never reach the client.
    console.warn(`[${provider}] HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 400)}`);
    const retryable = res.status === 429 || res.status === 529 || res.status >= 500;
    if (retryable && attempt < opts.retries) {
      await new Promise((r) => setTimeout(r, 600 * 2 ** attempt));
      continue;
    }
    break;
  }
  if (lastStatus === 401 || lastStatus === 403)
    throw new HttpError(503, 'PROVIDER_NOT_CONFIGURED', `${provider} rejected the server credentials.`);
  if (lastStatus === 429 || lastStatus === 529)
    throw new HttpError(429, 'RATE_LIMITED', `${provider} is rate limiting requests. Please retry shortly.`);
  throw new HttpError(502, 'UPSTREAM_ERROR', `${provider} returned HTTP ${lastStatus}.`);
}
