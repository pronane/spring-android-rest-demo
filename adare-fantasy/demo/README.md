# Demo film

| File | Length | What it shows |
| --- | --- | --- |
| [`twenty-eight-start-to-finish.webm`](twenty-eight-start-to-finish.webm) | 2:48 | **The whole product, in one sitting, nothing faked.** A player buys a €10 entry, drafts a Captain's Dozen card from a €200m budget, calls all 28 matches, makes their Pinpoint guesses, reads their own points breakdown and the global table, creates a private league, watches Sunday singles finish the cup, and an operator settles that league's prize pot from the admin console. **Narrated**, with burned-in captions |

1440×900, VP9 video with burned-in captions and an **Opus mono narration track** (7.1 MB, 2:47.8).
It plays in every current browser — drag the file into a tab, or
`open twenty-eight-start-to-finish.webm`. To convert for WhatsApp or social (the audio has to be
re-encoded, so the MP4 is larger):

```bash
ffmpeg -i twenty-eight-start-to-finish.webm -c:v libx264 -crf 22 -pix_fmt yuv420p \
  -c:a aac -b:a 128k -movflags +faststart twenty-eight-start-to-finish.mp4
```

![The opening frame](poster.jpg)

## What happens, minute by minute

| Time | Step |
| --- | --- |
| 0:00 | Landing page: the Adare 2027 hero, the countdown, the live demo ticker |
| 0:11 | Entry: the three paid plans (€10 / €60 / €24) and the details the receipt carries |
| 0:23 | Checkout opens a **pending order** — no entry exists yet, the app hands back a payment URL |
| 0:29 | Payment settles the order; the entry reference appears and the header flips to **My card** |
| 0:36 | Draft: Captain's Dozen, auto-pick fills a legal card, saved to the server |
| 0:53 | Match predictor: 28 matches plus three awards, saved and locked at the first tee |
| 1:08 | Pinpoint: nearest-the-pin and longest-drive guesses for each day |
| 1:20 | Account: receipt, then card points + prediction points, player by player |
| 1:27 | The table: server-scored global standings with card and predictor points split out |
| 1:34 | Leagues: create a private league, get a join code, see its own table |
| 1:47 | Live: Sunday singles at 4×, the cup decided, the fantasy points following it |
| 2:11 | Operator console: orders, the ledger (5% fees, 95% pool, payouts), prize settlement per pot, result corrections |
| 2:42 | Close: one brand, a new edition every two years |

## How it was made

```
demo/record-tour.mjs
  Puppeteer drives the real app (a clean database, demo payment provider)
        │  CDP Page.startScreencast → one JPEG per painted frame
        │  every step's caption written to run/cues.json with its timestamp
        │  a gold ring is drawn around the control about to be used
        ▼
demo/render-tour.mjs  (ffmpeg)
        │  frames → concat list with real gaps → 30 fps CFR
        │  captions → an ASS track burned in over a lower-third bar
        │  libvpx-vp9, CRF 35, yuv420p
        ▼
twenty-eight-start-to-finish.webm
```

Nothing is staged: it is the same build the tests run against, and the stills in [`stills/`](stills)
are frames from this run, one per step (`01-home` … `15-admin-results`).

## Re-recording it

```bash
cd adare-fantasy
npm install && npm run build
rm -rf .data
SESSION_SECRET="$(openssl rand -hex 24)" \
ADMIN_TOKEN="tour-admin-token-7d2e41" \
PAYMENTS_PROVIDER=demo npm start          # terminal 1

cd verification/harness && npm install     # Chromium lives here
cd ../..
ADMIN_TOKEN=tour-admin-token-7d2e41 node demo/record-tour.mjs   # ~3 minutes
FFMPEG=/path/to/ffmpeg node demo/render-tour.mjs                 # ~5 minutes
```

`record-tour.mjs` accepts `BASE` and `OUT`; `render-tour.mjs` accepts `FFMPEG`, `OUT`, `TARGET` and
`FONTS`. `run/` is gitignored — the frames are ~2 GB of JPEGs; only the film is committed.

### Narration

Ten clips in [`narration/`](narration), scheduled by [`narration.json`](narration.json), spoken from
[`narration-script.md`](narration-script.md) — 356 words, about 2:20 of speech across 2:47.8 of
picture. Each clip starts at its beat and finishes before the next caption:

| Clip | Starts | Beat | Length |
|---|---|---|---|
| 01 | 0:02.6 | what it is, the editions | 17.6 s |
| 02 | 0:22.6 | entry plans, the pending order | 13.3 s |
| 03 | 0:36.2 | paid, then the draft | 17.1 s |
| 04 | 0:53.6 | the 28-match predictor | 13.7 s |
| 05 | 1:08.0 | Pinpoint | 10.0 s |
| 06 | 1:20.0 | the points breakdown | 13.5 s |
| 07 | 1:33.8 | the table and private leagues | 13.1 s |
| 08 | 1:47.2 | Sunday singles at 4× | 8.9 s |
| 09 | 2:07.6 | the operator console | 19.8 s |
| 10 | 2:34.5 | close | 11.2 s |

The mux is additive: **the picture is never re-encoded**. Every clip is delayed to its start and
mixed into one Opus stream, and the video is copied packet for packet (the rendered film's video
stream hashes identically before and after):

```bash
# in demo/, with narration.json and narration/*.mp3 present
ffmpeg -i twenty-eight-start-to-finish.webm \
  -i narration/01.mp3 -i narration/02.mp3 -i narration/03.mp3 -i narration/04.mp3 \
  -i narration/05.mp3 -i narration/06.mp3 -i narration/07.mp3 -i narration/08.mp3 \
  -i narration/09.mp3 -i narration/10.mp3 \
  -filter_complex "\
    [1:a]adelay=2600:all=1[a1];[2:a]adelay=22600:all=1[a2];[3:a]adelay=36200:all=1[a3];\
    [4:a]adelay=53600:all=1[a4];[5:a]adelay=68000:all=1[a5];[6:a]adelay=80000:all=1[a6];\
    [7:a]adelay=93800:all=1[a7];[8:a]adelay=107200:all=1[a8];[9:a]adelay=127600:all=1[a9];\
    [10:a]adelay=154500:all=1[a10];\
    [a1][a2][a3][a4][a5][a6][a7][a8][a9][a10]amix=inputs=10:normalize=0:dropout_transition=0,\
    alimiter=limit=0.95,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=mono[aout]" \
  -map 0:v -map "[aout]" -c:v copy -c:a libopus -b:a 96k -ac 1 -ar 48000 \
  twenty-eight-start-to-finish.narrated.webm
```

`render-tour.mjs` can also mux while it renders: point `NARRATION` at a `narration.json` and
`NARRATION_DIR` at the folder holding the clips. Editing the script and re-recording the clips does
not require re-recording the screen — only re-running the mux above.
