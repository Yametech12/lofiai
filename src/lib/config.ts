/**
 * External service configuration
 */

export const MUSICGPT_CONFIG = {
  BASE_URL: 'https://api.musicgpt.com/api/public/v1',
  GENERATE_PATH: '/MusicAI',
  STATUS_PATH: '/byId',
  AUTH_HEADER_PREFIX: 'Bearer ',
} as const;

export const MUSICGPT_ENDPOINTS = {
  GENERATE: `${MUSICGPT_CONFIG.BASE_URL}${MUSICGPT_CONFIG.GENERATE_PATH}`,
  STATUS: `${MUSICGPT_CONFIG.BASE_URL}${MUSICGPT_CONFIG.STATUS_PATH}`,
} as const;

// Default conversion type for MusicGPT status queries
export const CONVERSION_TYPE = 'MUSIC_AI' as const;
