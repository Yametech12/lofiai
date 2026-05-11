import { NextRequest, NextResponse } from 'next/server';
import apiKeyManager from '../../../utils/apiKeyManager';

const MUSICGPT_STATUS_URL = 'https://api.musicgpt.com/api/public/v1/byId';

async function fetchStatusWithKey(apiKey: string, taskId: string) {
  const url = new URL(MUSICGPT_STATUS_URL, 'https://api.musicgpt.com');
  url.searchParams.set('conversionType', 'MUSIC_AI');
  url.searchParams.set('task_id', taskId);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(25_000),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw {
      status: response.status,
      message:
        (data as { message?: string; error?: string }).message ||
        (data as { message?: string; error?: string }).error ||
        `MusicGPT API error: ${response.status}`,
      data,
    };
  }

  return await response.json();
}

function mapConversionToTracks(conversion: unknown) {
  const c = conversion as {
    conversion_path_1?: string | null;
    conversion_path_wav_1?: string | null;
    title_1?: string | null;
    conversion_duration_1?: number | null;

    conversion_path_2?: string | null;
    conversion_path_wav_2?: string | null;
    title_2?: string | null;
    conversion_duration_2?: number | null;

    status_msg?: string;
    status?: string;
    music_style?: string | null;
  };

  const v1 = {
    version: 'v1' as const,
    url: c.conversion_path_1 ?? null,
    wavUrl: c.conversion_path_wav_1 ?? null,
    title: c.title_1 ?? null,
    duration: c.conversion_duration_1 ?? null,
  };

  const v2 = {
    version: 'v2' as const,
    url: c.conversion_path_2 ?? null,
    wavUrl: c.conversion_path_wav_2 ?? null,
    title: c.title_2 ?? null,
    duration: c.conversion_duration_2 ?? null,
  };

  const tracks: Array<{
    version: 'v1' | 'v2';
    url: string | null;
    wavUrl: string | null;
    title: string | null;
    duration: number | null;
  }> = [];

  if (v1.url || v1.wavUrl || v1.title) tracks.push(v1);
  if (v2.url || v2.wavUrl || v2.title) tracks.push(v2);
  if (tracks.length === 0) return [v1];
  return tracks;
}

function buildFailed(statusMsg: string | undefined) {
  return {
    status: 'failed',
    progress: 0,
    error: statusMsg || 'Generation failed',
  };
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
      const send = (data: unknown, event?: string) => {
        try {
          controller.enqueue(encoder.encode(formatSseMessage(data, event)));
        } catch {
          // Ignore enqueue errors if the stream is already closed
        }
      };


      // SSE headers are set via NextResponse below.
      send({ status: 'processing', progress: 0, message: 'Starting stream...' });

      const abort = new AbortController();
      const intervalMs = 2000;

      const sendFinalAndClose = (data: unknown) => {
        send(data, 'done');
        try {
          controller.close();
        } catch {}
        abort.abort();
      };

      const pollOnce = async () => {
        try {
          // User key path
          if (userApiKey) {
            const data = await fetchStatusWithKey(userApiKey, taskId);

            if (!data?.success) {
              sendFinalAndClose(buildFailed(data?.message || data?.error));
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
              message: conversion.status_msg || 'Processing...',
            });
            return;
          }

          // Server key path
          const validKeys = apiKeyManager.getValidKeys();
          if (!validKeys.length) {
            sendFinalAndClose({
              status: 'failed',
              progress: 0,
              error: 'MusicGPT API key not configured or all keys invalid',
            });
            return;
          }

          let lastError: { status?: number; message?: string } | null = null;

          for (const key of validKeys) {
            try {
              const data = await fetchStatusWithKey(key, taskId);
              if (!data?.success) {
                sendFinalAndClose(buildFailed(data?.message || data?.error));
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
                message: conversion.status_msg || 'Processing...',
              });
              return;
            } catch (error: unknown) {
              const err = error as { status?: number; message?: string };
              lastError = err;

              if (err?.status === 401 || err?.status === 403 || err?.status === 429) {
                apiKeyManager.markKeyInvalid(key);
                continue;
              }

              // Non-auth failures: surface after loop
              break;
            }
          }

          sendFinalAndClose({
            status: 'failed',
            progress: 0,
            error: lastError?.message || 'Internal server error',
          });
        } catch (error: unknown) {
          const err = error as { status?: number; message?: string };
          if (err?.status === 401) {
            sendFinalAndClose({
              status: 'failed',
              progress: 0,
              error: 'Invalid API key. Please check your MusicGPT API key.',
            });
            return;
          }

          sendFinalAndClose({
            status: 'failed',
            progress: 0,
            error: err?.message || 'Internal server error',
          });
        }
      };

      // Poll immediately, then at interval.
      await pollOnce();

      const timer = setInterval(() => {
        if (abort.signal.aborted) return;
        pollOnce();
      }, intervalMs);

      abort.signal.addEventListener('abort', () => clearInterval(timer));
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Ensure EventSource can read
      'Access-Control-Allow-Origin': '*',
    },
  });
}

