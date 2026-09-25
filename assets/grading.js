// Grading for BIOL 45.01W. Total-points, with per-category drop-lowest.
//
// Written fresh rather than adapted from the Bio 40C Companion, which hardcodes
// exactly six categories in two validators, requires weights to total 100 even in
// points mode, and has no drop-lowest, no letter scale and no late model.
//
// Kept from that engine, because they are right: only rows with both `earned` and
// `possible` count toward a grade, and missing work stays UNGRADED until someone
// explicitly enters a zero. Silence is not a zero.
//
// DOM-free on purpose. Everything here is unit-tested in tests/grading.test.mjs.

/** Rows that count: graded, not excused, worth something. */
export const isGradeable = a =>
  a.graded !== false && a.status !== 'excused' && (a.possible ?? 0) > 0;

/** A gradeable row that actually has a score yet. */
export const isScored = a =>
  isGradeable(a) && a.earned !== null && a.earned !== undefined;

export function letterFor(pct, scale) {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return null;
  for (const band of scale) if (pct >= band.min) return band.letter;
  return scale[scale.length - 1].letter;
}

/**
 * Drop the n lowest-scoring rows. Removes each dropped row's `possible` as well as
 * its `earned` — her published subtotals prove the denominator shrinks (110 -> 100,
 * 250 -> 225, 320 -> 300).
 *
 * Only scored rows are eligible: you cannot drop work that has no score yet.
 * Ties break on lowest `earned`, then lowest `id`, so the result is deterministic.
 */
export function applyDrops(rows, n) {
  const scored = rows.filter(isScored);
  if (!n || scored.length === 0) return { kept: scored, dropped: [] };
  const order = [...scored].sort((a, b) =>
    (a.earned / a.possible) - (b.earned / b.possible) ||
    a.earned - b.earned ||
    String(a.id).localeCompare(String(b.id)));
  const dropped = order.slice(0, Math.min(n, scored.length));
  const out = new Set(dropped.map(r => r.id));
  return { kept: scored.filter(r => !out.has(r.id)), dropped };
}

export function categorySummary(assignments, category) {
  const mine = assignments.filter(a => a.category === category.id);
  const gradeable = mine.filter(isGradeable);
  const scored = gradeable.filter(isScored);
  const dropN = category.drop?.lowest ?? 0;

  // A drop before the category is fully graded is a guess about which score will
  // end up lowest. Compute it, but say so.
  const complete = category.count !== null && scored.length >= category.count;
  const provisional = dropN > 0 && !complete && scored.length > 0;

  // Banked: what is actually in hand right now. NO drop applied — dropping a score
  // mid-quarter understates points already earned, and the drop only ever applies
  // to the final category total.
  const earned = scored.reduce((s, r) => s + r.earned, 0);
  const possible = scored.reduce((s, r) => s + r.possible, 0);

  // Projected: the same work with the drop applied. While the category is
  // incomplete this is a guess about which score ends up lowest, so it is reported
  // separately and flagged, never folded silently into the banked figure.
  const { kept, dropped } = applyDrops(gradeable, dropN);
  const pEarned = kept.reduce((s, r) => s + r.earned, 0);
  const pPossible = kept.reduce((s, r) => s + r.possible, 0);

  return {
    id: category.id, name: category.name, budget: category.budget,
    rawBudget: category.rawBudget, count: category.count,
    scoredCount: scored.length, gradeableCount: gradeable.length,
    earned, possible,
    percent: possible > 0 ? (earned / possible) * 100 : null,
    projected: {
      earned: pEarned, possible: pPossible,
      percent: pPossible > 0 ? (pEarned / pPossible) * 100 : null,
      dropped: dropped.map(r => ({ id: r.id, title: r.title, earned: r.earned, possible: r.possible })),
    },
    dropAllowance: dropN, dropProvisional: provisional,
    remaining: Math.max(0, category.budget - earned),
  };
}

/** Points still available: the course budget minus what has already been scored. */
export function courseGrade(course, assignments) {
  const g = course.grading;
  const categories = g.categories.map(c => categorySummary(assignments, c));
  const earned = categories.reduce((s, c) => s + c.earned, 0);
  const possible = categories.reduce((s, c) => s + c.possible, 0);
  const percent = possible > 0 ? (earned / possible) * 100 : null;
  const pEarned = categories.reduce((s, c) => s + c.projected.earned, 0);
  const pPossible = categories.reduce((s, c) => s + c.projected.possible, 0);

  const denominators = { computed: g.computedTotal, declared: g.declaredTotal };
  const finalIf = total => total > 0 ? (earned / total) * 100 : null;

  return {
    categories, earned, possible, percent,
    letter: letterFor(percent, g.scale),
    projected: {
      earned: pEarned, possible: pPossible,
      percent: pPossible > 0 ? (pEarned / pPossible) * 100 : null,
      letter: letterFor(pPossible > 0 ? (pEarned / pPossible) * 100 : null, g.scale),
    },
    graded: possible > 0,
    denominators,
    // Two answers, because her syllabus contains two totals. Neither is hidden.
    floor: {
      computed: finalIf(denominators.computed),
      declared: finalIf(denominators.declared),
    },
    remaining: {
      computed: Math.max(0, denominators.computed - earned),
      declared: Math.max(0, denominators.declared - earned),
    },
    discrepancy: g.discrepancy,
    provisionalDrops: categories.filter(c => c.dropProvisional).map(c => c.id),
  };
}

/** Points still needed to land a given letter, against both denominators. */
export function neededFor(letter, earned, course) {
  const band = course.grading.scale.find(b => b.letter === letter);
  if (!band) return null;
  const answer = total => {
    const need = Math.ceil((band.min / 100) * total - earned - 1e-9);
    const left = total - earned;
    return {
      total, need: Math.max(0, need), remaining: left,
      reachable: need <= left,
      shareOfRemaining: left > 0 ? Math.min(1, Math.max(0, need / left)) : null,
    };
  };
  return {
    letter, min: band.min,
    computed: answer(course.grading.computedTotal),
    declared: answer(course.grading.declaredTotal),
  };
}
