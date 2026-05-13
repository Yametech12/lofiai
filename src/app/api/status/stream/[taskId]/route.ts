import { NextRequest, NextResponse } from 'next/server';
import { mapConversionToTracks, buildFailed } from '@/lib/trackUtils';
import { MUSICGPT_CONFIG, CONVERSION_TYPE } from '@/lib/config';
import {
  FETCH_RETRY_ATTEMPTS,
  FETCH_RETRY_BACKOFF_MS,
  STREAM_FETCH_TIMEOUT_MS,
  POLL_INTERVAL_MS,
  MESSAGE_PROCESSING_DEFAULT,
  ERROR_API_KEY_MISSING,
  ERROR_API_KEY_INVALID,
  ERROR_NETWORK,
  ERROR_GENERATION_FAILED,
} from '@/lib/constants';

const MUSICGPT_STATUS_URL = `${MUSICGPT_CONFIG.BASE_URL}${MUSICGPT_CONFIG.STATUS_PATH}`;

async function fetchWithRetry(url: string, options: RequestInit, retries = FETCH_RETRY_ATTEMPTS, backoff = FETCH_RETRY_BACKOFF_MS) {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), STREAM_FETCH_TIMEOUT_MS);
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



function formatSseMessage(payload: unknown, event = 'message') {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const { searchParams } = new URL(request.url);
  const userApiKey = searchParams.get('userApiKey')?.trim() || undefined;

  if (!taskId) {
    return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (data: unknown, event = 'message') => {
        try {
          controller.enqueue(encoder.encode(formatSseMessage(data, event)));
        } catch {
          // Ignore enqueue errors if the stream is already closed
        }
      };

      send({ status: 'processing', progress: 0, message: 'Starting stream...' });

      const abort = new AbortController();
      const intervalMs = POLL_INTERVAL_MS;

      // When client disconnects, abort our polling
      const onRequestAbort = () => abort.abort();
      request.signal.addEventListener('abort', onRequestAbort);
      if (request.signal.aborted) {
        abort.abort();
      }

      const sendFinalAndClose = (data: unknown) => {
        send(data);
        try { controller.close(); } catch {}
        abort.abort();
      };

      const pollOnce = async () => {
        try {
          if (userApiKey) {
            const data = await fetchStatusWithKey(userApiKey, taskId);

            if (!data?.success) {
              sendFinalAndClose(buildFailed(data?.message || data?.error || ERROR_GENERATION_FAILED));
              return;
            }

            const conversion = data.conversion;
            if (!conversion) {
              sendFinalAndClose(buildFailed('No conversion data returned'));
              return;
            }

            const currentStatus = conversion.status || 'PROCESSING';
            const tracks = mapConversionToTracks(conversion);
            const audioUrl = tracks[0]?.url || null;

            const isCompleted = currentStatus === 'COMPLETED' || !!audioUrl;
            const isFailed = currentStatus === 'FAILED' || currentStatus === 'ERROR';

            if (isCompleted) {
              sendFinalAndClose({
                status: 'completed',
                progress: 100,
                audioUrl,
                title: tracks[0]?.title || conversion.title_1 || conversion.title_2 || null,
                music_style: conversion.music_style || null,
                tracks,
              });
              return;
            }

            if (isFailed) {
              sendFinalAndClose(buildFailed(conversion.status_msg));
              return;
            }

            send({
              status: 'processing',
              progress: 50,
              message: conversion.status_msg || MESSAGE_PROCESSING_DEFAULT,
            });
            return;
          }

          sendFinalAndClose({
            status: 'failed',
            progress: 0,
            error: ERROR_API_KEY_MISSING,
          });
        } catch (error: unknown) {
          const err = error as { status?: number; message?: string; retryAfter?: number };
          const status = err?.status || 500;

          if (status === 401) {
            sendFinalAndClose({
              status: 'failed',
              progress: 0,
              error: ERROR_API_KEY_INVALID,
            });
            return;
          }

          if (status === 429) {
            sendFinalAndClose({
              status: 'failed',
              progress: 0,
              error: `MusicGPT rate limit: ${err?.message || 'Too many requests'}.${err?.retryAfter ? ` Try again in ${err.retryAfter}s.` : ''}`,
            });
            return;
          }

          const message = err?.message || 'Internal server error';
          const isNetworkError = message.includes('fetch failed') || message.includes('ETIMEDOUT') || message.includes('ECONNREFUSED') || message.includes('ENOTFOUND') || message.includes('ConnectTimeoutError');
          sendFinalAndClose({
            error: isNetworkError ? ERROR_NETWORK : message
          });
        }
      };

      // Perform first poll
      await pollOnce();

      // If already aborted (e.g., client disconnected), do not set up interval
      if (abort.signal.aborted) {
        // Ensure listener removed to avoid leaks
        request.signal.removeEventListener('abort', onRequestAbort);
        return;
      }

      // Set up polling interval
      const timer = setInterval(() => {
        if (abort.signal.aborted) return;
        pollOnce();
      }, intervalMs);

      // Clear interval when abort signal fires
      abort.signal.addEventListener('abort', () => {
        clearInterval(timer);
        // Also clean up the request abort listener
        request.signal.removeEventListener('abort', onRequestAbort);
      });
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
