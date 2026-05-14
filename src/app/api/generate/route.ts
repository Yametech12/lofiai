import { NextRequest, NextResponse } from 'next/server';
import { MUSICGPT_ENDPOINTS } from '@/lib/config';
import { fetchWithRetry, isNetworkError } from '@/lib/fetchWithRetry';
import {
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_MS,
  FETCH_RETRY_ATTEMPTS,
  FETCH_RETRY_BACKOFF_MS,
  FETCH_TIMEOUT_MS,
  MAX_NUM_OUTPUTS,
  MIN_NUM_OUTPUTS,
  ERROR_RATE_LIMITED,
  ERROR_PROMPT_REQUIRED,
  ERROR_API_KEY_MISSING,
  ERROR_API_KEY_INVALID,
  ERROR_INSUFFICIENT_CREDITS,
  ERROR_NETWORK,
  ERROR_TIMEOUT,
  ERROR_INVALID_REQUEST,
} from '@/lib/constants';

// ---------------------------------------------------------------------------
// Rate limiting (in-memory — resets on cold start; good enough for single-instance)
// ---------------------------------------------------------------------------
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  if (entry.count >= RATE_LIMIT_MAX) return true;
  entry.count++;
  return false;
}

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

// ---------------------------------------------------------------------------
// MusicGPT generation request
// ---------------------------------------------------------------------------
async function sendGenerationRequest(
  apiKey: string,
  prompt: string,
  music_style?: string,
  lyrics?: string,
  make_instrumental?: boolean,
  vocal_only?: boolean,
  voice_id?: string,
  webhook_url?: string,
  output_length?: string,
  num_outputs?: string
) {
  const response = await fetchWithRetry(
    MUSICGPT_ENDPOINTS.GENERATE,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        ...(music_style && { music_style }),
        ...(lyrics && { lyrics }),
        ...(make_instrumental !== undefined && { make_instrumental }),
        ...(vocal_only !== undefined && { vocal_only }),
        ...(voice_id && { voice_id }),
        ...(webhook_url && { webhook_url }),
        ...(output_length && {
          output_length:
            output_length === '15' ? '15' : output_length === '60' ? '60' : '30',
        }),
        ...(num_outputs && {
          num_outputs: Math.min(
            MAX_NUM_OUTPUTS,
            Math.max(MIN_NUM_OUTPUTS, parseInt(num_outputs, 10))
          ),
        }),
      }),
    },
    FETCH_RETRY_ATTEMPTS,
    FETCH_RETRY_BACKOFF_MS,
    FETCH_TIMEOUT_MS
  );

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const retryAfter = response.headers.get('Retry-After');
    throw {
      status: response.status,
      message: data.message || data.error || `MusicGPT API error: ${response.status}`,
      data,
      retryAfter: retryAfter ? parseInt(retryAfter, 10) : null,
    };
  }

  const data = await response.json();

  if (!data.success) {
    throw {
      status: 402,
      message: data.error || data.message || 'Generation failed',
      code: data.error_code,
    };
  }

  return data;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    if (isRateLimited(ip)) {
      return NextResponse.json(
        {
          error: ERROR_RATE_LIMITED,
          rateLimit: { remaining: 0, resetMs: Date.now() + RATE_LIMIT_WINDOW_MS },
        },
        { status: 429 }
      );
    }

    const {
      prompt,
      music_style,
      lyrics,
      make_instrumental,
      vocal_only,
      voice_id,
      webhook_url,
      output_length,
      num_outputs,
      userApiKey,
    } = await request.json();

    if (!prompt) {
      return NextResponse.json({ error: ERROR_PROMPT_REQUIRED }, { status: 400 });
    }

    const userKey = userApiKey?.trim() || null;

    if (!userKey) {
      return NextResponse.json({ error: ERROR_API_KEY_MISSING }, { status: 401 });
    }

    try {
      const data = await sendGenerationRequest(
        userKey,
        prompt,
        music_style,
        lyrics,
        make_instrumental,
        vocal_only,
        voice_id,
        webhook_url,
        output_length,
        num_outputs
      );

      const taskId = data.task_id;
      if (!taskId) {
        console.error('No task_id in MusicGPT response:', data);
        return NextResponse.json(
          { error: 'Invalid response from MusicGPT API', details: data },
          { status: 502 }
        );
      }

      return NextResponse.json({
        taskId,
        conversionId1: data.conversion_id_1 || null,
        conversionId2: data.conversion_id_2 || null,
        eta: data.eta || null,
        creditEstimate: data.credit_estimate || null,
      });
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        return NextResponse.json({ error: ERROR_TIMEOUT }, { status: 504 });
      }

      const errorObj = error as {
        status?: number;
        message?: string;
        data?: unknown;
        retryAfter?: number;
      };

      if (errorObj.status === 401) {
        return NextResponse.json({ error: ERROR_API_KEY_INVALID }, { status: 401 });
      }

      if (errorObj.status === 402) {
        return NextResponse.json({ error: ERROR_INSUFFICIENT_CREDITS }, { status: 402 });
      }

      if (errorObj.status === 429) {
        return NextResponse.json(
          {
            error: errorObj.message || 'MusicGPT rate limit hit. Try again later.',
            rateLimit: errorObj.retryAfter
              ? { remaining: 0, resetMs: Date.now() + errorObj.retryAfter * 1000 }
              : undefined,
          },
          { status: 429 }
        );
      }

      const message = errorObj.message || String(error);
      const networkErr = isNetworkError(message);
      console.error('Error in generate API:', error, 'network:', networkErr);
      return NextResponse.json(
        { error: networkErr ? ERROR_NETWORK : message },
        { status: networkErr ? 503 : 500 }
      );
    }
  } catch (error) {
    console.error('Error parsing request:', error);
    return NextResponse.json({ error: ERROR_INVALID_REQUEST }, { status: 400 });
  }
}
