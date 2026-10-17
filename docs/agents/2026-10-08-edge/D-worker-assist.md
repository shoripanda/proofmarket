# Owner D: in-browser help for workers (design §6)

Branch: `feat/worker-assist`. Worktree: `~/proofmarket-d`. Touch neither the server, the DB nor the API contract. Everything happens in the browser.

## What to build

1. `apps/web/lib/client/speech.ts`
   - `speak(text, lang)`: read aloud with `speechSynthesis`, stopping anything in progress first. Pick a `ja-JP` voice for `ja` and `en-US` for `en` from `getVoices()` (default if none). In browsers without support, return `supported` and do nothing
   - `useSpeechInput(lang)`: a hook returning one transcription from `SpeechRecognition` (also `webkitSpeechRecognition`). When `supported: false`, the caller shows no button
2. `apps/web/lib/client/sound.ts`: `cue("ok" | "back" | "result")`, synthesising a short two-note cue with Web Audio (`OscillatorNode`); no files. Also `navigator.vibrate`. If the setting `pm.sound` (localStorage) is `"off"`, stay silent
3. In `apps/web/components/ui.tsx`: `ListenButton({ text })` (a line-art speaker icon, showing stop while reading) and `SoundToggle()` (sound on/off, below `/payouts` or next to the `Shell` heading)
4. Screens
   - Request detail `tasks/[id]`: a `ListenButton` right of the question (reads the question + acceptance criteria)
   - Capture screen `claims/[id]/capture`: a `ListenButton` right of the question. A "speak" button for the text answer field and form text fields (`useSpeechInput`; the transcription is appended to the field and can be seen before sending). Over the camera feed, a translucent band with **capture guidance**: the first 4 lines of `acceptance_criteria` split at "。" (or the type's `howTo` if absent). It does not drop the first line on each shot (always shown)
   - `cue("ok")` when a submission is sent. On the claim detail `claims/[id]`, `cue("back")` when sent back (INVALID) and `cue("result")` when a result (task_result) appears (first display only, once via `useRef`)
5. Japanese and English copy via `pick(lang, …)`. Icons are SVG line art (24×24, stroke only)

## How to check
Open http://localhost:3917 with `pnpm dev:local` and go `/login` → request → capture screen. On iPhone Safari and Android Chrome, check whether `speechSynthesis` speaks and whether the button is hidden without `SpeechRecognition`, on a device at hand or in the browser dev tools' device mode. Write the environments checked in the PR description.

## Done when
Read-aloud, voice answers, capture guidance and sounds work in supporting browsers and do not appear in others.
