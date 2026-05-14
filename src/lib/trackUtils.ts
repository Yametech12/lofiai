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

  // Always return both v1 and v2 placeholders.
  // This way callers can detect when both are ready (vs only one being populated).
  // Filtering happens at display time, not here.
  return [v1, v2];
}

export function buildFailed(statusMsg: string | undefined) {
  return {
    status: 'failed',
    progress: 0,
    error: statusMsg || 'Generation failed',
  };
}

/**
 * Sort tracks v1-first, then v2, and return the preferred active index.
 * Prefers v2 with a playable URL; falls back to first playable track.
 *
 * Generic over T so callers with looser shape variants (e.g. `version?: 'v1' | 'v2'`)
 * can pass their own track types without forcing a structural cast.
 */
export function sortTracksAndPickActive<
  T extends {
    version?: 'v1' | 'v2' | string;
    url?: string | null;
    wavUrl?: string | null;
  }
>(tracks: T[]): { sorted: T[]; activeIndex: number } {
  const sorted = [...tracks].sort((a, b) => {
    if (a.version === b.version) return 0;
    if (a.version === 'v1') return -1;
    if (a.version === 'v2') return 1;
    return 0;
  });

  let activeIndex = sorted.findIndex(
    (t) => t.version === 'v2' && (t.url || t.wavUrl)
  );
  if (activeIndex < 0) {
    activeIndex = sorted.findIndex((t) => t.url || t.wavUrl);
  }
  if (activeIndex < 0) activeIndex = 0;

  return { sorted, activeIndex };
}
