# Verification harness

Reproduces the run in [`../REPORT.md`](../REPORT.md): contract checks, the recorded end-to-end
journey, the live simulation, the blocked-takeover capture, and the frames-to-video encode.

```bash
cd adare-fantasy
npm install && rm -rf .data
npm run build
SESSION_SECRET="$(openssl rand -hex 24)" npm start      # http://localhost:3000

cd verification/harness
npm install
node api.mjs                 # 93 contract checks   -> run/api-results.json
node checks.mjs              # 32 browser checks    -> run/browser-results.json
node audit.mjs               # 34 axe sweeps        -> run/axe-results.json
node clock.mjs               # 9 card-clock checks  -> run/clock-results.json  (needs SCORING_CLOCK=at:600)
node record.mjs              # desktop + mobile     -> run/frames, run/shots
node record-live.mjs         # live simulation      -> run/frames/03-live
node takeover.mjs            # blocked takeover     -> run/shots/23-takeover-blocked.png
BASE=http://127.0.0.1:3100 OUT=../screenshots node social-shots.mjs   # 37–40, needs provider credentials
FFMPEG=/path/to/ffmpeg node encode.mjs   # -> run/videos/*.mp4
```

Environment:

| Variable | Default | Purpose |
|---|---|---|
| `BASE` | `http://127.0.0.1:3000` | server under test |
| `OUT` | `./run` | where frames, shots and videos go |
| `CHROME_PATH` | bundled `@sparticuz/chromium` | browser binary |
| `CHROME_LIBS` | — | extra shared libraries (the bundled build needs its own) |
| `FFMPEG` | `ffmpeg` | encoder |

`npm install` creates a real `node_modules` inside this folder, which is fine — but do **not** replace it
with a symlink to another folder's `node_modules`: webpack follows the link while building the app and
`next build` crashes in `WasmHash` (`Cannot read properties of undefined (reading 'length')`).

`social-shots.mjs` needs a second server started **with** provider credentials — the sign-in buttons
are drawn from `/api/auth/providers`, so a server without them renders nothing. Dummy values work;
nothing in that script talks to Google, Apple or Facebook:

```bash
GOOGLE_CLIENT_ID=demo GOOGLE_CLIENT_SECRET=demo \
APPLE_CLIENT_ID=demo APPLE_TEAM_ID=demo APPLE_KEY_ID=demo APPLE_PRIVATE_KEY="$(cat key.p8)" \
FACEBOOK_APP_ID=demo FACEBOOK_APP_SECRET=demo \
npx next start -H 0.0.0.0 -p 3100
```

`npm run oauth:check` in the app directory covers the token rules with generated keys; it needs no
server and no provider.

The scripts are stateful by design: `record.mjs` creates an account and pays for an entry, so run it
against a clean `.data` directory. `takeover.mjs` reads `run/email.txt`, so run it after `record.mjs`.
