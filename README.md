# BIOL 45.01W — Nutrition

An unofficial study and coursework console for **Introduction to Human Nutrition**
at Foothill College, Fall 2026 (2026-09-21 → 2026-12-11).

Built by a student taking the course. Not affiliated with, endorsed by, or reviewed
by the college or the instructor. **Canvas is the source of record** — confirm every
date, point value and policy there. Where this app is guessing, it says so on screen.

## What it does

| Route | |
|---|---|
| **Today** | What is due, the current week, where the grade stands, coupons left |
| **Weeks** | All 11 topic weeks with their reading map |
| **Study** | Objectives, terms and a self-quiz for the weeks that are written out |
| **Coursework** | Every assignment: tick it off, type the score, spend a late coupon |
| **Grades** | Category breakdown, drop-lowest, and what each letter needs |
| **Food diary** | The ten-day diary, checked against her rubric |
| **Course** | Syllabus facts, policies, backup and restore |

Everything you type stays in your browser under `bio45-nutrition-state-v1`. No
account, no server, no analytics, and no third-party requests of any kind.

## Three things worth knowing

**Her syllabus contains two different totals.** The nine category subtotals add up to
**1360**; the total row reads **1355**. That is a real five-point discrepancy in the
document, and it moves the A cutoff by five points — 1279 against 1360, 1274 against
1355. The app computes against 1360 and shows both rather than quietly picking one.
Unresolved until she is asked.

**Most due dates after Week 1 are inferred.** Only Week 1 and the two dietary-analysis
deadlines are stated. Everything else is placed on the Sunday implied by *"modules will
be open weekly on Sundays"*, and is labelled **inferred** wherever it appears. Two
counts also do not resolve: she promises 10 check-ins across 11 weeks, and 6 learning
reflections where the even-week rule places only 5. Those sit under *points she
promised but has not dated* rather than being given invented dates. **Thanksgiving
falls inside Week 10** and she may shift that week; the app never auto-adjusts.

**Week 11 cannot use a late coupon.** The cutoff for late work is 2026-12-05, which is
the day *before* the inferred Week 11 deadline of 2026-12-06. Two Week 1 items are also
marked "NO LATE COUPONS" in Canvas. The app refuses a coupon in all three cases and
says why.

## Running it

```sh
python3 -m http.server 8146     # then open http://127.0.0.1:8146/
npm test                         # 81 tests, no dependencies
```

Node 22+. There is **no build step** — every file is served as written.

> ⚠ Never write-test against the live GitHub Pages origin. Several study sites share
> `producer456.github.io`, and therefore share one localStorage. A fuzz run against
> that origin has destroyed real saved work before.

## Editing content

| File | |
|---|---|
| `course.json` | Term, grading model, late policy, weeks, assignments |
| `content/week-NN.json` | Objectives, terms, quiz bank and application prompts |
| `assets/grading.js` | Points, drop-lowest, letter scale — DOM-free and unit-tested |
| `assets/deadlines.js` | Due dates, lateness, the coupon ledger |
| `assets/diary.js` | The ten-day diary and her specificity rubric |
| `tools/extract-aitn.mjs` | Rebuilds the authoring scaffold in `content/_seed/` (gitignored) |

As each week's module opens, replace that week's projected assignments with the real
ones and drop `projected: true`. Weeks 1–3 are `depth: "authored"`; the rest are
`"scaffold"` and say so on screen. A test refuses to let a scaffold week ship
questions — mark it authored so the quality rules apply.

**After editing a stylesheet or a script, bump its `?v=` in `index.html` *and* in
`sw.js`'s `SHELL`.** They must match.

## Things that will bite you

- **`assets/base.css` is a minified blob** inherited from the project this forked
  from. There is no unminified original anywhere. Treat it as fixed; the readable
  sheets layer on top. Its Google Fonts `@import` has been removed and those stacks
  repointed at system fonts, because this app makes no third-party requests.
- **The CSP is `style-src 'self'`, so inline `style=""` attributes are silently
  dropped** — the attribute lands in the DOM and is never applied. A 0-of-10 progress
  bar once rendered completely full this way. Set widths through `element.style`
  instead, which CSP does not cover. A test forbids inline style attributes.
- **`index.html` has no cache-buster of its own**, so bumping `?v=` inside it does
  nothing while a stale copy is cached. That is why `sw.js` serves navigations
  network-first.
- **`assets/state-merge.js` treats only `assignments` and `attempts` as id-keyed
  arrays.** Anything else that needs per-item merging across tabs must be a keyed
  object — that is why coupons and diary days are keyed, not listed.

## Licence and permission

CC BY-NC-SA 4.0 — see `LICENSE`. ShareAlike is inherited, not chosen: the study
content is adapted from CC BY-NC-SA textbooks. See `ATTRIBUTION.md`.

Course information appears under a permission recorded in `SHARING.md`. The
instructor's document files are not rehosted.

`AI-POLICY.md` records her policy and how this app stays inside it. Briefly: it
never drafts anything you would submit, and never analyses your writing.
