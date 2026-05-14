# Requirements Document

## Introduction

This document defines the requirements for restructuring the generatelofi application from a monolithic single-file architecture into a well-organized, modular codebase following modern Next.js 16, React 19, and TypeScript best practices. The restructuring preserves all existing functionality while improving maintainability, testability, and developer experience through proper separation of concerns.

## Glossary

- **App_Shell**: The top-level page component that composes feature modules together
- **Generation_Form**: The component responsible for collecting user input (prompt, style, settings) and initiating music generation
- **Audio_Player**: The component responsible for audio playback, visualization, track switching, and download controls
- **History_Panel**: The component responsible for displaying and managing previously generated tracks from localStorage
- **Generation_Hook**: A custom React hook encapsulating all music generation state and logic (API calls, SSE streaming, polling, progress tracking)
- **Audio_Hook**: A custom React hook encapsulating audio playback state and Web Audio API integration (play/pause, volume, visualization, looping)
- **Storage_Hook**: A custom React hook encapsulating localStorage persistence for history entries and API key
- **Credits_Hook**: A custom React hook encapsulating credit balance fetching and display logic
- **Type_Module**: A centralized TypeScript module defining all shared interfaces and type aliases
- **API_Client**: A utility module providing typed functions for calling the application's API routes

## Requirements

### Requirement 1: Component Decomposition

**User Story:** As a developer, I want the monolithic page.tsx broken into focused, single-responsibility components, so that each UI concern is isolated and independently maintainable.

#### Acceptance Criteria

1. THE App_Shell SHALL compose the Generation_Form, Audio_Player, and History_Panel as distinct child components
2. WHEN the App_Shell renders, THE App_Shell SHALL pass only the necessary props or context to each child component
3. THE Generation_Form SHALL encapsulate all prompt input, style selection, instrumental toggle, output count, and output length controls
4. THE Audio_Player SHALL encapsulate the audio element, playback controls, progress bar, volume slider, visualization canvas, track tabs, and download buttons
5. THE History_Panel SHALL encapsulate the history list display, history entry selection, and history clear functionality
6. WHEN a component file exceeds 200 lines of JSX, THE developer SHALL extract sub-components into separate files within the same feature folder

### Requirement 2: Custom Hook Extraction

**User Story:** As a developer, I want all stateful logic extracted into custom hooks, so that business logic is decoupled from presentation and independently testable.

#### Acceptance Criteria

1. THE Generation_Hook SHALL manage generation status, task ID, progress, error state, SSE streaming, polling timeout, and cancellation logic
2. THE Generation_Hook SHALL expose a stable API of functions (generate, cancel, reset) and state values (status, progress, error, tracks, taskId)
3. THE Audio_Hook SHALL manage audio element refs, Web Audio API context, analyser node, gain node, play/pause state, current time, duration, volume, and loop state
4. THE Audio_Hook SHALL expose a stable API of functions (play, pause, seek, setVolume, toggleLoop) and state values (isPlaying, currentTime, duration, volume, isLooping)
5. THE Storage_Hook SHALL manage reading and writing generation history to localStorage with a configurable maximum entry count
6. THE Credits_Hook SHALL manage fetching credit balance from the API, tracking load failures, and exposing credit amount and low-credit warnings
7. WHEN any hook is invoked, THE hook SHALL perform cleanup of intervals, timeouts, EventSource connections, and AudioContext on unmount

### Requirement 3: Centralized Type Definitions

**User Story:** As a developer, I want all shared TypeScript interfaces and types defined in a single module, so that type consistency is enforced across the codebase.

#### Acceptance Criteria

1. THE Type_Module SHALL define the Track interface with fields: url, wavUrl, title, duration, and version
2. THE Type_Module SHALL define the HistoryEntry interface with fields: id, taskId, prompt, musicStyle, makeInstrumental, title, tracks, and createdAt
3. THE Type_Module SHALL define the GenerationStatus union type as 'idle' | 'generating' | 'polling' | 'completed' | 'error'
4. THE Type_Module SHALL define the GenerationOptions interface with fields: prompt, musicStyle, makeInstrumental, numOutputs, and outputLength
5. THE Type_Module SHALL define the GenerationResult interface representing the API response with fields: taskId, conversionId1, conversionId2, eta, and creditEstimate
6. THE Type_Module SHALL be the single source of truth for all types shared between components, hooks, and utilities

### Requirement 4: API Client Module

**User Story:** As a developer, I want a typed API client module that encapsulates all fetch calls to internal API routes, so that API interaction logic is centralized and type-safe.

#### Acceptance Criteria

1. THE API_Client SHALL provide a generateMusic function that accepts GenerationOptions and an optional API key, and returns a typed GenerationResult
2. THE API_Client SHALL provide a fetchCredits function that accepts an optional API key and returns a typed credits response
3. THE API_Client SHALL provide a createStatusStream function that accepts a task ID and optional API key, and returns an EventSource instance
4. IF a network error occurs during an API call, THEN THE API_Client SHALL throw a typed error with a descriptive message and the HTTP status code
5. THE API_Client SHALL handle request serialization and response deserialization internally without leaking fetch implementation details

### Requirement 5: File Organization Structure

**User Story:** As a developer, I want a clear, predictable folder structure, so that I can locate any piece of code by its responsibility.

#### Acceptance Criteria

1. THE project SHALL organize components under src/components/ grouped by feature (e.g., generation/, player/, history/, common/)
2. THE project SHALL organize custom hooks under src/hooks/ with one hook per file
3. THE project SHALL organize shared types under src/types/ with one file per domain concept
4. THE project SHALL organize utility functions under src/lib/ grouped by concern (e.g., api-client.ts, format.ts, audio.ts)
5. THE project SHALL keep the src/app/page.tsx file under 100 lines by delegating to composed components
6. THE project SHALL maintain the existing src/app/api/ route structure without modification to API route logic

### Requirement 6: Functional Preservation

**User Story:** As a user, I want the restructured application to behave identically to the current version, so that no features are lost or broken during the refactor.

#### Acceptance Criteria

1. WHEN a user submits a generation prompt, THE Generation_Form SHALL call the same /api/generate endpoint with identical request parameters as the current implementation
2. WHEN generation completes, THE Audio_Player SHALL display track tabs, audio controls, visualization, and download buttons with the same behavior as the current implementation
3. WHEN a user selects a history entry, THE History_Panel SHALL restore the prompt, style, tracks, and audio player state identically to the current implementation
4. THE Audio_Player SHALL maintain Web Audio API visualization with the same frequency analysis and canvas rendering as the current implementation
5. WHEN the application loads, THE App_Shell SHALL restore the API key and history from localStorage identically to the current implementation
6. THE application SHALL preserve the existing beforeunload warning when generation is in progress

### Requirement 7: State Management Architecture

**User Story:** As a developer, I want a clear state management pattern, so that data flows predictably between components without prop drilling.

#### Acceptance Criteria

1. THE App_Shell SHALL lift shared state (generation result, active tracks, API key) to the top level and pass it to child components via props
2. WHEN the Generation_Hook produces a completed result, THE App_Shell SHALL propagate the tracks and audio URL to the Audio_Player
3. WHEN the History_Panel selects an entry, THE App_Shell SHALL update the Generation_Form prompt and the Audio_Player tracks accordingly
4. THE Audio_Hook SHALL be self-contained within the Audio_Player component and not expose internal audio state to sibling components
5. IF a future requirement demands cross-cutting state, THEN THE developer SHALL introduce React Context at the App_Shell level rather than adding prop drilling

### Requirement 8: Error Boundary Integration

**User Story:** As a user, I want the application to gracefully handle component-level errors without crashing the entire page, so that I can continue using unaffected features.

#### Acceptance Criteria

1. THE App_Shell SHALL wrap the Audio_Player in an ErrorBoundary that displays a fallback UI and a retry button
2. THE App_Shell SHALL wrap the Generation_Form in an ErrorBoundary that displays a fallback UI and a retry button
3. WHEN an ErrorBoundary catches an error, THE ErrorBoundary SHALL log the error details to the console for debugging
4. WHEN a user clicks the retry button in a fallback UI, THE ErrorBoundary SHALL reset its state and re-render the wrapped component
