// Due dates, lateness and the three late coupons.
//
// Dates are plain YYYY-MM-DD and every comparison happens in the course timezone
// (America/Los_Angeles), never the viewer's. The Bio 40C Companion's habit of
// refusing to assert a time it was never given is kept: an inferred due date says
// so, and nothing here silently upgrades a guess into a fact.

export const COURSE_TZ = 'America/Los_Angeles';

/** Today in the course's timezone, as YYYY-MM-DD. */
export function courseToday(now = new Date(), tz = COURSE_TZ) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now);
}

const DAY = 86400000;
const parse = iso => { const [y,m,d] = iso.split('-').map(Number); return Date.UTC(y, m-1, d); };
export const addDays = (iso, n) => new Date(parse(iso) + n*DAY).toISOString().slice(0,10);
export const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / DAY);

/** Is this ISO date a real calendar date, not 2026-02-31? */
export const isRealDate = iso =>
  typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso) &&
  new Date(parse(iso)).toISOString().slice(0,10) === iso;

export function dueState(assignment, today = courseToday()) {
  if (!assignment.due) return { state: 'undated', overdue: false };
  if (assignment.status === 'done') return { state: 'done', overdue: false };
  const effective = assignment.extendedTo ?? assignment.due;
  const left = daysBetween(today, effective);
  return {
    state: left < 0 ? 'overdue' : left === 0 ? 'today' : left <= 3 ? 'soon' : 'ahead',
    overdue: left < 0, daysLeft: left, effective,
    extended: Boolean(assignment.extendedTo),
    inferred: assignment.dueConfidence === 'inferred',
  };
}

/**
 * Can a late coupon be spent on this assignment, and what would it buy?
 *
 * Her policy has three edges that matter and are easy to miss:
 *  - two Week 1 items are titled "NO LATE COUPONS" and are simply ineligible;
 *  - nothing is accepted after the hard stop, "even if that is less than 7 days
 *    after the due date", so the extension clamps;
 *  - the hard stop (2026-12-05) falls BEFORE the inferred Week 11 deadline
 *    (2026-12-06), which makes Week 11 work un-couponable outright.
 */
export function couponOffer(assignment, policy, spent = []) {
  const reason = r => ({ eligible: false, reason: r });
  if (assignment.coupon === false)
    return reason(assignment.couponNote ?? 'This assignment does not accept late coupons.');
  if (assignment.status === 'done') return reason('Already submitted.');
  if (!assignment.due) return reason('No due date to extend.');
  if (spent.some(s => s.assignment === assignment.id))
    return reason('A coupon is already spent on this one.');
  if (spent.length >= policy.coupons)
    return reason(`All ${policy.coupons} late coupons are spent.`);

  const wanted = addDays(assignment.due, policy.extensionDays);
  const granted = daysBetween(wanted, policy.hardStop) < 0 ? policy.hardStop : wanted;

  if (daysBetween(assignment.due, granted) <= 0)
    return reason(`The late-work cutoff (${policy.hardStop}) is not after this due date, ` +
                  `so a coupon would buy nothing.`);

  return {
    eligible: true, extendedTo: granted,
    daysGained: daysBetween(assignment.due, granted),
    clamped: granted !== wanted,
    clampNote: granted !== wanted
      ? `Clamped to the ${policy.hardStop} cutoff instead of the full ${policy.extensionDays} days.`
      : null,
    remainingAfter: policy.coupons - spent.length - 1,
  };
}

export function couponLedger(policy, spent = []) {
  return {
    total: policy.coupons, spent: spent.length,
    left: Math.max(0, policy.coupons - spent.length),
    hardStop: policy.hardStop, entries: spent,
    note: policy.hardStopWarning,
  };
}

/** Group assignments into course-timezone day buckets, soonest first. */
export function agenda(assignments, today = courseToday()) {
  const dated = assignments.filter(a => a.due && a.status !== 'done');
  const byDay = new Map();
  for (const a of dated) {
    const key = a.extendedTo ?? a.due;
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(a);
  }
  return [...byDay.entries()]
    .sort(([a],[b]) => a.localeCompare(b))
    .map(([date, items]) => ({
      date, items: items.sort((x,y) => (x.sequence ?? 0) - (y.sequence ?? 0)),
      ...dueState({ due: date }, today),
      points: items.reduce((s,i) => s + (i.possible ?? 0), 0),
      anyInferred: items.some(i => i.dueConfidence === 'inferred'),
    }));
}
