import { NextRequest, NextResponse } from 'next/server';

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
    signal: AbortSignal.timeout(30_000),
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


  // Always include v1 first if it has a URL, then v2.
  // IMPORTANT: keep both tracks (even if urls match) when present,
  // so the UI's v1/v2 selection always maps deterministically.
  const tracks: Array<{
    version: 'v1' | 'v2';
    url: string | null;
    wavUrl: string | null;
    title: string | null;
    duration: number | null;
  }> = [];

  if (v1.url || v1.wavUrl || v1.title) {
    tracks.push(v1);
  }
  if (v2.url || v2.wavUrl || v2.title) {
    tracks.push(v2);
  }

  // Final fallback: if we truly got nothing, still return v1 shape.
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;
    const { searchParams } = new URL(request.url);
    const userApiKey = searchParams.get('userApiKey');

    if (!taskId) {
      return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
    }

    // If user provided their own API key, use it directly
    if (userApiKey?.trim()) {
      try {
        const data = await fetchStatusWithKey(userApiKey.trim(), taskId);

        if (!data?.success) {
          return NextResponse.json(
            {
              status: 'failed',
              progress: 0,
              error: data?.message || data?.error || 'Generation failed',
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
          message: conversion.status_msg || 'Processing...',
        });
      } catch (error: unknown) {
        const err = error as { status?: number; message?: string };
        const status = err?.status || 500;
        const message = err?.message || 'Internal server error';


        // Handle authentication errors for user API key
        if (status === 401) {
          return NextResponse.json({
            status: 'failed',
            progress: 0,
            error: 'Invalid API key. Please check your MusicGPT API key.',
          }, { status: 200 });
        }

        return NextResponse.json({ error: message }, { status });
      }
    }

    return NextResponse.json(
      { status: 'failed', progress: 0, error: 'MusicGPT API key missing. Add your key in the web UI.' },
      { status: 200 }
    );
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      return NextResponse.json({ error: 'Request timed out. Please try again.' }, { status: 504 });
    }
    console.error('Error in status API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

