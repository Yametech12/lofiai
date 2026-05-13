/**
 * Global constants used throughout the application.
 * Centralizes magic numbers, strings, and configuration values.
 */

// ==================== Polling & Intervals ====================

export const POLL_INTERVAL_MS = 2000;
export const MAX_POLL_ATTEMPTS = 120; // 4 minutes at 2s interval
export const MESSAGE_CLEAR_DELAY_MS = 2000;
export const ERROR_DISMISS_DELAY_MS = 8000;
export const ERROR_CLEAR_DELAY_MS = 3000;
export const SSE_TIMEOUT_CHECK_MS = 1000;

// ==================== Timeouts (fetch) ====================

export const FETCH_TIMEOUT_MS = 30_000;
export const STREAM_FETCH_TIMEOUT_MS = 25_000;
export const CREDITS_FETCH_TIMEOUT_MS = 10_000;

// ==================== Retry ====================

export const FETCH_RETRY_ATTEMPTS = 2;
export const FETCH_RETRY_BACKOFF_MS = 500;

// ==================== Rate Limiting ====================

export const RATE_LIMIT_MAX = 5;
export const RATE_LIMIT_WINDOW_MS = 60_000;

// ==================== API Key ====================

// MusicGPT API keys can have various formats (alphanumeric with hyphens/underscores)
// No specific prefix validation — accept any sufficiently long, non-empty key
export const MIN_API_KEY_LENGTH = 20;
export const MAX_API_KEY_DISPLAY_LENGTH = 12; // For truncation in UI if needed

// ==================== Duration Options ====================

export const DURATION_15S = '15';
export const DURATION_30S = '30';
export const DURATION_60S = '60';
export const DURATION_OPTIONS = [DURATION_15S, DURATION_30S, DURATION_60S] as const;
export type DurationOption = typeof DURATION_OPTIONS[number];

// ==================== Credit Cost Estimates ====================

export const CREDITS_PER_SECOND: Record<string, number> = {
  '15': 0.0053,
  '30': 0.005,
  '60': 0.0047,
};
export const LOW_CREDITS_THRESHOLD = 1.0;

// ==================== Input Limits ====================

export const MAX_PROMPT_LENGTH = 280;
export const MAX_NUM_OUTPUTS = 4;
export const MIN_NUM_OUTPUTS = 1;

// ==================== Prompt Quality ====================

export const MIN_WORD_COUNT = 3;
export const SMART_EXPAND_MAX_WORDS = 6;

// ==================== Progress ====================

export const MAX_PROGRESS_PERCENT = 85;
export const COMPLETED_PROGRESS_PERCENT = 100;

// ==================== Storage Keys ====================

export const STORAGE_KEY_API_KEY = 'musicgpt_api_key';
export const STORAGE_KEY_HISTORY = 'ghostname_history';

// ==================== History ====================

export const MAX_HISTORY_ENTRIES = 5;

// ==================== User Messages ====================

export const MESSAGE_BEFORE_UNLOAD_GENERATING =
  'A track is currently generating. Are you sure you want to leave?';
export const MESSAGE_PROCESSING_DEFAULT = 'Processing your request...';
export const MESSAGE_SMART_EXPAND_TEMPLATE =
  '{prompt}, lo-fi atmosphere, vinyl crackle warmth, soft textures, 75-85 BPM';

// ==================== Error Messages ====================

export const ERROR_RATE_LIMITED = 'Too many requests from your IP. Please wait 60 seconds.';
export const ERROR_PROMPT_REQUIRED = 'Prompt is required';
export const ERROR_API_KEY_MISSING =
  'MusicGPT API key missing. Add your key in the web UI (settings panel).';
export const ERROR_API_KEY_INVALID = 'Invalid API key. Please check your MusicGPT API key in settings.';
export const ERROR_INSUFFICIENT_CREDITS = 'Insufficient credits. Please check your MusicGPT account.';
export const ERROR_NETWORK = 'Cannot reach MusicGPT API. Check your network/firewall or try again later.';
export const ERROR_TIMEOUT = 'Request timed out. Please try again.';
export const ERROR_TASK_ID_REQUIRED = 'Task ID is required';
export const ERROR_SERVER_KEY_NOT_CONFIGURED =
  'MusicGPT API key not configured. Add MUSICGPT_API_KEY to environment or set your user API key.';
export const ERROR_INVALID_REQUEST = 'Invalid request';
export const ERROR_GENERATION_FAILED = 'Generation failed';

// ==================== Featured Prompts ====================

export interface FeaturedPrompt {
  label: string;
  prompt: string;
  style: string;
}

export const FEATURED_PROMPTS = [
  {
    label: '🌧️ Rainy Night',
    prompt: 'Rainy night in Tokyo with vinyl crackle, mellow piano, and soft boom-bap drums',
    style: 'Lo-Fi Hip Hop',
  },
  {
    label: '☕ Coffee Shop',
    prompt: 'Cozy coffee shop ambience with fingerstyle guitar, lo-fi beats, and warm sunlight through windows',
    style: 'Lo-Fi Chill',
  },
  {
    label: '📚 Late Night Study',
    prompt: 'Late night study session with soft ambient pads, gentle rain, warm bass, and subtle vinyl texture',
    style: 'Ambient Lo-Fi',
  },
  {
    label: '🚗 Nostalgic Drive',
    prompt: 'Nostalgic late night highway drive with dreamy synths, slow drums, and rain on the windshield',
    style: 'Synthwave Lo-Fi',
  },
  {
    label: '☀️ Morning Jazz',
    prompt: 'Soft morning jazz café with upright bass, gentle brush drums, Rhodes piano, and rain outside',
    style: 'Jazz Lo-Fi',
  },
  {
    label: '🌊 Ocean Breeze',
    prompt: 'Relaxing ocean waves with ukulele, soft sea breeze ambience, and mellow lo-fi rhythm',
    style: 'Tropical Lo-Fi',
  },
  {
    label: '🏙️ Urban Twilight',
    prompt: 'Urban twilight cityscape with neon reflections, calm lo-fi beats, and gentle rainfall',
    style: 'Chillhop',
  },
  {
    label: '🌙 Midnight Dream',
    prompt: 'Floating through a midnight dreamscape with ethereal synths, soft trap hats, and warm pads',
    style: 'Dreamy Lo-Fi',
  },
] as const;

export const STYLE_SUGGESTIONS = [
  'Lo-Fi Hip Hop',
  'Lo-Fi Chill',
  'Ambient Lo-Fi',
  'Jazz Lo-Fi',
  'Synthwave Lo-Fi',
  'Chillhop',
  'Dreamy Lo-Fi',
  'Vaporwave',
  'Boombap',
  'Jazzy Hip Hop',
  'Chillwave',
  'Bedroom Pop',
] as const;

// ==================== Prompt Templates ====================

export const PROMPT_TEMPLATES: Record<string, string> = {
  rainy: 'rainy night in Tokyo, vinyl crackle, mellow piano chords, soft boom-bap drums, lo-fi aesthetic, 75 BPM',
  night: 'late night cityscape, ambient synth pads, gentle rainfall, warm vinyl warmth, dreamy atmosphere',
  coffee: 'cozy coffee shop ambience, fingerstyle guitar, subtle cup clinks, warm sunlight, relaxed mood',
  study: 'late night study session, soft ambient pads, gentle rain sounds, warm bass tones, focused energy',
  jazz: 'smooth jazz café, upright bass, brush drums, Rhodes piano, intimate room ambience',
  drive: 'nostalgic highway drive, dreamy synth leads, slow trap hats, rain on windshield, sunset glow',
  ocean: 'ocean waves washing ashore, ukulele strums, sea breeze ambience, tropical lofi rhythm',
  urban: 'urban twilight cityscape, neon light reflections, calm lo-fi beats, distant traffic hum',
  piano: 'solo piano lofi, soft key presses, room ambience, warm tape saturation, peaceful mood',
  guitar: 'acoustic guitar fingerstyle, warm bedside recording, vinyl crackle, gentle strums, cozy vibe',
};
