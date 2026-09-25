# Handoff

**Parked 2026-09-25.** Working tree clean, 84 tests green, nothing published yet.

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
- **Weeks 1–3 are written out** — 30 quiz questions with per-distractor rationale
  and citations. Weeks 4–11 carry their reading map and are labelled
  *reading map only*.
- **The diary** encodes her rubric; vague portions are rejected by name, quoting her.

## The immediate next step

**Nothing has been pushed.** The plan calls for a new *public* repo
`producer456/bio45-nutrition` on GitHub Pages, but publishing is outward-facing and
was left for you to confirm. When you want it:

```sh
gh repo create producer456/bio45-nutrition --public --source=. --remote=origin --push
# then: Settings → Pages → Deploy from a branch → main / (root)
```

Two things to check before you do:
1. Re-read `SHARING.md` and confirm it states the permission accurately.
2. Once Pages is live, browse it **read-only**. Never write-test against
   `producer456.github.io` — several study sites share that origin and one
   localStorage, and a fuzz run there has destroyed real saved work before.

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
3. **Author weeks 4–11.** `node tools/extract-aitn.mjs` rebuilds the scaffold into
   `content/_seed/` (gitignored). Copy a `content/week-0N.json` and follow its shape,
   then flip that week to `depth: "authored"` in `course.json` — a test refuses to let
   a scaffold week ship questions.
   ⚠ Week 4's microbiome has no home in the primary textbook (it predates the
   literature). Callahan is the only supplied source that covers it.
4. **Optional:** a Playwright browser suite, adapting the pattern from the project
   this forked from.

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
