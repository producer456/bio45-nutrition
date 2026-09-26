// Overlay real Canvas dates onto the course data.
//
// calendar.json is published from the Mac every 30 minutes (see
// scripts/publish-canvas-calendar.py). It is a COPY of what Canvas says, not a
// replacement for it, and it only ever contains what the instructor has actually
// posted — at the time of writing, Week 1 and the two diary deadlines.
//
// Everything here degrades to nothing: if the file is missing, stale or malformed,
// the app runs on its own transcribed and projected dates exactly as before. A
// calendar that cannot be read must never blank out the schedule.

import { COURSE_TZ } from './deadlines.js';

/** An instant in UTC, expressed as the calendar date it falls on in the course TZ. */
export function instantToCourseDate(iso, tz = COURSE_TZ) {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(when);
}

/** Reduce a title to something two spellings of the same assignment share. */
export function normaliseTitle(title) {
  let text = String(title ?? '').toLowerCase().replace(/[–—]/g, '-');
  // Strip trailing decorations repeatedly rather than once each in a fixed order.
  // Canvas writes "... - No Late Coupons: Milestone 1", so the coupon note is not
  // at the end until the milestone suffix has gone. A single ordered pass missed
  // it, and the milestone lost its parent assignment.
  const trailing = [/[-–—:]?\s*no\s+late\s+coupons?\s*$/i, /:?\s*milestone\s*\d*\s*$/i];
  for (let pass = 0; pass < 4; pass++) {
    const before = text;
    for (const pattern of trailing) text = text.replace(pattern, '').trim();
    if (text === before) break;
  }
  return text.replace(/[^a-z0-9]+/g, ' ').trim();
}

export function dueDateOf(item) {
  if (!item?.due) return null;
  if (item.dueKind === 'date') return item.due.slice(0, 10);
  if (item.dueKind === 'instant') return instantToCourseDate(item.due);
  return null;   // 'floating' or 'unknown': the feed never said which zone. Do not guess.
}

export function validateCalendar(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.version !== 1 || !Array.isArray(raw.items)) return null;
  if (raw.course !== '40466') return null;         // not this course; refuse it
  return raw;
}

/**
 * Fold the feed into the assignment list.
 *
 * Matched assignments take the Canvas date and are marked `canvas`, which clears
 * their `projected` flag. Milestones attach to their parent. Anything Canvas knows
 * about that the course data does not is surfaced rather than dropped — that is how
 * a renamed or newly added assignment becomes visible instead of silently missing.
 */
export function applyCalendar(assignments, calendar) {
  const cal = validateCalendar(calendar);
  if (!cal) return { assignments, applied: 0, extras: [], error: null };

  const byTitle = new Map();
  for (const a of assignments) {
    const key = normaliseTitle(a.title);
    if (!byTitle.has(key)) byTitle.set(key, a.id);
  }

  const dates = new Map(), milestones = new Map(), matched = new Set();
  const extras = [];

  for (const item of cal.items) {
    const due = dueDateOf(item);
    if (!due) continue;
    const key = normaliseTitle(item.title);
    const id = byTitle.get(key);
    if (!id) { extras.push({ ...item, due, key }); continue; }
    matched.add(item.id);
    if (item.milestone) milestones.set(id, { date: due, title: item.title, source: 'canvas' });
    else dates.set(id, due);
  }

  const next = assignments.map(a => {
    const due = dates.get(a.id);
    const milestone = milestones.get(a.id);
    if (!due && !milestone) return a;
    return {
      ...a,
      ...(due ? { due, dueConfidence: 'canvas', projected: false,
                  dueSource: 'Canvas calendar feed, refreshed automatically' } : {}),
      ...(milestone ? { milestone: { ...(a.milestone ?? {}), date: milestone.date,
                                     what: a.milestone?.what ?? 'initial post',
                                     source: 'canvas' } } : {}),
    };
  });

  return { assignments: next, applied: dates.size + milestones.size, extras, error: cal.error || null };
}

/**
 * Is the feed still being refreshed?
 *
 * A publisher that has quietly stopped is worse than no publisher: the dates still
 * look authoritative. Kept here, out of the DOM, so it can be tested.
 */
export const STALE_HOURS = 6;

export function calendarHealth(calendar, nowSeconds = Date.now() / 1000) {
  if (!calendar) return { present: false, stale: false, ageHours: null, error: null };
  const attempted = calendar.lastAttempt ?? 0;
  const ageHours = attempted ? (nowSeconds - attempted) / 3600 : null;
  return {
    present: true,
    ageHours,
    stale: ageHours === null || ageHours > STALE_HOURS,
    error: calendar.error || null,
    checkedAt: attempted ? instantToCourseDate(new Date(attempted * 1000).toISOString()) : null,
  };
}

/** Never let a bad fetch take the schedule down with it. */
export async function loadCalendar(url = './calendar.json') {
  try {
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) return null;
    return validateCalendar(await response.json());
  } catch {
    return null;
  }
}
