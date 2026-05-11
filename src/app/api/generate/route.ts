import { NextRequest, NextResponse } from 'next/server';
import apiKeyManager from '../utils/apiKeyManager';

const MUSICGPT_API_URL = 'https://api.musicgpt.com/api/public/v1/MusicAI';


// Simple in-memory rate limiting: IP -> { count, resetAt }
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60_000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  if (entry.count >= RATE_LIMIT) return true;
  entry.count++;
  return false;
}

function getClientIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0].trim()
    || request.headers.get('x-real-ip') || 'unknown';
}

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
  const response = await fetch(MUSICGPT_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
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
      ...(output_length && { output_length }),
      ...(num_outputs && { num_outputs }),
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw {
      status: response.status,
      message: data.message || data.error || `MusicGPT API error: ${response.status}`,
      data,
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

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    if (isRateLimited(ip)) {
      return NextResponse.json({ error: 'Too many requests. Please wait a minute.' }, { status: 429 });
    }

    const { prompt, music_style, lyrics, make_instrumental, vocal_only, voice_id, webhook_url, output_length, num_outputs, userApiKey } = await request.json();

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    // Use user's API key if provided; otherwise fall back to server keys via apiKeyManager.
    const userKey = userApiKey?.trim() || null;
    const serverKeys = apiKeyManager.getValidKeys();

    if (!userKey && serverKeys.length === 0) {
      return NextResponse.json(
        { error: 'MusicGPT API key not configured (set MUSICGPT_API_KEY or MUSICGPT_API_KEYS_BACKUP).' },
        { status: 401 }
      );
    }

    // If user provided a key, try it once (and map auth/credits errors).
    if (userKey) {
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
          conversionId: data.conversion_id_1 || null,
          eta: data.eta || null,
          creditEstimate: data.credit_estimate || null,
        });
      } catch (error: unknown) {
        if (error instanceof Error && error.name === 'TimeoutError') {
          return NextResponse.json({ error: 'Request timed out. Please try again.' }, { status: 504 });
        }

        const errorObj = error as { status?: number; message?: string; data?: unknown };

        if (errorObj.status === 401) {
          return NextResponse.json(
            { error: 'Invalid API key. Please check your MusicGPT API key in settings.' },
            { status: 401 }
          );
        }

        if (errorObj.status === 402) {
          return NextResponse.json(
            { error: 'Insufficient credits. Please check your MusicGPT account.' },
            { status: 402 }
          );
        }

        if (errorObj.status === 429) {
          return NextResponse.json(
            { error: 'MusicGPT rate limit hit. Please wait and try again.' },
            { status: 429 }
          );
        }

        console.error('Error in generate API (user key):', error);
        return NextResponse.json({ error: errorObj.message || 'Internal server error' }, { status: 500 });
      }
    }

    // Otherwise, try each server key until one succeeds.
    let lastError: { status?: number; message?: string } | null = null;

    for (const serverKey of serverKeys) {
      try {
        const data = await sendGenerationRequest(
          serverKey,
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
          conversionId: data.conversion_id_1 || null,
          eta: data.eta || null,
          creditEstimate: data.credit_estimate || null,
        });
      } catch (error: unknown) {
        const errorObj = error as { status?: number; message?: string };
        lastError = errorObj;

        // Mark unusable keys invalid and continue.
        if (errorObj.status === 401 || errorObj.status === 403 || errorObj.status === 429) {
          apiKeyManager.markKeyInvalid(serverKey);
          continue;
        }

        if (errorObj.status === 402) {
          return NextResponse.json(
            { error: 'Insufficient credits. Please check your MusicGPT account.' },
            { status: 402 }
          );
        }

        // Non-auth failures: break and surface.
        break;
      }
    }

    const status = lastError?.status || 500;
    const message = lastError?.message || 'Internal server error';
    return NextResponse.json({ error: message }, { status });
  } catch (error) {

    console.error('Error parsing request:', error);
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
