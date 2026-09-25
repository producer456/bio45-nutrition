// Shell, router and renderers.
//
// Rewritten rather than copied. The app this forks from is a recovered bundle with
// single-letter globals and its route allowlist duplicated in two places, so its
// behaviour was worth keeping and its source was not. Kept deliberately: deferring a
// redraw while a field is focused or a form is dirty, latching on unreadable saved
// state so a corrupt read can never be overwritten, and warning before unload while
// a save is still in flight. Each of those exists because a real bug was hit.
//
// Everything a person typed is written with textContent or escaped. This page shares
// an origin with several other study sites, so script execution here would reach
// their saved work.

import { CourseStore } from './course-store.js';
import { escape as esc } from './state-merge.js';
import { STATE_KEY, blankState, validateState, mergeAssignments, setOverlay,
         spentCoupons, backupName, THEMES } from './state.js';
import { courseGrade, neededFor, letterFor } from './grading.js';
import { checkEntry, diaryProgress, TIPS, SUBMISSION, REQUIRED_DAYS } from './diary.js';
import { courseToday, dueState, couponOffer, couponLedger, agenda, daysBetween } from './deadlines.js';

export const ROUTES = [
  { id: 'today',       title: 'Today',       blurb: 'What is due and what to do next' },
  { id: 'weeks',       title: 'Weeks',       blurb: 'The quarter, week by week' },
  { id: 'study',       title: 'Study',       blurb: 'Reading, objectives and self-quizzing' },
  { id: 'assignments', title: 'Coursework',  blurb: 'Every assignment and its score' },
  { id: 'grades',      title: 'Grades',      blurb: 'Where the grade stands' },
  { id: 'diary',       title: 'Food diary',  blurb: 'The ten-day diary and its rules' },
  { id: 'course',      title: 'Course',      blurb: 'Syllabus facts, policies, open questions' },
];
const ROUTE_IDS = ROUTES.map(r => r.id);
const DEFAULT_ROUTE = 'today';

let course = null, store = null, state = blankState();
let route = DEFAULT_ROUTE, dirty = false, unreadable = false, saving = false;

// Study session: which week is open, and the quiz in progress if there is one.
let studyWeek = null, weekContent = new Map();
let quiz = null;   // {week, order, i, picked, revealed}

const app = () => document.querySelector('#app');
const today = () => courseToday();

/* ---------- storage ---------------------------------------------------------- */

function boot() {
  let initial = blankState();
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw !== null) initial = validateState(JSON.parse(raw));
  } catch (err) {
    // Saved work exists but cannot be read or does not validate. Latch, and do not
    // write: overwriting it would destroy whatever is actually there.
    unreadable = true;
    console.warn('Saved work could not be read; this app will not overwrite it.', err);
  }
  state = initial;
  store = new CourseStore({
    key: STATE_KEY,
    initial,
    get: () => state,
    set: next => { state = next; if (!dirty) render(); },
    validate: validateState,
    notify: err => { unreadable = true; alert(err.message); render(); },
  });
  window.addEventListener('storage', ev => { if (ev.key === STATE_KEY) store.receive(); });
}

async function save(mutate, opts = {}) {
  if (unreadable && !opts.replace) return;
  const next = mutate(state);
  state = next;
  saving = true;
  try {
    await store.save(next, opts);
  } catch {
    // notify() has already surfaced it and latched.
  } finally {
    saving = false;
    render();
  }
}

/* ---------- derived ---------------------------------------------------------- */

const rows = () => mergeAssignments(course.assignments, state);
const grade = () => courseGrade(course, rows());
const weekOf = n => course.weeks.find(w => w.n === n);

function currentWeek(iso = today()) {
  const hit = course.weeks.find(w => iso >= w.start && iso <= w.end);
  if (hit) return hit;
  return iso < course.weeks[0].start ? course.weeks[0] : course.weeks.at(-1);
}

/* ---------- small view helpers ---------------------------------------------- */

const pct = v => v == null ? '—' : `${v.toFixed(1)}%`;
const pts = v => `${v}${v === 1 ? ' pt' : ' pts'}`;
const dateLabel = iso => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US',
  { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

const inferredMark = cond => cond
  ? `<span class="mark mark-inferred" title="Inferred from her stated Sunday cadence, not printed in Canvas. Confirm it there.">inferred</span>` : '';

const stateChip = st => {
  const label = { overdue: 'overdue', today: 'due today', soon: 'due soon', ahead: '', done: 'done', undated: 'no date' }[st.state] ?? '';
  return label ? `<span class="mark mark-${st.state}">${label}</span>` : '';
};

/* ---------- routes ---------------------------------------------------------- */

function viewToday() {
  const all = rows();
  const wk = currentWeek();
  const days = agenda(all, today()).slice(0, 4);
  const g = grade();
  const led = couponLedger(course.latePolicy, spentCoupons(state));
  const left = daysBetween(today(), course.term.termEnd);

  const urgent = days.filter(d => ['overdue', 'today', 'soon'].includes(d.state));
  return `
  <section class="card card-lead">
    <p class="eyebrow">Week ${wk.n} of 11 · ${left} days left in the term</p>
    <h2>${esc(wk.title)}</h2>
    <p class="muted">${wk.topics.map(esc).join(' · ')}</p>
  </section>

  ${urgent.length ? urgent.map(d => `
  <section class="card card-due card-due-${d.state}">
    <p class="eyebrow">${stateChip(d)} ${dateLabel(d.date)} · ${pts(d.points)} ${inferredMark(d.anyInferred)}</p>
    <ul class="tight">${d.items.map(i => `<li>
      ${esc(i.title)} <span class="muted">${i.possible ? pts(i.possible) : 'ungraded'}</span>
      ${i.coupon === false ? '<span class="mark mark-nocoupon">no late coupons</span>' : ''}
    </li>`).join('')}</ul>
  </section>`).join('')
  : `<section class="card"><p>Nothing due in the next three days.</p></section>`}

  <section class="card">
    <p class="eyebrow">Where the grade stands</p>
    ${g.graded
      ? `<p class="big">${pct(g.percent)} <span class="muted">${g.letter ?? ''}</span></p>
         <p class="muted">${g.earned} of ${g.possible} points on work that has been scored.</p>`
      : `<p class="big">—</p><p class="muted">Nothing scored yet. Enter scores in Coursework as they come back.</p>`}
    <p class="muted small">${g.remaining.computed} of ${g.denominators.computed} points still ahead.</p>
  </section>

  <section class="card">
    <p class="eyebrow">Late coupons</p>
    <p class="big">${'●'.repeat(led.left)}${'○'.repeat(led.spent)} <span class="muted">${led.left} of ${led.total} left</span></p>
    <p class="muted small">${esc(led.note ?? '')}</p>
  </section>`;
}

function viewWeeks() {
  const now = currentWeek();
  return `<section class="card"><p class="eyebrow">The quarter</p>
    <p class="muted">Modules open Sundays and must be done in order. Weeks 1–3 are written
    out; the rest carry their reading map and are filled in as the quarter runs.</p></section>
  ${course.weeks.map(w => {
    const mine = rows().filter(a => a.week === w.n && a.graded !== false);
    const done = mine.filter(a => a.status === 'done').length;
    return `<section class="card week ${w.n === now.n ? 'week-now' : ''}">
      <p class="eyebrow">Week ${w.n === 12 ? '· wrap' : w.n} · ${dateLabel(w.start)} – ${dateLabel(w.end)}
        ${w.n === now.n ? '<span class="mark mark-today">this week</span>' : ''}
        <span class="mark mark-${w.depth}">${w.depth === 'authored' ? 'written out' : 'reading map only'}</span></p>
      <h3>${esc(w.title)}</h3>
      ${w.readings.length ? `<p class="muted small">Reading —
        ${w.readings.map(r => `${esc(course.readingMap[r.book].title)} ch.&nbsp;${r.chapter} <em>${esc(r.title)}</em>`).join('; ')}</p>` : ''}
      ${w.supplements.map(s => `<p class="muted small note">${esc(course.readingMap[s.book].title)} for
        <strong>${esc(s.topic)}</strong> — ${esc(s.note)}</p>`).join('')}
      ${mine.length ? `<p class="muted small">${done} of ${mine.length} items ticked off ·
        ${pts(mine.reduce((s, a) => s + a.possible, 0))}</p>` : ''}
    </section>`;
  }).join('')}`;
}

function viewAssignments() {
  const all = rows();
  const byWeek = new Map();
  for (const a of all) {
    if (!byWeek.has(a.week)) byWeek.set(a.week, []);
    byWeek.get(a.week).push(a);
  }
  const catName = id => course.grading.categories.find(c => c.id === id)?.name ?? '—';

  return `<section class="card"><p class="eyebrow">Coursework</p>
    <p class="muted">Tick work off as you submit it and type the score when it comes back.
    An empty score means <strong>not yet graded</strong> — it is never treated as a zero.</p></section>
  ${[...byWeek.keys()].sort((a, b) => a - b).map(n => {
    const w = weekOf(n);
    return `<section class="card"><p class="eyebrow">Week ${n === 12 ? '· wrap' : n} · ${esc(w.title)}</p>
    <table class="grid"><thead><tr><th>Done</th><th>Assignment</th><th>Score</th><th>Due</th></tr></thead><tbody>
    ${byWeek.get(n).sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)).map(a => {
      const st = dueState(a, today());
      const ungraded = a.graded === false;
      return `<tr class="${a.status === 'done' ? 'row-done' : ''}">
        <td><input type="checkbox" data-act="done" data-id="${esc(a.id)}" ${a.status === 'done' ? 'checked' : ''}
             aria-label="Mark ${esc(a.title)} submitted"></td>
        <td><span class="cell-title">${esc(a.title)}</span>
            <span class="muted small">${ungraded ? 'ungraded' : catName(a.category)}</span>
            ${a.coupon === false ? '<span class="mark mark-nocoupon">no late coupons</span>' : ''}
            ${a.extendedTo ? `<span class="mark mark-extended">extended to ${dateLabel(a.extendedTo)}</span>` : ''}</td>
        <td>${ungraded ? '<span class="muted">—</span>' :
          `<input class="score" type="number" min="0" max="${a.possible}" step="0.5"
             data-act="score" data-id="${esc(a.id)}" value="${a.earned ?? ''}"
             placeholder="–" aria-label="Score out of ${a.possible} for ${esc(a.title)}">
           <span class="muted">/ ${a.possible}</span>`}</td>
        <td>${a.due ? `${dateLabel(a.due)} ${stateChip(st)} ${inferredMark(st.inferred)}` : '<span class="muted">no date</span>'}
            ${couponButton(a)}</td></tr>`;
    }).join('')}
    </tbody></table></section>`;
  }).join('')}`;
}

function couponButton(a) {
  if (a.status === 'done' || !a.due) return '';
  if (state.coupons?.[a.id]) return '';
  const offer = couponOffer(a, course.latePolicy, spentCoupons(state));
  if (!offer.eligible) return `<span class="muted small block" title="${esc(offer.reason)}">no coupon</span>`;
  return `<button type="button" class="link" data-act="coupon" data-id="${esc(a.id)}"
    title="Extends to ${offer.extendedTo}${offer.clamped ? ' — ' + offer.clampNote : ''}">use a coupon</button>`;
}

function viewGrades() {
  const g = grade();
  const scale = course.grading.scale;
  const d = course.grading.discrepancy;
  return `
  <section class="card card-lead">
    <p class="eyebrow">Scored so far</p>
    <p class="big">${pct(g.percent)} <span class="muted">${g.letter ?? ''}</span></p>
    <p class="muted">${g.earned} of ${g.possible} points on work that has a score.
    This is a standing, not a final grade.</p>
  </section>

  <section class="card card-warn">
    <p class="eyebrow">Two totals, and they disagree</p>
    <p>Her category subtotals add up to <strong>${course.grading.computedTotal}</strong>.
       The total row on her syllabus reads <strong>${course.grading.declaredTotal}</strong>.</p>
    <p class="muted small">${esc(d.note)}</p>
    <table class="grid"><thead><tr><th>Letter</th><th>Needs</th>
      <th>of ${course.grading.computedTotal}</th><th>of ${course.grading.declaredTotal}</th></tr></thead><tbody>
    ${scale.filter(b => b.min > 0).map(b => {
      const n = neededFor(b.letter, g.earned, course);
      return `<tr><th scope="row">${b.letter}</th><td class="muted">${b.min}%</td>
        <td>${n.computed.need} pts</td><td>${n.declared.need} pts</td></tr>`;
    }).join('')}
    </tbody></table>
    <p class="muted small">${esc(course.grading.scaleNote)}</p>
  </section>

  <section class="card">
    <p class="eyebrow">By category</p>
    <table class="grid"><thead><tr><th>Category</th><th>Scored</th><th>Banked</th><th>Budget</th></tr></thead><tbody>
    ${g.categories.map(c => `<tr>
      <th scope="row">${esc(c.name)}
        ${c.dropAllowance ? `<span class="mark mark-drop">drops ${c.dropAllowance} lowest</span>` : ''}
        ${c.dropProvisional ? '<span class="mark mark-inferred" title="Only some of this category is graded, so which score gets dropped is still a guess.">drop provisional</span>' : ''}</th>
      <td class="muted">${c.scoredCount}${c.count ? ` / ${c.count}` : ''}</td>
      <td>${c.earned}${c.possible ? ` / ${c.possible}` : ''} <span class="muted">${pct(c.percent)}</span></td>
      <td class="muted">${c.budget}</td></tr>
      ${c.projected.dropped.length ? `<tr class="row-sub"><td colspan="4" class="muted small">
        would drop: ${c.projected.dropped.map(x => `${esc(x.title ?? x.id)} (${x.earned}/${x.possible})`).join(', ')}</td></tr>` : ''}`).join('')}
    </tbody></table>
  </section>

  <section class="card">
    <p class="eyebrow">Points she promised but has not dated</p>
    <p class="muted">These count toward the ${course.grading.computedTotal}-point total. They are
    held here rather than given invented due dates.</p>
    <ul>${course.grading.unplaced.map(u => `<li><strong>${pts(u.points)}</strong>
      ${u.count ? `(${u.count} item${u.count === 1 ? '' : 's'})` : ''} —
      ${esc(course.grading.categories.find(c => c.id === u.category).name)}.
      <span class="muted small">${esc(u.note)}</span></li>`).join('')}</ul>
  </section>`;
}

function viewCourse() {
  const t = course.term, p = course.latePolicy;
  return `
  <section class="card"><p class="eyebrow">${esc(t.course)} · ${esc(t.college)}</p>
    <h2>${esc(course.subtitle)}</h2>
    <p class="muted">${esc(t.instructor)} · ${esc(t.instruction)} · ${t.units} units ·
      ${dateLabel(t.termStart)} – ${dateLabel(t.termEnd)}</p>
    <p class="note">${esc(t.examNote)}</p>
    <p class="muted small">Course facts here come from ${esc(t.source)}.</p>
  </section>
  <section class="card"><p class="eyebrow">Late work</p>
    <p>${esc(p.note)}</p>
    <p class="note">${esc(p.hardStopWarning)}</p>
    <p class="muted small">Unused-coupon penalty: ${esc(p.penaltyIfUnused)}</p>
  </section>
  <section class="card"><p class="eyebrow">Modules</p><p>${esc(course.moduleRules.note)}</p></section>
  <section class="card"><p class="eyebrow">Dates worth knowing</p>
    <ul>${t.notableDates.map(d => `<li><strong>${dateLabel(d.date)}</strong> — ${esc(d.what)}</li>`).join('')}</ul>
  </section>
  <section class="card"><p class="eyebrow">Reading</p>
    <ul>${Object.values(course.readingMap).map(b => `<li>${esc(b.title)}
      <span class="muted small">${esc(b.author ?? b.publisher)} · ${esc(b.license)}</span>
      ${b.note ? `<br><span class="muted small">${esc(b.note)}</span>` : ''}</li>`).join('')}</ul>
  </section>
  <section class="card"><p class="eyebrow">Your saved work</p>
    <p class="muted">Everything you type lives in this browser only. Nothing is sent anywhere.</p>
    <p><button type="button" class="action" data-act="backup">Export a backup</button>
       <button type="button" class="action" data-act="restore">Restore from a backup</button></p>
    <p class="muted small">${state.lastBackup ? `Last backup ${dateLabel(state.lastBackup.slice(0,10))}.`
      : 'You have not exported a backup yet.'}</p>
    <p><label>Appearance
      <select data-act="theme">${THEMES.map(t2 =>
        `<option value="${t2}" ${state.theme === t2 ? 'selected' : ''}>${t2}</option>`).join('')}</select></label></p>
  </section>`;
}

const viewStub = (title, body) =>
  `<section class="card"><p class="eyebrow">${esc(title)}</p><p class="muted">${esc(body)}</p></section>`;

/* ---------- study ----------------------------------------------------------- */

async function loadWeek(n) {
  if (weekContent.has(n)) return weekContent.get(n);
  const w = weekOf(n);
  if (!w?.contentFile) return null;
  try {
    const data = await (await fetch(`./${w.contentFile}`)).json();
    weekContent.set(n, data);
    return data;
  } catch {
    weekContent.set(n, null);
    return null;
  }
}

function viewStudy() {
  const authored = course.weeks.filter(w => w.depth === 'authored');
  const n = studyWeek ?? currentWeek().n;
  const w = weekOf(n);
  const data = weekContent.get(n);

  const picker = `<section class="card"><p class="eyebrow">Pick a week</p>
    <p class="chips">${course.weeks.filter(x => x.n <= 11).map(x =>
      `<button type="button" class="chip ${x.n === n ? 'chip-on' : ''}" data-act="study-week" data-week="${x.n}">
        ${x.n}${x.depth === 'authored' ? '' : '<span class="chip-dot" title="reading map only">·</span>'}</button>`).join('')}</p>
    <p class="muted small">Weeks ${authored.map(x => x.n).join(', ')} are written out.
      The rest carry their reading map and fill in as the quarter runs.</p></section>`;

  if (!data) return picker + `<section class="card"><p class="eyebrow">Week ${n} · ${esc(w.title)}</p>
    <p class="muted">This week is scaffolded, not yet written out. Its reading is below.</p>
    ${w.readings.map(r => `<p>${esc(course.readingMap[r.book].title)} — chapter ${r.chapter},
      <em>${esc(r.title)}</em></p>`).join('')}
    ${w.supplements.map(sp => `<p class="note muted small">${esc(course.readingMap[sp.book].title)} for
      <strong>${esc(sp.topic)}</strong> — ${esc(sp.note)}</p>`).join('')}</section>`;

  if (quiz && quiz.week === n) return picker + viewQuiz(data);

  return picker + `
  <section class="card"><p class="eyebrow">Week ${n} · what you should be able to do</p>
    <ol class="tight">${data.objectives.map(o => `<li>${esc(o.text)}
      <span class="cite">${esc(cite(o.source))}</span></li>`).join('')}</ol></section>
  <section class="card"><p class="eyebrow">Terms</p>
    <dl class="terms">${data.terms.map(t => `<dt>${esc(t.term)}</dt>
      <dd>${esc(t.gloss)} <span class="cite">${esc(cite(t.source))}</span></dd>`).join('')}</dl></section>
  <section class="card"><p class="eyebrow">Check yourself</p>
    <p class="muted">${data.questions.length} questions, in a random order. Every answer explains
      why the others are wrong, and cites where to read more.</p>
    <p><button type="button" class="action" data-act="quiz-start" data-week="${n}">Start</button></p></section>
  ${data.applicationPrompts?.length ? `<section class="card"><p class="eyebrow">Working on the application activity</p>
    ${data.applicationPrompts.map(a => `<div class="prompt">
      <p class="muted small">Checklist</p><ul class="tight">${a.checklist.map(c => `<li>${esc(c)}</li>`).join('')}</ul>
      <p class="muted small">Before you submit, ask yourself</p><ul class="tight">${a.selfCheck.map(c => `<li>${esc(c)}</li>`).join('')}</ul>
      <p class="policy">${esc(a.aiPolicy)}</p></div>`).join('')}</section>` : ''}`;
}

const cite = src => src ? `${course.readingMap[src.book]?.title ?? src.book} §${src.section}` : '';

function viewQuiz(data) {
  const q = data.questions[quiz.order[quiz.i]];
  const total = quiz.order.length;
  if (quiz.i >= total) {
    const right = quiz.results.filter(Boolean).length;
    return `<section class="card card-lead"><p class="eyebrow">Done</p>
      <p class="big">${right} of ${total}</p>
      <p class="muted">${right === total ? 'All correct.' : 'Worth rereading the ones you missed — each is cited above.'}</p>
      <p><button type="button" class="action" data-act="quiz-start" data-week="${quiz.week}">Go again</button>
         <button type="button" class="action" data-act="quiz-quit">Back to the week</button></p></section>`;
  }
  return `<section class="card">
    <p class="eyebrow">Question ${quiz.i + 1} of ${total}</p>
    <p class="stem">${esc(q.prompt)}</p>
    <div class="opts">${q.options.map((o, i) => {
      const picked = quiz.picked === i;
      const cls = quiz.revealed ? (i === q.answer ? 'opt opt-right' : picked ? 'opt opt-wrong' : 'opt') : 'opt';
      return `<button type="button" class="${cls}" data-act="quiz-pick" data-i="${i}"
        ${quiz.revealed ? 'disabled' : ''}>${esc(o)}</button>`;
    }).join('')}</div>
    ${quiz.revealed ? `<div class="feedback ${quiz.picked === q.answer ? 'right' : 'wrong'}">
      <p>${esc(q.why)}</p>
      ${quiz.picked !== q.answer && q.distractorNotes?.[quiz.picked]
        ? `<p class="muted small">Why not that one — ${esc(q.distractorNotes[quiz.picked])}</p>` : ''}
      <p class="cite">${esc(cite(q.source))}</p>
      <p><button type="button" class="action" data-act="quiz-next">
        ${quiz.i + 1 >= total ? 'Finish' : 'Next'}</button></p></div>` : ''}
  </section>`;
}

/* ---------- diary ----------------------------------------------------------- */

function viewDiary() {
  const p = diaryProgress(state.diary);
  const part1 = course.assignments.find(a => a.id === 'diary-part1');
  const part2 = course.assignments.find(a => a.id === 'diary-part2');

  return `
  <section class="card card-lead">
    <p class="eyebrow">Ten-day food diary · ${part1.possible} pts, due ${dateLabel(part1.due)}</p>
    <p class="big">${p.counted} of ${REQUIRED_DAYS} days</p>
    <div class="bar"><span data-fill="${(Math.min(p.counted, REQUIRED_DAYS) / REQUIRED_DAYS) * 100}"></span></div>
    <p class="muted">${p.points} of ${p.maxPoints} points at ${'2.5'} per complete day.
      ${p.remaining ? `${p.remaining} to go.` : 'All ten are logged.'}</p>
    ${p.warnings.map(w => `<p class="note warn">${esc(w)}</p>`).join('')}
  </section>

  <section class="card card-warn">
    <p class="eyebrow">What actually gets submitted</p>
    <p>${esc(SUBMISSION.what)} ${esc(SUBMISSION.where)}</p>
    <p class="note">${esc(SUBMISSION.warning)}</p>
    <p class="muted small">Two ways to collect it: ${SUBMISSION.alternatives.map(esc).join(' ')}</p>
    <p class="muted small">This app does not calculate nutrients — NutriCalc does, and it is what she
      grades. What this page is for is getting each entry specific enough to type in, and keeping count
      of the ten days.</p>
  </section>

  <section class="card"><p class="eyebrow">Add an entry</p>
    <form class="entry" data-act="entry-form">
      <label>Day <input type="date" name="date" value="${today()}" min="${course.term.termStart}" max="${course.term.termEnd}" required></label>
      <label>Food or drink <input name="food" placeholder="chicken thigh, skin off" required></label>
      <label>Portion <input name="portion" placeholder="4 oz" required></label>
      <label>How it was prepared <input name="prep" placeholder="grilled" required></label>
      <label class="check"><input type="checkbox" name="mixed"> Mixed dish (several ingredients)</label>
      <label class="check"><input type="checkbox" name="nonroutine"> This is a non-routine day</label>
      <button type="submit" class="action">Add</button>
    </form>
    <p class="muted small">Nothing here leaves your browser.</p>
  </section>

  <section class="card"><p class="eyebrow">Her collection rules</p>
    <ul class="tight">${TIPS.map(t => `<li>${esc(t)}</li>`).join('')}</ul></section>

  ${p.days.length ? p.days.map(d => {
    const day = state.diary[d.date];
    const entries = Object.entries(day.entries ?? {});
    return `<section class="card ${d.counts ? 'day-ok' : ''}">
      <p class="eyebrow">${dateLabel(d.date)}
        ${d.counts ? '<span class="mark mark-done">counts</span>'
                   : '<span class="mark mark-inferred">not complete</span>'}
        ${d.routine ? '' : '<span class="mark mark-extended">non-routine</span>'}</p>
      <ul class="entries">${entries.map(([id, e]) => {
        const probs = checkEntry(e);
        return `<li>
          <span>${esc(e.food)} — <strong>${esc(e.portion)}</strong>, ${esc(e.prep)}</span>
          <button type="button" class="link" data-act="entry-del" data-date="${d.date}" data-entry="${esc(id)}">remove</button>
          ${probs.map(x => `<span class="problem ${x.severity === 'warn' ? 'problem-warn' : ''}">${esc(x.msg)}</span>`).join('')}
        </li>`;
      }).join('')}</ul>
    </section>`;
  }).join('') : '<section class="card"><p class="muted">No days logged yet.</p></section>'}

  <section class="card"><p class="eyebrow">Part two · ${part2.possible} pts, due ${dateLabel(part2.due)}</p>
    <p class="muted">${esc(part2.title)}. Once the ten days are in NutriCalc, the analysis is written
      from its reports. This app does not write any part of it.</p></section>`;
}

const VIEWS = {
  today: viewToday, weeks: viewWeeks, assignments: viewAssignments,
  grades: viewGrades, course: viewCourse, study: viewStudy, diary: viewDiary,
};

/* ---------- shell ----------------------------------------------------------- */

function render() {
  const meta = ROUTES.find(r => r.id === route);
  app().innerHTML = `
  <a class="skip" href="#main">Skip to content</a>
  <header class="shell-head">
    <p class="brand">45<span>W</span> <span class="brand-sub">Nutrition</span></p>
    <nav class="tabs" role="tablist" aria-label="Sections">
      ${ROUTES.map(r => `<button type="button" role="tab" class="tab ${r.id === route ? 'tab-on' : ''}"
        aria-selected="${r.id === route}" aria-controls="main" data-route="${r.id}">${r.title}</button>`).join('')}
    </nav>
  </header>
  <p class="disclaimer"><b>Unofficial student study aid.</b> Built by a student taking
    ${esc(course.term.course)}. Not affiliated with, endorsed by, or reviewed by
    ${esc(course.term.college)} or ${esc(course.term.instructor)}.
    Confirm every date, point value and policy in Canvas — where this app is
    guessing, it says so.</p>
  ${unreadable ? `<p class="alarm">Saved work on this device could not be read, so the app
    has stopped writing to it in order not to destroy it. Restore from a backup to continue.</p>` : ''}
  <main id="main" class="workspace space-${route}" tabindex="-1">
    <h1>${meta.title}</h1><p class="muted lead">${meta.blurb}</p>
    ${VIEWS[route]()}
  </main>
  <footer class="shell-foot">
    <p>Course content adapted from openly licensed textbooks under
      <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" rel="noopener">CC BY-NC-SA 4.0</a>.
      This app does not draft any part of a submission.</p>
    <p class="muted small">Saved work lives under <code>${STATE_KEY}</code> in this browser.</p>
  </footer>`;
  applyAppearance();
  paintBars();
}

// The Content-Security-Policy is style-src 'self', which silently drops inline
// style="" attributes — the attribute lands in the HTML and is never applied, so a
// zero-width progress bar rendered full. Setting the property through CSSOM is not
// covered by style-src, so widths are applied here instead. Nothing in this app may
// emit an inline style attribute; tests/content.test.mjs enforces that.
function paintBars() {
  for (const el of document.querySelectorAll('[data-fill]'))
    el.style.width = `${Math.max(0, Math.min(100, Number(el.dataset.fill) || 0))}%`;
}

function applyAppearance() {
  const el = document.documentElement;
  const theme = state.theme ?? 'system';
  const sysDark = !window.matchMedia?.('(prefers-color-scheme: light)').matches;
  el.dataset.theme = theme;
  el.dataset.dark = String(theme === 'dark' || theme === 'dim' || (theme === 'system' && sysDark));
  el.dataset.learning = String(state.learningTheme ?? false);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',
    theme === 'dim' ? '#252529' : el.dataset.dark === 'true' ? '#111315' : '#f7f6f3');
}

function go(next) {
  route = ROUTE_IDS.includes(next) ? next : DEFAULT_ROUTE;
  if (location.hash.slice(1) !== route) location.hash = route;
  render();
  // Move focus for screen readers, but do NOT let the browser scroll to it: #main
  // sits below the disclaimer, and scrolling it into view hid the disclaimer on
  // every single navigation.
  document.querySelector('#main')?.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

/* ---------- events ---------------------------------------------------------- */

function wire() {
  document.addEventListener('click', ev => {
    const tab = ev.target.closest('[data-route]');
    if (tab) return go(tab.dataset.route);
    const act = ev.target.closest('[data-act]');
    if (!act) return;
    const { act: kind, id } = act.dataset;
    if (kind === 'done')    return save(s => setOverlay(s, id,
      { status: act.checked ? 'done' : 'todo' }));
    if (kind === 'coupon')  return spendCoupon(id);
    if (kind === 'backup')  return exportBackup();
    if (kind === 'restore') return importBackup();
    if (kind === 'study-week') { studyWeek = Number(act.dataset.week); quiz = null;
      return loadWeek(studyWeek).then(render); }
    if (kind === 'quiz-start')  return startQuiz(Number(act.dataset.week));
    if (kind === 'quiz-pick')   return pickAnswer(Number(act.dataset.i));
    if (kind === 'quiz-next')   return nextQuestion();
    if (kind === 'quiz-quit')   { quiz = null; return render(); }
    if (kind === 'entry-del')   return removeEntry(act.dataset.date, act.dataset.entry);
  });

  document.addEventListener('submit', ev => {
    const form = ev.target.closest('[data-act="entry-form"]');
    if (!form) return;
    ev.preventDefault();
    addEntry(new FormData(form));
  });

  document.addEventListener('change', ev => {
    const act = ev.target.closest('[data-act]');
    if (!act) return;
    if (act.dataset.act === 'score') {
      const raw = act.value.trim();
      const val = raw === '' ? null : Number(raw);
      if (val !== null && (Number.isNaN(val) || val < 0)) { act.value = ''; return; }
      dirty = false;
      return save(s => setOverlay(s, act.dataset.id, { earned: val }));
    }
    if (act.dataset.act === 'theme') return save(s => ({ ...s, theme: act.value }));
  });

  // Do not redraw under someone's fingers.
  document.addEventListener('input', () => { dirty = true; });
  document.addEventListener('focusout', ev => {
    if (!ev.target.closest('input, select, textarea')) dirty = false;
  });

  window.addEventListener('hashchange', () => go(location.hash.slice(1)));
  window.addEventListener('beforeunload', ev => {
    if (!saving) return;
    ev.preventDefault(); ev.returnValue = 'A save is still in flight.';
  });
  window.matchMedia?.('(prefers-color-scheme: light)').addEventListener?.('change', applyAppearance);
}

/* ---------- study + diary actions ------------------------------------------- */

function startQuiz(n) {
  const data = weekContent.get(n);
  if (!data?.questions?.length) return;
  const order = data.questions.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  studyWeek = n;
  quiz = { week: n, order, i: 0, picked: null, revealed: false, results: [] };
  render();
}

function pickAnswer(i) {
  if (!quiz || quiz.revealed) return;
  const data = weekContent.get(quiz.week);
  const q = data.questions[quiz.order[quiz.i]];
  quiz.picked = i;
  quiz.revealed = true;
  quiz.results[quiz.i] = i === q.answer;
  // Attempts are recorded so the week view can show what has been practised. They
  // are the student's own work and never leave the browser.
  save(s2 => ({ ...s2, attempts: [...s2.attempts.filter(a => a.id !== q.id),
    { id: q.id, week: quiz.week, correct: i === q.answer, at: today() }] }));
}

function nextQuestion() {
  if (!quiz) return;
  quiz.i += 1; quiz.picked = null; quiz.revealed = false;
  render();
}

function addEntry(fd) {
  const date = fd.get('date');
  if (!date) return;
  const id = `e${Date.now().toString(36)}`;
  const entry = {
    food: (fd.get('food') ?? '').trim(),
    portion: (fd.get('portion') ?? '').trim(),
    prep: (fd.get('prep') ?? '').trim(),
    mixed: fd.get('mixed') === 'on',
  };
  dirty = false;
  save(s2 => {
    const day = s2.diary[date] ?? { entries: {} };
    return { ...s2, diary: { ...s2.diary, [date]: {
      ...day,
      routine: fd.get('nonroutine') === 'on' ? false : (day.routine ?? true),
      entries: { ...day.entries, [id]: entry },
    } } };
  });
}

function removeEntry(date, id) {
  save(s2 => {
    const day = s2.diary[date];
    if (!day) return s2;
    const entries = { ...day.entries };
    delete entries[id];
    if (!Object.keys(entries).length) {
      const diary = { ...s2.diary };
      delete diary[date];
      return { ...s2, diary };
    }
    return { ...s2, diary: { ...s2.diary, [date]: { ...day, entries } } };
  });
}

function spendCoupon(id) {
  const a = rows().find(r => r.id === id);
  const offer = couponOffer(a, course.latePolicy, spentCoupons(state));
  if (!offer.eligible) return alert(offer.reason);
  const msg = `Spend a late coupon on "${a.title}"?\n\n` +
    `New deadline: ${offer.extendedTo} (${offer.daysGained} extra days).\n` +
    (offer.clamped ? `${offer.clampNote}\n` : '') +
    `${offer.remainingAfter} of ${course.latePolicy.coupons} coupons would remain.`;
  if (!confirm(msg)) return;
  save(s => ({ ...s, coupons: { ...s.coupons,
    [id]: { spentOn: today(), extendedTo: offer.extendedTo } } }));
}

function exportBackup() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = backupName(today());
  a.click(); URL.revokeObjectURL(url);
  save(s => ({ ...s, lastBackup: new Date().toISOString() }));
}

function importBackup() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'application/json,.json';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) return alert('That file is too large to be saved work.');
    try {
      const next = validateState(JSON.parse(await file.text()));
      if (!confirm('Restoring replaces everything saved in this browser. Continue?')) return;
      unreadable = false;
      await save(() => next, { replace: true });
    } catch (err) {
      alert(`That backup could not be restored.\n\n${err.message}`);
    }
  };
  input.click();
}

/* ---------- start ----------------------------------------------------------- */

export async function start() {
  course = await (await fetch('./course.json')).json();
  boot();
  wire();
  studyWeek = currentWeek().n;
  await loadWeek(studyWeek);
  go(location.hash.slice(1) || DEFAULT_ROUTE);

  // Offline support. Scope is confined to this directory: the origin is shared with
  // other study sites. Registration failure must never block the app, so it is
  // swallowed. Not gated on https, so localhost still exercises it.
  if ('serviceWorker' in navigator)
    navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => {});
}

if (typeof document !== 'undefined' && !globalThis.__BIO45_TEST__) start();
