export interface Track {
  version: 'v1' | 'v2';
  url: string | null;
  wavUrl: string | null;
  title: string | null;
  duration: number | null;
}

export function mapConversionToTracks(conversion: unknown): Track[] {
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

  const v1: Track = {
    version: 'v1',
    url: c.conversion_path_1 ?? null,
    wavUrl: c.conversion_path_wav_1 ?? null,
    title: c.title_1 ?? null,
    duration: c.conversion_duration_1 ?? null,
  };

  const v2: Track = {
    version: 'v2',
    url: c.conversion_path_2 ?? null,
    wavUrl: c.conversion_path_wav_2 ?? null,
    title: c.title_2 ?? null,
    duration: c.conversion_duration_2 ?? null,
  };

  const tracks: Track[] = [];

  if (v1.url || v1.wavUrl || v1.title) tracks.push(v1);
  if (v2.url || v2.wavUrl || v2.title) tracks.push(v2);

  if (tracks.length === 0) return [v1];
  return tracks;
}

export function buildFailed(statusMsg: string | undefined) {
  return {
    status: 'failed',
    progress: 0,
    error: statusMsg || 'Generation failed',
  };
}
