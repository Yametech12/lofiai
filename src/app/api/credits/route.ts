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

const MUSICGPT_API_URL = MUSICGPT_CONFIG.BASE_URL;

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
  const response = await fetchWithRetry(MUSICGPT_API_URL, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  const raw = await response.json().catch(() => ({}));

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

  const planId = raw?.apiUser?.plan_id ?? raw?.apiUser?.planId ?? null;
  const totalChargedThisMonth =
    pickNumberField(raw?.apiUser?.total_charged_this_month) ?? pickNumberField(raw?.apiUser?.totalChargedThisMonth) ?? 0;

  const expiresAt = raw?.apiUser?.subscription_expires_at ?? raw?.apiUser?.subscriptionExpiresAt;

  // If we can't find credits, treat as invalid key (prevents false "valid" in UI).
  if (credits == null) {
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

  const serverKey = process.env.MUSICGPT_API_KEY;

  try {
    // Prefer user key when provided — no fallback to server key
    if (userApiKey) {
      const result = await fetchCredits(userApiKey);
      return NextResponse.json(result, { status: 200 });
    }

    if (!serverKey?.trim()) {
      return NextResponse.json(
        {
          credits: 0,
          error: ERROR_SERVER_KEY_NOT_CONFIGURED,
        },
        { status: 200 }
      );
    }

    const result = await fetchCredits(serverKey.trim());
    return NextResponse.json(result, { status: 200 });
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

    // If MusicGPT says unauthorized/forbidden, propagate as 401 so the UI can show "invalid key"
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

    // Other non-network failures: treat as invalid key rather than "valid but missing credits"
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

    console.error('Error in credits API:', message, '(network:', isNetworkError, ')');
    return NextResponse.json(
      {
        credits: 0,
        error: isNetworkError ? ERROR_NETWORK : (err?.message || 'Failed to fetch credits'),
      },
      { status: isNetworkError ? 503 : 500 }
    );
  }
}
