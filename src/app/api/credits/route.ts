import { NextResponse } from 'next/server';
import { MUSICGPT_CONFIG } from '@/lib/config';
import {
  CREDITS_FETCH_TIMEOUT_MS,
  FETCH_RETRY_ATTEMPTS,
  FETCH_RETRY_BACKOFF_MS,
  ERROR_SERVER_KEY_NOT_CONFIGURED,
  ERROR_NETWORK,
  ERROR_API_KEY_INVALID,
} from '@/lib/constants';

// Ensure BASE_URL has trailing slash (BASE_URL already includes /v1)
const MUSICGPT_API_URL = MUSICGPT_CONFIG.BASE_URL.endsWith('/')
  ? MUSICGPT_CONFIG.BASE_URL
  : MUSICGPT_CONFIG.BASE_URL + '/';

async function fetchWithRetry(url: string, options: RequestInit, retries = FETCH_RETRY_ATTEMPTS, backoff = FETCH_RETRY_BACKOFF_MS) {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), CREDITS_FETCH_TIMEOUT_MS);
      const resp = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeout);
      return resp;
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, backoff * Math.pow(2, attempt)));
      }
    }
  }
  throw lastError;
}

function pickNumberField(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) return Number(value);
  return null;
}

async function fetchCredits(apiKey: string) {
  console.log('[fetchCredits] Fetching credits for key (first 10 chars):', apiKey.slice(0, 10) + '...');
   const response = await fetchWithRetry(MUSICGPT_API_URL, {
     method: 'GET',
     headers: {
       Authorization: `Bearer ${apiKey}`,
       'Content-Type': 'application/json',
     },
   });

  console.log('[fetchCredits] Response status:', response.status);
  const raw = await response.json().catch(() => ({}));
  console.log('[fetchCredits] Raw response:', JSON.stringify(raw).slice(0, 200));

  if (!response.ok) {
    const message = raw.message || raw.error || `MusicGPT API error: ${response.status}`;
    const err = new Error(message) as Error & { status?: number; data?: unknown };
    err.status = response.status;
    err.data = raw;
    throw err;
  }

  // MusicGPT response shape may vary; support common variants.
  const credits =
    pickNumberField(raw?.apiUser?.credits_available) ??
    pickNumberField(raw?.apiUser?.creditsAvailable) ??
    pickNumberField(raw?.credits_available) ??
    pickNumberField(raw?.creditsAvailable) ??
    pickNumberField(raw?.credits);

  console.log('[fetchCredits] Parsed credits:', credits);

  const planId = raw?.apiUser?.plan_id ?? raw?.apiUser?.planId ?? null;
  const totalChargedThisMonth =
    pickNumberField(raw?.apiUser?.total_charged_this_month) ?? pickNumberField(raw?.apiUser?.totalChargedThisMonth) ?? 0;

  const expiresAt = raw?.apiUser?.subscription_expires_at ?? raw?.apiUser?.subscriptionExpiresAt;

  // If we can't find credits, treat as invalid key (prevents false "valid" in UI).
  if (credits == null) {
    console.log('[fetchCredits] Credits field missing from response. Full raw:', JSON.stringify(raw).slice(0, 300));
    const err = new Error('MusicGPT credits field missing in response') as Error & { status?: number; data?: unknown };
    err.status = 401;
    err.data = raw;
    throw err;
  }

  return {
    credits,
    planId,
    totalChargedThisMonth,
    expiresAt,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const userApiKey = url.searchParams.get('userApiKey')?.trim();

  try {
    // Require user-provided key — no server key fallback
    if (userApiKey) {
      console.log('[credits] Validating user-provided key (first 10 chars):', userApiKey.slice(0, 10) + '...');
      const result = await fetchCredits(userApiKey);
      console.log('[credits] Validation success, credits:', result.credits);
      return NextResponse.json(result, { status: 200 });
    }

    console.log('[credits] No user API key provided');
    return NextResponse.json(
      {
        credits: null,
        error: ERROR_SERVER_KEY_NOT_CONFIGURED,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    const err = error as { message?: string; status?: number };
    const message = err?.message || String(error);

    const isNetworkError =
      message.includes('fetch failed') ||
      message.includes('ETIMEDOUT') ||
      message.includes('ECONNREFUSED') ||
      message.includes('ENOTFOUND') ||
      message.includes('ConnectTimeoutError');

    const statusFromMusicGPT = typeof err?.status === 'number' ? err.status : undefined;

    console.error('[credits] Error:', { message, status: statusFromMusicGPT, isNetworkError, rawError: error });

    if (!isNetworkError && (statusFromMusicGPT === 401 || statusFromMusicGPT === 403)) {
      return NextResponse.json(
        {
          credits: 0,
          error: ERROR_API_KEY_INVALID,
          details: message,
        },
        { status: 401 }
      );
    }

    if (!isNetworkError && statusFromMusicGPT) {
      return NextResponse.json(
        {
          credits: 0,
          error: ERROR_API_KEY_INVALID,
          details: message,
        },
        { status: statusFromMusicGPT }
      );
    }

     return NextResponse.json(
       {
         credits: 0,
         error: isNetworkError ? ERROR_NETWORK : (err?.message || 'Failed to fetch credits'),
       },
       { status: isNetworkError ? 503 : 500 }
     );
   }
 }
