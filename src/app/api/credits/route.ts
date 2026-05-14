import { NextRequest, NextResponse } from 'next/server';
import { MUSICGPT_CONFIG } from '@/lib/config';
import { fetchWithRetry, isNetworkError } from '@/lib/fetchWithRetry';
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

function pickNumberField(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value)))
    return Number(value);
  return null;
}

async function fetchCredits(apiKey: string) {
  const response = await fetchWithRetry(
    MUSICGPT_API_URL,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    },
    FETCH_RETRY_ATTEMPTS,
    FETCH_RETRY_BACKOFF_MS,
    CREDITS_FETCH_TIMEOUT_MS
  );

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
    pickNumberField(raw?.apiUser?.total_charged_this_month) ??
    pickNumberField(raw?.apiUser?.totalChargedThisMonth) ??
    0;
  const expiresAt =
    raw?.apiUser?.subscription_expires_at ?? raw?.apiUser?.subscriptionExpiresAt;

  // If we can't find credits, treat as invalid key.
  if (credits == null) {
    const err = new Error('MusicGPT credits field missing in response') as Error & {
      status?: number;
      data?: unknown;
    };
    err.status = 401;
    err.data = raw;
    throw err;
  }

  return { credits, planId, totalChargedThisMonth, expiresAt };
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);

  // Prefer Authorization header; fall back to query param for backward compat.
  const authHeader = request.headers.get('authorization');
  const headerKey = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : null;
  const queryKey = url.searchParams.get('userApiKey')?.trim() ?? null;
  const userApiKey = headerKey || queryKey || null;

  try {
    if (userApiKey) {
      const result = await fetchCredits(userApiKey);
      return NextResponse.json(result, { status: 200 });
    }

    return NextResponse.json(
      { credits: null, error: ERROR_SERVER_KEY_NOT_CONFIGURED },
      { status: 200 }
    );
  } catch (error: unknown) {
    const err = error as { message?: string; status?: number };
    const message = err?.message || String(error);
    const networkErr = isNetworkError(message);
    const statusFromMusicGPT = typeof err?.status === 'number' ? err.status : undefined;

    if (process.env.NODE_ENV === 'development') {
      console.error('[credits] Error:', { message, status: statusFromMusicGPT, networkErr });
    }

    if (!networkErr && (statusFromMusicGPT === 401 || statusFromMusicGPT === 403)) {
      return NextResponse.json(
        { credits: 0, error: ERROR_API_KEY_INVALID, details: message },
        { status: 401 }
      );
    }

    if (!networkErr && statusFromMusicGPT) {
      return NextResponse.json(
        { credits: 0, error: ERROR_API_KEY_INVALID, details: message },
        { status: statusFromMusicGPT }
      );
    }

    return NextResponse.json(
      { credits: 0, error: networkErr ? ERROR_NETWORK : message },
      { status: networkErr ? 503 : 500 }
    );
  }
}
