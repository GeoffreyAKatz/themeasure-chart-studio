# The Measure — Chart Studio (Netlify deploy)

Vite + React app. The "From image" feature calls a serverless proxy that
holds your Anthropic API key.

## Setup
1. In Netlify, add an environment variable `ANTHROPIC_API_KEY` (scope: Functions).
2. In `src/App.jsx`, set the `model:` string (flagged `// DEPLOY:`) to a current
   vision-capable Claude model.
3. Confirm `publish` in `netlify.toml` is `dist` (Vite).
4. Deploy via your connected git repo or `netlify deploy --prod`.

## Local
- `npm install`
- `npm run dev` (front-end only) or `netlify dev` (front-end + function together)

## Notes
- Saved charts are in-memory and reset on refresh (no DB wired yet).
- The extraction proxy lives at `netlify/functions/extract.mjs`, served at `/api/extract`.
