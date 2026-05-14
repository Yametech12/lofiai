# Implementation Plan: Fresh Project Structure

## Overview

Restructure the generatelofi application from a monolithic ~800+ line `page.tsx` into a clean, modular architecture. The approach is "lift and shift" — extract existing code into well-defined modules (types, services, hooks, components) without rewriting logic, then wire everything together in a thin page composition layer. TypeScript is used throughout.

## Tasks

- [ ] 1. Set up shared types and utility modules
  - [ ] 1.1 Create type definition files in `src/types/`
    - Create `src/types/track.ts` with `Track`, `TrackVersion` types
    - Create `src/types/generation.ts` with `GenerationStatus`, `GenerationRequest`, `GenerationApiResponse` types
    - Create `src/types/history.ts` with `HistoryEntry` type
    - Create `src/types/api.ts` with `CreditsApiResponse`, `StatusEventData`, `ServiceError`, `FeaturedPrompt` types
    - Create `src/types/index.ts` barrel file re-exporting all public types
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [ ] 1.2 Create `src/lib/formatters.ts` utility module
    - Extract `formatDuration` function from `page.tsx` into `src/lib/formatters.ts`
    - Extract `estimateCost` function from `page.tsx` into `src/lib/formatters.ts`
    - Use named exports with verb+noun naming convention
    - _Requirements: 7.2, 7.3, 7.4, 7.5_

  - [ ] 1.3 Create barrel files for directory structure
    - Create `src/hooks/index.ts` (empty initially, will re-export hooks as they are created)
    - Create `src/services/index.ts` (empty initially)
    - Create `src/components/generation/index.ts` (empty initially)
    - Create `src/components/player/index.ts` (empty initially)
    - Create `src/components/history/index.ts` (empty initially)
    - Create `src/components/common/index.ts` (empty initially)
    - _Requirements: 5.1, 5.4, 5.5_

- [ ] 2. Implement service layer
  - [ ] 2.1 Create `src/services/creditsService.ts`
    - Implement `fetchCredits(apiKey?: string): Promise<CreditsResponse>` wrapping `/api/credits` GET
    - Include Bearer token in Authorization header when apiKey is provided
    - Throw typed `ServiceError` with status 503 on network failures
    - Throw typed `ServiceError` preserving upstream status code on non-success responses
    - _Requirements: 4.1, 4.3, 4.5, 4.6, 4.7_

  - [ ] 2.2 Create `src/services/generationService.ts`
    - Implement `startGeneration(params: GenerationRequest): Promise<GenerationResponse>` wrapping `/api/generate` POST
    - Include Bearer token in Authorization header when apiKey is provided
    - Throw typed `ServiceError` on network/HTTP failures
    - _Requirements: 4.1, 4.2, 4.5, 4.6, 4.7_

  - [ ] 2.3 Create `src/services/statusService.ts`
    - Implement `connectStatusStream(taskId, apiKey, onEvent, onError): { close: () => void }` wrapping `/api/status/stream/[taskId]` SSE
    - Parse incoming SSE events into typed `StatusEventData` objects
    - Invoke caller-supplied callbacks for each parsed event
    - _Requirements: 4.1, 4.4, 4.7_

  - [ ] 2.4 Update `src/services/index.ts` barrel file
    - Re-export all service modules
    - _Requirements: 5.4_

  - [ ]* 2.5 Write property tests for service layer
    - **Property 7: Service error propagation** — verify ServiceError with status 503 on network failures, upstream status preserved on HTTP errors
    - **Property 8: Service authorization header** — verify Bearer token included for non-empty apiKey
    - **Validates: Requirements 4.5, 4.6, 4.7**

- [ ] 3. Implement custom hooks
  - [ ] 3.1 Create `src/hooks/useCredits.ts`
    - Extract credits fetching logic from `page.tsx` into hook
    - Use `creditsService` for API calls
    - Return typed interface: `{ credits, creditsLoadFailed, creditsLow, refreshCredits }`
    - Implement cleanup for any pending fetch on unmount
    - _Requirements: 2.1, 2.6, 2.8, 2.9, 2.10, 2.11_

  - [ ] 3.2 Create `src/hooks/usePromptExpand.ts`
    - Extract smart expand logic (keyword template matching, generic expansion for short prompts) from `page.tsx`
    - Return typed interface: `{ smartExpand, canExpand }`
    - Contain no JSX elements
    - _Requirements: 2.1, 2.7, 2.8, 2.9_

  - [ ] 3.3 Create `src/hooks/useTrackHistory.ts`
    - Extract history management (load from localStorage, save, select, limit to 5 entries) from `page.tsx`
    - Use `STORAGE_KEY_HISTORY` and `MAX_HISTORY_ENTRIES` constants
    - Return typed interface: `{ history, showHistory, saveToHistory, selectFromHistory, toggleHistory }`
    - Implement cleanup and error handling for localStorage operations
    - _Requirements: 2.1, 2.5, 2.8, 2.9, 2.10, 2.11_

  - [ ] 3.4 Create `src/hooks/useAudioPlayer.ts`
    - Extract audio playback control (play, pause, seek, volume, loop, Web Audio API setup) from `page.tsx`
    - Manage AudioContext, AnalyserNode, GainNode lifecycle
    - Return typed interface: `{ isPlaying, isLooping, currentTime, trackDuration, volume, shouldRefreshAudioKey, analyserNode, togglePlayPause, toggleLoop, seek, setVolume, setCurrentTime, setTrackDuration, onEnded, onError, audioRef }`
    - Release AudioContext and disconnect nodes on unmount
    - _Requirements: 2.1, 2.3, 2.8, 2.9, 2.10, 2.11_

  - [ ] 3.5 Create `src/hooks/useAudioVisualizer.ts`
    - Extract canvas animation loop (AnalyserNode frequency data, requestAnimationFrame) from `page.tsx`
    - Accept AnalyserNode reference and playing state as parameters
    - Return typed interface: `{ canvasRef }`
    - Cancel animation frame on unmount or when playback stops
    - _Requirements: 2.1, 2.4, 2.8, 2.9, 2.10_

  - [ ] 3.6 Create `src/hooks/useGeneration.ts`
    - Extract generation orchestration (submit, SSE streaming, polling fallback, cancel, retry, error handling) from `page.tsx`
    - Use `generationService` and `statusService` for API communication
    - Manage all generation-related state (status, progress, tracks, errors, etc.)
    - Return typed interface matching `UseGenerationReturn` from design
    - Release EventSource, clear intervals/timeouts on unmount
    - Implement beforeunload warning during generation
    - _Requirements: 2.1, 2.2, 2.8, 2.9, 2.10, 2.11_

  - [ ] 3.7 Update `src/hooks/index.ts` barrel file
    - Re-export all hook modules
    - _Requirements: 5.4_

  - [ ]* 3.8 Write property tests for hooks
    - **Property 3: History length invariant** — verify history array never exceeds MAX_HISTORY_ENTRIES (5) for any sequence of saveToHistory calls
    - **Property 4: Smart expand keyword matching** — verify correct template returned for keyword prompts, generic expansion for 2-5 word prompts without keywords
    - **Property 5: Hook files contain no JSX** — verify no JSX elements in any hook file
    - **Validates: Requirements 2.5, 2.7, 2.9**

- [ ] 4. Checkpoint - Ensure hooks and services compile
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Implement UI components
  - [ ] 5.1 Create `src/components/common/ShimmerCard.tsx`
    - Extract `ShimmerCard` component from `page.tsx`
    - Pure presentational component, no props needed
    - Keep under 150 lines
    - _Requirements: 1.2, 1.12_

  - [ ] 5.2 Create `src/components/common/ErrorBanner.tsx`
    - Create `ErrorBanner` component accepting `ErrorBannerProps` (error, errorDetails, retryCount, canRetry, onRetry, onDismiss)
    - Extract error banner rendering logic from `page.tsx`
    - Keep under 150 lines
    - _Requirements: 1.2, 1.12, 8.4_

  - [ ] 5.3 Create `src/components/common/CreditsDisplay.tsx`
    - Create `CreditsDisplay` component accepting `CreditsDisplayProps` (credits, creditsLoadFailed, creditsLow, onRefresh)
    - Extract credits display rendering from `page.tsx`
    - Keep under 150 lines
    - _Requirements: 1.9, 1.12_

  - [ ] 5.4 Update `src/components/common/index.ts` barrel
    - Re-export ShimmerCard, ErrorBanner, CreditsDisplay
    - _Requirements: 5.4, 5.5_

  - [ ] 5.5 Create `src/components/generation/GenerationForm.tsx`
    - Create `GenerationForm` component accepting `GenerationFormProps` (prompt, musicStyle, makeInstrumental, numOutputs, outputLength, handlers, textareaRef)
    - Extract prompt textarea, style selector, duration picker, instrumental toggle, output count UI from `page.tsx`
    - Include smart expand button and copy prompt button
    - Keep under 150 lines (split into sub-components if needed)
    - _Requirements: 1.3, 1.2, 1.12_

  - [ ] 5.6 Create `src/components/generation/GenerationProgress.tsx`
    - Create `GenerationProgress` component accepting `GenerationProgressProps` (progress, processingMessage, eta, pollAttempts, onCancel)
    - Extract progress bar, status messages, cancel button from `page.tsx`
    - Keep under 150 lines
    - _Requirements: 1.7, 1.2, 1.12_

  - [ ] 5.7 Create `src/components/generation/FeaturedPrompts.tsx`
    - Create `FeaturedPrompts` component accepting `FeaturedPromptsProps` (prompts, isWorking, onSelect)
    - Extract featured prompts grid from `page.tsx`
    - Keep under 150 lines
    - _Requirements: 1.10, 1.2, 1.12_

  - [ ] 5.8 Update `src/components/generation/index.ts` barrel
    - Re-export GenerationForm, GenerationProgress, FeaturedPrompts
    - _Requirements: 5.4, 5.5_

  - [ ] 5.9 Create `src/components/player/AudioPlayer.tsx`
    - Create `AudioPlayer` component accepting `AudioPlayerProps` (audioUrl, isPlaying, isLooping, currentTime, trackDuration, volume, handlers, audioRef)
    - Extract play/pause button, progress bar, volume slider, loop toggle from `page.tsx`
    - Include PlayIcon and PauseIcon inline or as sub-components
    - Keep under 150 lines
    - _Requirements: 1.4, 1.2, 1.12_

  - [ ] 5.10 Create `src/components/player/AudioVisualizer.tsx`
    - Create `AudioVisualizer` component accepting `AudioVisualizerProps` (canvasRef, isPlaying)
    - Extract canvas element rendering from `page.tsx`
    - Keep under 150 lines
    - _Requirements: 1.5, 1.2, 1.12_

  - [ ] 5.11 Create `src/components/player/TrackSelector.tsx`
    - Create `TrackSelector` component accepting `TrackSelectorProps` (tracks, activeTrackIndex, onSelect)
    - Extract track tab selection UI from `page.tsx`
    - Keep under 150 lines
    - _Requirements: 1.6, 1.2, 1.12_

  - [ ] 5.12 Update `src/components/player/index.ts` barrel
    - Re-export AudioPlayer, AudioVisualizer, TrackSelector
    - _Requirements: 5.4, 5.5_

  - [ ] 5.13 Create `src/components/history/TrackHistory.tsx`
    - Create `TrackHistory` component accepting `TrackHistoryProps` (entries, onSelect)
    - Extract track history panel rendering from `page.tsx`
    - Keep under 150 lines
    - _Requirements: 1.8, 1.2, 1.12_

  - [ ] 5.14 Update `src/components/history/index.ts` barrel
    - Re-export TrackHistory
    - _Requirements: 5.4, 5.5_

  - [ ]* 5.15 Write property test for component file size
    - **Property 1: Component file size limit** — verify all files in `src/components/` are <= 150 lines
    - **Validates: Requirements 1.2**

- [ ] 6. Checkpoint - Ensure all components compile
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Rewrite page.tsx as composition layer
  - [ ] 7.1 Rewrite `src/app/page.tsx` as thin composition layer
    - Import all hooks from `@/hooks`
    - Import all components from `@/components/generation`, `@/components/player`, `@/components/history`, `@/components/common`
    - Compose hooks and pass state/actions to components as props
    - Maintain `'use client'` directive as first line
    - Keep under 100 lines (function body)
    - Allow at most 2 local `useState` declarations for UI-only state (e.g., showHistory toggle)
    - Produce identical rendered HTML structure and CSS class assignments as original
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [ ] 7.2 Update all import paths to use `@/` path aliases
    - Ensure all cross-directory imports use `@/components`, `@/hooks`, `@/services`, `@/types`, `@/lib` aliases
    - Remove any relative paths that traverse above the importing file's parent directory
    - Verify no circular import dependencies exist
    - _Requirements: 5.6, 1.12_

  - [ ]* 7.3 Write property tests for page structure
    - **Property 11: Page component state delegation** — verify page.tsx contains at most 2 useState declarations
    - **Property 2: No circular import dependencies** — verify no circular imports in component tree
    - **Validates: Requirements 6.2, 1.12**

- [ ] 8. Integration verification and cleanup
  - [ ] 8.1 Verify functional equivalence
    - Run `npm run build` and ensure zero errors
    - Run `npm run lint` and ensure no new lint errors
    - Verify all existing localStorage keys (`musicgpt_api_key`, `ghostname_history`) remain compatible
    - Verify API routes unchanged: `/api/generate` (POST), `/api/credits` (GET), `/api/status/stream/[taskId]` (GET), `/api/status/[taskId]` (GET)
    - Verify `beforeunload` warning fires during generation
    - Verify error auto-dismiss timing (8000ms) and cancel clear delay (3000ms) preserved
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [ ] 8.2 Clean up old inline code from page.tsx
    - Remove any dead code, unused imports, or leftover inline helper functions
    - Ensure `page.tsx` contains no `formatDuration`, `estimateCost`, `ShimmerCard`, `PlayIcon`, `PauseIcon` definitions
    - Update `src/lib/formatters.ts` imports in any consuming files
    - _Requirements: 6.6, 7.6_

  - [ ]* 8.3 Write property tests for import conventions
    - **Property 6: Type import consistency** — verify no local type redefinitions for types exported from `src/types/`
    - **Property 9: Import path convention** — verify all cross-directory imports use `@/` aliases
    - **Property 10: HistoryEntry serialization round-trip** — verify JSON.stringify/parse produces identical objects
    - **Validates: Requirements 3.6, 3.8, 3.9, 5.6, 8.3**

- [ ] 9. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The existing `src/app/api/` routes and `src/lib/config.ts`, `src/lib/constants.ts`, `src/lib/trackUtils.ts` remain unchanged
- All imports should use `@/` path aliases for cross-directory references
- The `ApiKeyInput.tsx` and `ErrorBoundary.tsx` components remain at their current locations

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3"] },
    { "id": 2, "tasks": ["2.4", "2.5", "3.1", "3.2", "3.3"] },
    { "id": 3, "tasks": ["3.4", "3.5"] },
    { "id": 4, "tasks": ["3.6", "3.7", "3.8"] },
    { "id": 5, "tasks": ["5.1", "5.2", "5.3", "5.5", "5.6", "5.7", "5.9", "5.10", "5.11", "5.13"] },
    { "id": 6, "tasks": ["5.4", "5.8", "5.12", "5.14", "5.15"] },
    { "id": 7, "tasks": ["7.1"] },
    { "id": 8, "tasks": ["7.2", "7.3"] },
    { "id": 9, "tasks": ["8.1", "8.2"] },
    { "id": 10, "tasks": ["8.3"] }
  ]
}
```
