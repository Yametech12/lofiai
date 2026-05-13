# TODO

- [ ] Update `src/app/api/credits/route.ts`:
  - [ ] Robust credits parsing (multiple possible response fields)
  - [ ] Propagate MusicGPT error via non-200 HTTP status codes
- [ ] Update `src/components/ApiKeyInput.tsx`:
  - [ ] Validate API key using `response.ok` and numeric `credits`
  - [ ] Only mark valid if server returns credits (>=0) and no error payload
- [ ] Manual verification checklist after changes:
  - [ ] Enter a known-good key and click “Test” / “Save”
  - [ ] Enter a known-invalid key and verify UI shows invalid
