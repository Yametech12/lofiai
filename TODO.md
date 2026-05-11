# TODO

- [x] Implement real-time status streaming using SSE

  - [ ] Add new API route: `src/app/api/status/stream/[taskId]/route.ts`
  - [ ] Stream periodic status updates as SSE `message` events
  - [ ] Ensure completion payload matches existing UI expectations (`status`, `progress`, `audioUrl`, `tracks`, `title`, `music_style`)
- [x] Update UI to consume SSE instead of `setInterval` polling

  - [ ] In `src/app/page.tsx`, replace polling loop with `EventSource`
  - [ ] Close SSE connection on completion/error/cancel/reset/unmount
- [ ] Update cancellation behavior
  - [ ] Cancel button closes SSE and resets UI
- [ ] Smoke test
  - [ ] `npm run dev`
  - [ ] Trigger generation and confirm progress updates without polling
  - [ ] Confirm audio loads and download buttons work

