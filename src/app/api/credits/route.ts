import { NextResponse } from 'next/server';

const MUSICGPT_API_URL = 'https://api.musicgpt.com/api/public/v1';

async function fetchCredits(apiKey: string) {
  const response = await fetch(MUSICGPT_API_URL, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const message = data.message || data.error || `MusicGPT API error: ${response.status}`;
    // Provide status for callers to decide whether to fall back.
    const err = new Error(message) as Error & { status?: number };
    err.status = response.status;
    throw err;
  }

  const data = await response.json();
  return {
    credits: data.apiUser?.credits_available ?? 0,
    planId: data.apiUser?.plan_id ?? null,
    totalChargedThisMonth: data.apiUser?.total_charged_this_month ?? 0,
    expiresAt: data.apiUser?.subscription_expires_at,
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const userApiKey = url.searchParams.get('userApiKey')?.trim();

    const serverKey = process.env.MUSICGPT_API_KEY;

    // Prefer user key when provided.
    if (userApiKey) {
      try {
        const result = await fetchCredits(userApiKey);
        return NextResponse.json(result);
      } catch (error: unknown) {
        const err = error as { message?: string; status?: number };
        // If the user key is invalid/auth-related, fall back to server key (if present)
        if (err?.status === 401 || err?.status === 403) {
          console.warn('Credits: user API key invalid, falling back to server key');
        } else {
          throw error;
        }
      }
    }

    if (!serverKey?.trim()) {
      return NextResponse.json({
        credits: 0,
        error: 'MusicGPT API key not configured. Add MUSICGPT_API_KEY to environment or set your user API key.',
      }, { status: 200 });
    }

    const result = await fetchCredits(serverKey.trim());
    return NextResponse.json(result);
  } catch (error: unknown) {
    const err = error as { message?: string; status?: number };
    console.error('Error in credits API:', err?.message || error);
    // Don’t hard-fail the UI: return a safe 200 with credits: 0 and an error.
    return NextResponse.json(
      { credits: 0, error: err?.message || 'Internal server error' },
      { status: 200 }
    );
  }

}