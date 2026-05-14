import { NextRequest, NextResponse } from 'next/server';
import { mapConversionToTracks, buildFailed } from '@/lib/trackUtils';
import { MUSICGPT_CONFIG, CONVERSION_TYPE } from '@/lib/config';
import { fetchWithRetry, isNetworkError } from '@/lib/fetchWithRetry';
import {
  FETCH_RETRY_ATTEMPTS,
  FETCH_RETRY_BACKOFF_MS,
  STREAM_FETCH_TIMEOUT_MS,
  POLL_INTERVAL_MS,
  MAX_POLL_ATTEMPTS,
  MESSAGE_PROCESSING_DEFAULT,
  ERROR_API_KEY_MISSING,
  ERROR_API_KEY_INVALID,
  ERROR_NETWORK,
  ERROR_GENERATION_FAILED,
} from '@/lib/constants';

const MUSICGPT_STATUS_URL = `${MUSICGPT_CONFIG.BASE_URL}${MUSICGPT_CONFIG.STATUS_PATH}`;

// Server-side max stream duration — prevents runaway polling if client never disconnects
const MAX_STREAM_DURATION_MS = MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS;

async function fetchStatusWithKey(apiKey: string, taskId: string) {
  const url = new URL(MUSICGPT_STATUS_URL);
  url.searchParams.set('conversionType', CONVERSION_TYPE);
  url.searchParams.set('task_id', taskId);

  const response = await fetchWithRetry(
    url.toString(),
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    },
    FETCH_RETRY_ATTEMPTS,
    FETCH_RETRY_BACKOFF_MS,
    STREAM_FETCH_TIMEOUT_MS
  );

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

  if (!taskId) {
    return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
  }

  // Prefer Authorization header; fall back to query param for backward compat.
  const authHeader = request.headers.get('authorization');
  const headerKey = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const queryKey = new URL(request.url).searchParams.get('userApiKey')?.trim() ?? null;
  const userApiKey = headerKey || queryKey || undefined;

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

      // Abort when client disconnects
      const onRequestAbort = () => abort.abort();
      request.signal.addEventListener('abort', onRequestAbort);
      if (request.signal.aborted) abort.abort();

      // Server-side timeout — abort after max duration regardless of client
      const serverTimeout = setTimeout(() => {
        if (!abort.signal.aborted) {
          send({ status: 'failed', progress: 0, error: 'Generation timed out on server.' });
          try { controller.close(); } catch {}
          abort.abort();
        }
      }, MAX_STREAM_DURATION_MS);

      const sendFinalAndClose = (data: unknown) => {
        send(data);
        clearTimeout(serverTimeout);
        try { controller.close(); } catch {}
        abort.abort();
      };

      const pollOnce = async () => {
        try {
          if (userApiKey) {
            const data = await fetchStatusWithKey(userApiKey, taskId);

            if (!data?.success) {
              sendFinalAndClose(
                buildFailed(data?.message || data?.error || ERROR_GENERATION_FAILED)
              );
              return;
            }

            const conversion = data.conversion;
            if (!conversion) {
              sendFinalAndClose(buildFailed('No conversion data returned'));
              return;
            }

            const currentStatus = conversion.status || 'PROCESSING';
            const allTracks = mapConversionToTracks(conversion);
            const playableTracks = allTracks.filter((t) => t?.url || t?.wavUrl);
            const playableCount = playableTracks.length;
            const audioUrl = playableTracks[0]?.url || playableTracks[0]?.wavUrl || null;

            // Only mark complete when MusicGPT explicitly says COMPLETED,
            // or when BOTH variants (v1 + v2) are playable.
            const isCompleted = currentStatus === 'COMPLETED' || playableCount >= 2;

            const isFailed = currentStatus === 'FAILED' || currentStatus === 'ERROR';

            if (isCompleted) {
              sendFinalAndClose({
                status: 'completed',
                progress: 100,
                audioUrl,
                title:
                  playableTracks[0]?.title ||
                  conversion.title_1 ||
                  conversion.title_2 ||
                  null,
                music_style: conversion.music_style || null,
                tracks: playableTracks,
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

          sendFinalAndClose({ status: 'failed', progress: 0, error: ERROR_API_KEY_MISSING });
        } catch (error: unknown) {
          const err = error as { status?: number; message?: string; retryAfter?: number };
          const status = err?.status || 500;

          if (status === 401) {
            sendFinalAndClose({ status: 'failed', progress: 0, error: ERROR_API_KEY_INVALID });
            return;
          }

          if (status === 429) {
            sendFinalAndClose({
              status: 'failed',
              progress: 0,
              error: `MusicGPT rate limit: ${err?.message || 'Too many requests'}.${
                err?.retryAfter ? ` Try again in ${err.retryAfter}s.` : ''
              }`,
            });
            return;
          }

          const message = err?.message || 'Internal server error';
          sendFinalAndClose({
            error: isNetworkError(message) ? ERROR_NETWORK : message,
          });
        }
      };

      // First poll immediately
      await pollOnce();

      if (abort.signal.aborted) {
        clearTimeout(serverTimeout);
        request.signal.removeEventListener('abort', onRequestAbort);
        return;
      }

      // Polling interval
      const timer = setInterval(() => {
        if (abort.signal.aborted) return;
        pollOnce();
      }, POLL_INTERVAL_MS);

      abort.signal.addEventListener('abort', () => {
        clearInterval(timer);
        clearTimeout(serverTimeout);
        request.signal.removeEventListener('abort', onRequestAbort);
      });
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
