# SnapAlarm

Simple React alarm app with a camera verification step. When an alarm rings, the app opens the camera and asks you to take a photo of a mission item (for example: handuk, buku, sepatu olahraga).

## Setup

1. Install dependencies:

```bash
cd SnapAlarmNw
npm install
```

2. Copy environment example:

```bash
copy .env.example .env
```

3. If you have an Anthropic API key, set it in `.env`:

```text
VITE_ANTHROPIC_API_KEY=your_key_here
VITE_USE_MOCK=false
```

4. Run locally:

```bash
npm run dev
```

5. Run the dev server:

```bash
npm run dev
```

6. Open the local tunnel in another terminal:

```bash
npx localtunnel --port 5173
```

7. Copy the HTTPS URL shown by localtunnel, for example:

```text
https://xxxxxx.loca.lt
```

8. Open that URL on your phone.

If you use the localtunnel URL, you do not need HTTPS enabled in Vite itself. localtunnel provides HTTPS for your phone while forwarding requests to the local HTTP dev server.

## Notes

- Browser camera access works best on `localhost` or via HTTPS.
- If `VITE_USE_MOCK` is `true`, the photo verification uses a random mock result.
- If `VITE_ANTHROPIC_API_KEY` is missing, the app will automatically fall back to mock verification.
