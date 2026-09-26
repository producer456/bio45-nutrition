# Handoff

**Updated 2026-09-25.** Working tree clean, 85 tests green. **Published to both
targets.** All 11 weeks written out.

| | |
|---|---|
| Public website | <https://producer456.github.io/bio45-nutrition/> |
| Tailnet copy | <https://davids-macbook-pro.tailb97fc.ts.net/bio45-nutrition/> |
| Repo | `producer456/bio45-nutrition` (public) |

Redeploy: `git push` for the website, `scripts/deploy-ota.sh` for the tailnet copy.
Canvas dates publish themselves every 30 min from the Mac — see `README.md`.

```sh
cd ~/bio45-nutrition
npm test                      # 84 tests, no dependencies, node 22+
python3 -m http.server 8146   # http://127.0.0.1:8146/
```

## Where it stands

Built and verified in Chrome: **Today · Weeks · Study · Coursework · Grades ·
Food diary · Course**. Dark by default, no console errors, no CSP violations, no
third-party requests. State persists and survives reload under
`bio45-nutrition-state-v1`.

- **Week 1 is real** — all eight assignments with her stated dates and points.
  Entering scores gave 141/155 = 91.0% A-, checked by hand.
- **Weeks 2–11 are projected** onto the Sunday cadence and marked `inferred`
  on screen.
- **All 11 weeks are written out** — **110 questions**, 59 objectives and 66 terms,
  every question carrying a rationale for each wrong option and a citation. Zero of
  the 110 have the correct answer as the uniquely longest option.
- **The diary** encodes her rubric; vague portions are rejected by name, quoting her.

## The immediate next step

Nothing is blocked. Both copies are live and verified.

⚠ **Never write-test against `producer456.github.io`.** That origin already carries
**15 localStorage keys** belonging to four BIOL 40B sites, the 40C companion and
lecture-pocket. Ours is a sixteenth, isolated by its `bio45-nutrition-` prefix, and
the service worker is scoped to `/bio45-nutrition/` with a `b45-` cache prefix — all
verified live. Browse it read-only; do local work at `http://127.0.0.1:8146/`.

## Then, in order

1. **Replace each week's projection with the real assignments** as its module opens.
   Edit `course.json`, drop `projected: true` and set `dueConfidence: "stated"` with
   a `dueSource`. Tests enforce that those two fields agree.
2. **Ask her the four open questions** — they are modelled as unresolved, not guessed:
   - the 1355 vs 1360 total (`grading.discrepancy`, key `total`);
   - which weeks carry the second application activity — 4 are undated
     (`application-weeks`);
   - where the sixth learning reflection sits — the even-week rule places only 5
     (`reflection-count`);
   - what the embedded video quizzes actually are — 50 points, never enumerated
     (`videoquiz-items`).
3. **Optional:** a Playwright browser suite, adapting the pattern from the project
   this forked from.
4. **Optional:** deepen any week. `node tools/extract-aitn.mjs` rebuilds the
   authoring scaffold into `content/_seed/` (gitignored); copy a
   `content/week-NN.json` and follow its shape.

## Traps, the ones that actually cost time

- ☠☠ **`style-src 'self'` silently drops inline `style=""`.** The attribute lands in
  the DOM and is never applied — a 0-of-10 progress bar rendered completely full.
  Use `element.style.x`, which CSP does not cover. A test forbids inline styles.
- ☠ **`index.html` has no cache-buster**, so bumping `?v=` inside it does nothing
  while a stale copy is cached. Cost about twenty minutes of "my fix isn't working".
  `sw.js` now serves navigations network-first for this reason.
- ☠ **`assets/base.css` is a minified blob** with no unminified original anywhere.
  Do not try to edit it; layer on top. Its Google Fonts `@import` is removed.
- ☠ **`state-merge.js` only treats `assignments` and `attempts` as id-keyed arrays.**
  Anything else needing per-item cross-tab merge must be a keyed object — hence
  coupons and diary days are keyed, not listed.
- ☠ **Focusing `#main` on navigation scrolled the disclaimer off-screen.** It uses
  `focus({preventScroll:true})` now. Do not revert.
- ★ **The quiz-quality test is not decoration.** The first draft of week 1 had the
  correct answer as the uniquely-longest option in 70% of questions — passable by
  picking the longest. Balance distractors as you author; the test caps it at 30%.
- ★ **`tools/extract-aitn.mjs` was wrong twice** (depth counter off by one, and only
  the first block per section). It now reproduces 122/160/372/297 exactly. If you
  change it, check against those numbers.

## Deliberate non-goals

No native client, no OTA, no Tailscale site, no Canvas API. No nutrient computation —
NutriCalc is a separate paid purchase and its Food List Report is what she grades, so
a second set of numbers here could only disagree. Nothing that drafts submittable
work; see `AI-POLICY.md`.
