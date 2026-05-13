import { NextRequest, NextResponse } from 'next/server';
import { mapConversionToTracks, buildFailed } from '@/lib/trackUtils';
import { MUSICGPT_CONFIG, CONVERSION_TYPE } from '@/lib/config';
import {
  FETCH_TIMEOUT_MS,
  FETCH_RETRY_ATTEMPTS,
  FETCH_RETRY_BACKOFF_MS,
  ERROR_TASK_ID_REQUIRED,
  ERROR_GENERATION_FAILED,
  MESSAGE_PROCESSING_DEFAULT,
  ERROR_API_KEY_INVALID,
  ERROR_NETWORK,
  ERROR_API_KEY_MISSING,
  ERROR_TIMEOUT,
} from '@/lib/constants';

const MUSICGPT_STATUS_URL = `${MUSICGPT_CONFIG.BASE_URL}${MUSICGPT_CONFIG.STATUS_PATH}`;

async function fetchWithRetry(url: string, options: RequestInit, retries = FETCH_RETRY_ATTEMPTS, backoff = FETCH_RETRY_BACKOFF_MS) {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
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

async function fetchStatusWithKey(apiKey: string, taskId: string) {
  const url = new URL(MUSICGPT_STATUS_URL);
  url.searchParams.set('conversionType', CONVERSION_TYPE);
  url.searchParams.set('task_id', taskId);

  const response = await fetchWithRetry(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const retryAfter = response.headers.get('Retry-After');
    throw {
      status: response.status,
      message:
        (data as { message?: string; error?: string }).message ||
        (data as { message?: string; error?: string }).error ||
        `MusicGPT API error: ${response.status}`,
      data,
      retryAfter: retryAfter ? parseInt(retryAfter, 10) : null,
    };
  }

  return await response.json();
}



export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;
    const { searchParams } = new URL(request.url);
    const userApiKey = searchParams.get('userApiKey');

    if (!taskId) {
      return NextResponse.json({ error: ERROR_TASK_ID_REQUIRED }, { status: 400 });
    }

    if (userApiKey?.trim()) {
      try {
        const data = await fetchStatusWithKey(userApiKey.trim(), taskId);

        if (!data?.success) {
          return NextResponse.json(
            {
              status: 'failed',
              progress: 0,
              error: data?.message || data?.error || ERROR_GENERATION_FAILED,
            },
            { status: 200 }
          );
        }

        const conversion = data.conversion;
        if (!conversion) {
          return NextResponse.json(
            {
              status: 'failed',
              progress: 0,
              error: 'No conversion data returned',
            },
            { status: 200 }
          );
        }

        const currentStatus = conversion.status || 'PROCESSING';
        const tracks = mapConversionToTracks(conversion);
        const audioUrl = tracks[0]?.url || null;

        const isCompleted = currentStatus === 'COMPLETED' || !!audioUrl;
        const isFailed = currentStatus === 'FAILED' || currentStatus === 'ERROR';

        if (isCompleted) {
          return NextResponse.json({
            status: 'completed',
            progress: 100,
            audioUrl,
            title: tracks[0]?.title || conversion.title_1 || conversion.title_2 || null,
            music_style: conversion.music_style || null,
            tracks: tracks,
          });
        }

        if (isFailed) {
          return NextResponse.json(buildFailed(conversion.status_msg), { status: 200 });
        }

        return NextResponse.json({
          status: 'processing',
          progress: 50,
          message: conversion.status_msg || MESSAGE_PROCESSING_DEFAULT,
        });
      } catch (error: unknown) {
        const err = error as { status?: number; message?: string; retryAfter?: number };
        const status = err?.status || 500;
        const message = err?.message || 'Internal server error';
        const isNetworkError = message.includes('fetch failed') || message.includes('ETIMEDOUT') || message.includes('ECONNREFUSED') || message.includes('ENOTFOUND') || message.includes('ConnectTimeoutError');

        if (status === 401) {
          return NextResponse.json({
            status: 'failed',
            progress: 0,
            error: ERROR_API_KEY_INVALID,
          }, { status: 200 });
        }

        if (status === 429) {
          return NextResponse.json({
            status: 'failed',
            progress: 0,
            error: `MusicGPT rate limit: ${message}. ${err?.retryAfter ? `Try again in ${err.retryAfter}s.` : 'Please wait.'}`,
            rateLimit: err?.retryAfter ? { remaining: 0, resetMs: Date.now() + err.retryAfter * 1000 } : undefined,
          }, { status: 200 });
        }

        console.error('Error in status API:', error, 'network:', isNetworkError);
        return NextResponse.json({
          error: isNetworkError ? ERROR_NETWORK : message
        }, { status: isNetworkError ? 503 : status });
       }
    }
    return NextResponse.json(
      { status: 'failed', progress: 0, error: ERROR_API_KEY_MISSING },
      { status: 200 }
    );
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      return NextResponse.json({ error: ERROR_TIMEOUT }, { status: 504 });
    }
    console.error('Error in status API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
