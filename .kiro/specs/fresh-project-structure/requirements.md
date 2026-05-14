# Requirements Document

## Introduction

This document defines the requirements for restructuring the generatelofi application from a monolithic single-file architecture into a clean, well-organized project structure with proper separation of concerns. The application is a Next.js 16 app (React 19, Tailwind CSS 4, TypeScript 5) that generates lofi music using the MusicGPT API. The restructuring preserves all existing functionality while improving maintainability, testability, and developer experience.

## Glossary

- **Application**: The generatelofi Next.js web application
- **Component**: A React component responsible for rendering a specific piece of UI
- **Custom_Hook**: A reusable React hook that encapsulates stateful logic or side effects
- **Type_Module**: A TypeScript file dedicated to type definitions and interfaces
- **Feature_Module**: A self-contained directory grouping related components, hooks, and types for a specific feature area
- **Page_Component**: The top-level Next.js page component that composes feature modules
- **API_Route**: A Next.js App Router API route handler
- **Service_Layer**: A module that encapsulates external API communication logic
- **State_Manager**: A custom hook or context that manages a specific domain of application state

## Requirements

### Requirement 1: Component Decomposition

**User Story:** As a developer, I want the monolithic page.tsx broken into focused, single-responsibility components, so that each component is easier to understand, test, and modify independently.

#### Acceptance Criteria

1. THE Application SHALL organize UI components into a `src/components` directory with subdirectories named `generation`, `player`, `history`, and `common`
2. WHEN a component file exceeds 150 lines of code, THE Application SHALL split that component into sub-components where each sub-component contains no more than 150 lines of code
3. THE Application SHALL extract the prompt input form (textarea, style selector, duration picker, instrumental toggle, output count) into a dedicated `GenerationForm` component that accepts its configuration values and change handlers as props
4. THE Application SHALL extract the audio player (play/pause, progress bar, volume, loop toggle) into a dedicated `AudioPlayer` component that accepts an audio source URL, playback state, and control callbacks as props
5. THE Application SHALL extract the audio visualization canvas into a dedicated `AudioVisualizer` component that accepts an AnalyserNode reference and playing state as props
6. THE Application SHALL extract the track selection tabs into a dedicated `TrackSelector` component that accepts a tracks array, active track index, and a selection callback as props
7. THE Application SHALL extract the generation progress display (progress bar, status messages, cancel button) into a dedicated `GenerationProgress` component that accepts progress percentage, message text, and a cancel callback as props
8. THE Application SHALL extract the track history panel into a dedicated `TrackHistory` component that accepts a history entries array and a selection callback as props
9. THE Application SHALL extract the credits display into a dedicated `CreditsDisplay` component that accepts a credits count and loading state as props
10. THE Application SHALL extract the featured prompts grid into a dedicated `FeaturedPrompts` component that accepts a prompts array and a selection callback as props
11. WHEN all components have been extracted, THE Application SHALL render the page by composing the extracted components in `page.tsx` such that all existing user-facing functionality remains operational without regression
12. THE Application SHALL define each extracted component in its own file, export it as a named or default export, and ensure no circular import dependencies exist between component files

### Requirement 2: Custom Hook Extraction

**User Story:** As a developer, I want business logic and state management extracted into custom hooks, so that UI components remain focused on rendering and logic can be reused or tested in isolation.

#### Acceptance Criteria

1. THE Application SHALL organize custom hooks into a `src/hooks` directory
2. THE Application SHALL extract music generation orchestration (submit, SSE streaming, polling fallback, cancel, retry) into a `useGeneration` hook
3. THE Application SHALL extract audio playback control (play, pause, seek, volume, loop, Web Audio API setup) into a `useAudioPlayer` hook
4. THE Application SHALL extract audio visualization logic (AnalyserNode, canvas animation loop, frequency data) into a `useAudioVisualizer` hook
5. THE Application SHALL extract track history management (load from localStorage, save, select, limit to a maximum of 5 entries) into a `useTrackHistory` hook
6. THE Application SHALL extract credits fetching and monitoring (fetch, detection when credits fall below 1.0, refresh after generation) into a `useCredits` hook
7. THE Application SHALL extract prompt enhancement logic (smart expand, template matching) into a `usePromptExpand` hook
8. WHEN a custom hook is invoked, THE Custom_Hook SHALL return a typed TypeScript interface that separates read-only state values from callable action functions, with each property explicitly typed
9. THE Custom_Hook SHALL contain no JSX elements or direct DOM rendering logic, limiting its return value to state, computed values, and action functions
10. WHEN a custom hook acquires resources (intervals, event sources, audio contexts, animation frames), THE Custom_Hook SHALL release those resources via cleanup functions when the consuming component unmounts
11. IF an operation within a custom hook fails, THEN THE Custom_Hook SHALL expose the error state through a dedicated error property in its return interface rather than throwing an unhandled exception

### Requirement 3: Type Definitions Organization

**User Story:** As a developer, I want all shared TypeScript types and interfaces defined in dedicated type modules, so that type definitions are discoverable and reusable across the codebase.

#### Acceptance Criteria

1. THE Application SHALL organize shared type definitions into a `src/types` directory
2. THE Application SHALL define the `Track` interface in a single canonical location within the types directory, including at minimum the fields: `url`, `wavUrl`, `title`, `duration`, and `version`
3. THE Application SHALL define the `HistoryEntry` interface in the types directory, including at minimum the fields: `id`, `taskId`, `prompt`, `title`, `tracks`, and `createdAt`
4. THE Application SHALL define the `GenerationStatus` type in the types directory as a union of string literal states representing idle, in-progress, and terminal generation states
5. THE Application SHALL define API request and response types in the types directory covering at minimum: generation request parameters, credits response payload, and status response payload
6. WHEN a type is used in more than one file, THE Type_Module SHALL export that type from the shared types directory
7. THE Application SHALL re-export all public types from a `src/types/index.ts` barrel file
8. IF a type is defined in the `src/types` directory, THEN THE Application SHALL NOT define that same type locally in any consuming module
9. WHEN a module imports a shared type, THE Module SHALL import it from `src/types` or `src/types/index.ts` rather than from another consuming module

### Requirement 4: Service Layer Separation

**User Story:** As a developer, I want API communication logic encapsulated in a service layer, so that components and hooks interact with clean abstractions rather than raw fetch calls.

#### Acceptance Criteria

1. THE Application SHALL organize client-side API service functions into a `src/services` directory
2. THE Application SHALL provide a `generationService` module that exports a function accepting a prompt, optional style, optional lyrics, optional duration, optional number of outputs, and an API key, and returning a typed response object containing at minimum a task ID, conversion IDs, and an ETA
3. THE Application SHALL provide a `creditsService` module that exports a function accepting an API key and returning a typed response object containing at minimum the numeric credit balance
4. THE Application SHALL provide a `statusService` module that exports a function accepting a task ID and an API key, establishing an SSE connection, and invoking a caller-supplied callback for each parsed event containing a status field (processing, completed, or failed), a numeric progress value, and optional track data upon completion
5. IF a service call fails due to a network error (connection refused, DNS failure, or timeout), THEN THE Service_Layer SHALL throw a typed error object containing an error message indicating the nature of the failure and an HTTP status code of 503
6. IF a service call receives a non-success HTTP response from the upstream API, THEN THE Service_Layer SHALL throw a typed error object containing the upstream HTTP status code and an error message derived from the response body
7. THE Service_Layer SHALL accept an optional API key parameter on every exported service function, and when provided, include it as a Bearer token in the Authorization header of the outgoing request

### Requirement 5: Folder Structure Convention

**User Story:** As a developer, I want a consistent and predictable folder structure, so that I can locate any piece of code quickly without searching.

#### Acceptance Criteria

1. THE Application SHALL use the following top-level `src` directory structure, where each directory listed MUST exist: `app/`, `components/`, `hooks/`, `lib/`, `services/`, `types/`
2. THE Application SHALL keep the existing `src/app/api/` route structure unchanged
3. THE Application SHALL keep the existing `src/lib/config.ts` and `src/lib/constants.ts` files in place
4. THE Application SHALL use barrel files (`index.ts`) in `components/`, `hooks/`, `services/`, and `types/` directories that re-export all public modules from that directory, enabling single-line imports from the directory path
5. WHEN a component directory contains 2 or more files, THE Application SHALL include an `index.ts` barrel file in that directory that re-exports the component's public interface
6. THE Application SHALL use path aliases `@/app`, `@/components`, `@/hooks`, `@/lib`, `@/services`, and `@/types` for all cross-directory imports, and SHALL NOT use relative paths that traverse above the importing file's parent directory

### Requirement 6: Page Component Simplification

**User Story:** As a developer, I want the main page.tsx to be a thin composition layer, so that it is easy to understand the application's top-level structure at a glance.

#### Acceptance Criteria

1. THE Page_Component SHALL import and compose feature components without containing business logic, where business logic is defined as: API calls, data transformation functions, event handler implementations exceeding a single hook invocation, conditional branching based on application state, and direct DOM or Web API manipulation
2. THE Page_Component SHALL delegate all state management to custom hooks, where state management includes useState declarations, useEffect side effects, useCallback definitions, and useRef assignments, with the exception of at most 2 local UI-only state variables (such as a panel visibility toggle) that do not affect application data
3. THE Page_Component SHALL contain fewer than 100 lines of code measured from the function component declaration to its closing brace, excluding import statements, type/interface definitions, and any co-located sub-components that are extracted into separate files
4. THE Page_Component SHALL maintain the existing `'use client'` directive as the first line of the file
5. THE Page_Component SHALL produce identical rendered HTML structure and CSS class assignments as the current implementation, verified by visual regression comparison at 1280x720 and 375x667 viewport sizes
6. THE Page_Component SHALL not define helper functions (such as formatDuration, estimateCost, or shimmer/icon components) inline; these SHALL be imported from dedicated module files

### Requirement 7: Utility Function Organization

**User Story:** As a developer, I want utility functions organized by domain, so that helper logic is easy to find and does not accumulate in a single file.

#### Acceptance Criteria

1. THE Application SHALL keep the existing `src/lib/trackUtils.ts` for track-related utilities that operate on Track data structures or map API conversion responses
2. THE Application SHALL extract the `formatDuration` function into a `src/lib/formatters.ts` module
3. THE Application SHALL extract the `estimateCost` function into a `src/lib/formatters.ts` module
4. IF a utility function has no side effects and depends only on its arguments and on modules within `src/lib/`, THEN THE Application SHALL place it in the `src/lib/` directory
5. THE Application SHALL export utility functions using named exports where each function name contains a verb and a noun describing its action and target (e.g., `formatDuration`, `estimateCost`, `mapConversionToTracks`)
6. WHEN a utility function is extracted from an existing module into a new `src/lib/` file, THE Application SHALL update all import statements in consuming files to reference the new module path

### Requirement 8: Functional Equivalence

**User Story:** As a developer, I want the restructured application to behave identically to the current version, so that no user-facing functionality is lost or broken during the refactor.

#### Acceptance Criteria

1. THE Application SHALL preserve all existing features: prompt input with smart expand (keyword-based template matching and generic expansion for prompts under 6 words), music style selection from predefined suggestions, instrumental toggle, multiple outputs (1 to 4), duration selection (15s/30s/60s), real-time progress via SSE with progress percentage up to 85% during polling, audio playback with frequency visualization on canvas, track history (maximum 5 entries), and credits display with low-credits threshold of 1.0
2. THE Application SHALL preserve the existing API route behavior for /api/generate (POST), /api/credits (GET), /api/status/stream/[taskId] (GET, SSE), and /api/status/[taskId] (GET) without modification to request parameters, response JSON field names, or HTTP status codes
3. THE Application SHALL preserve the existing localStorage keys ("musicgpt_api_key" for user API key, "ghostname_history" for track history) and their JSON data formats so that user data saved before the restructure remains loadable after the restructure
4. THE Application SHALL preserve the existing error handling behavior including error banner display, auto-dismiss after 8000 milliseconds, error clear delay of 3000 milliseconds on cancel, and rate limit messages with retry timing
5. THE Application SHALL preserve the existing keyboard shortcuts and accessibility attributes including textarea focus management, beforeunload warning during generation, and all ARIA-related attributes on interactive elements
6. IF the application builds successfully after restructuring, THEN THE Application SHALL produce visually identical rendered output (same DOM structure, CSS classes, and layout) and identical interactive behavior (same state transitions, same event handling, same API call sequences) as the original for all user flows
