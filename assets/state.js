// The student's own state. Everything here is theirs: scores they typed, work they
// ticked off, coupons they spent, diary entries, appearance. None of it is course
// content, and none of it leaves the browser.
//
// Shape is constrained by the merge layer in state-merge.js, which treats exactly
// `assignments` and `attempts` as id-keyed arrays and everything else as nested
// objects. So per-item collections that need to merge cleanly across tabs are keyed
// objects, not arrays — an array merges as one opaque leaf, which would make two
// tabs spending two different coupons look like a conflict.

export const NS = 'bio45-nutrition-';
export const STATE_KEY = NS + 'state-v1';
export const STATE_VERSION = 1;

export const STATUSES = ['todo', 'done', 'missing', 'excused'];
export const THEMES = ['system', 'light', 'dim', 'dark'];

export const blankState = () => ({
  version: STATE_VERSION,
  assignments: [],      // [{id, status, earned, extendedTo, note}]
  attempts: [],         // [{id, week, questionId, choice, correct, at}]
  coupons: {},          // {assignmentId: {spentOn}}
  diary: {},            // {'YYYY-MM-DD': {routine, entries:{entryId:{...}}}}
  theme: 'system',
  learningTheme: false,
  privacyAck: false,
  lastBackup: null,
});

const isPlain = v => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Reject anything malformed rather than letting it reach the store, and say what was
 * wrong. A restore from a corrupt or foreign backup must fail loudly: the shared
 * producer456.github.io origin means a neighbouring app's state could physically be
 * handed to us.
 */
export function validateState(raw) {
  if (!isPlain(raw)) throw new Error('That file does not contain saved work.');
  if (raw.version !== STATE_VERSION)
    throw new Error(`This backup is version ${raw.version ?? 'unknown'}; this app reads version ${STATE_VERSION}.`);

  // Reject unknown keys outright. A neighbouring app's backup can carry version 1
  // too — producer456.github.io is a shared origin — and absorbing its fields would
  // quietly import another course's state into this one. Adding a field here is a
  // deliberate act that bumps STATE_VERSION.
  const known = new Set(Object.keys(blankState()));
  const strangers = Object.keys(raw).filter(k => !known.has(k));
  if (strangers.length)
    throw new Error(`This file holds fields this app does not use (${strangers.slice(0,3).join(', ')}` +
                    `${strangers.length > 3 ? ', …' : ''}). It looks like it belongs to a different app.`);

  for (const key of ['assignments', 'attempts'])
    if (!Array.isArray(raw[key] ?? [])) throw new Error(`"${key}" should be a list.`);
  for (const key of ['coupons', 'diary'])
    if (!isPlain(raw[key] ?? {})) throw new Error(`"${key}" should be an object.`);

  const seen = new Set();
  for (const a of raw.assignments ?? []) {
    if (!a?.id) throw new Error('An assignment row has no id.');
    if (seen.has(a.id)) throw new Error(`Two rows claim the id "${a.id}".`);
    seen.add(a.id);
    if (a.status != null && !STATUSES.includes(a.status))
      throw new Error(`"${a.status}" is not a status I recognise.`);
    if (a.earned != null && (typeof a.earned !== 'number' || Number.isNaN(a.earned) || a.earned < 0))
      throw new Error(`The score on "${a.id}" is not a number I can use.`);
  }

  if (!THEMES.includes(raw.theme ?? 'system')) throw new Error('Unknown appearance setting.');
  if (typeof (raw.learningTheme ?? false) !== 'boolean') throw new Error('Reading-mode setting is not a yes/no.');

  return { ...blankState(), ...raw };
}

/** Fold the student's overlay onto the course's assignment records. */
export function mergeAssignments(courseAssignments, state) {
  const mine = new Map((state.assignments ?? []).map(a => [a.id, a]));
  return courseAssignments.map(a => {
    const over = mine.get(a.id) ?? {};
    return {
      ...a,
      status: over.status ?? 'todo',
      earned: over.earned ?? null,
      extendedTo: over.extendedTo ?? state.coupons?.[a.id]?.extendedTo ?? null,
      note: over.note ?? '',
    };
  });
}

/** Replace one assignment's overlay, dropping rows that carry nothing. */
export function setOverlay(state, id, patch) {
  const rows = (state.assignments ?? []).filter(a => a.id !== id);
  const prev = (state.assignments ?? []).find(a => a.id === id) ?? { id };
  const next = { ...prev, ...patch };
  const empty = (next.status ?? 'todo') === 'todo' && next.earned == null &&
                !next.extendedTo && !next.note;
  return { ...state, assignments: empty ? rows : [...rows, next] };
}

export const spentCoupons = state =>
  Object.entries(state.coupons ?? {}).map(([assignment, v]) => ({ assignment, ...v }));

export const backupName = (today) => `${NS}backup-${today}.json`;
