// The ten-day food diary.
//
// This does NOT compute nutrients. NutritionCalc Plus is a separate required
// purchase and it is what she grades — the Food List Report exported from it. If
// this app calculated its own numbers they would eventually disagree with the ones
// on the submission, which helps nobody. Its job is narrower and more useful: get
// each entry specific enough to type into NutriCalc, and track the ten days.
//
// The rubric is hers: "Your input should include the food, preparation and portion
// size consumed for each item. Portion sizes consumed must be specific and can be
// reported as cups/teaspoons/tablespoons/ounces/grams etc... Do not just put
// '1 serving' or similar."

export const REQUIRED_DAYS = 10;
export const POINTS_PER_DAY = 2.5;

export const UNITS = [
  'cup','cups','tsp','teaspoon','teaspoons','tbsp','tablespoon','tablespoons',
  'oz','ounce','ounces','g','gram','grams','ml','l','litre','liter',
  'slice','slices','piece','pieces','each','can','bottle','packet','scoop','fillet',
];

// Things students write instead of a portion. Each is rejected by name so the
// message can quote the rubric rather than just saying "invalid".
const VAGUE = [
  /^\s*\d*\s*servings?\s*$/i, /^\s*some\b/i, /^\s*a\s+(little|lot|bit)\b/i,
  /^\s*(small|medium|large|big)\s*$/i, /^\s*handful\s*$/i, /^\s*portion\s*$/i,
  /^\s*plenty\s*$/i, /^\s*enough\s*$/i, /^\s*normal\s*$/i, /^\s*regular\s*$/i,
];

const unitPattern = new RegExp(`(^|[\\s\\d./-])(${UNITS.join('|')})\\b`, 'i');
const hasNumber = s => /\d|½|¼|¾|⅓|⅔|\b(one|two|three|four|half|quarter)\b/i.test(s);

/** Check one entry against her rubric. Returns a list of problems, empty if fine. */
export function checkEntry(entry = {}) {
  const problems = [];
  const food = (entry.food ?? '').trim();
  const portion = (entry.portion ?? '').trim();
  const prep = (entry.prep ?? '').trim();

  if (!food) problems.push({ field: 'food', msg: 'Name the food or drink.' });

  if (!portion) {
    problems.push({ field: 'portion', msg: 'Give a portion. "Do not just put “1 serving” or similar."' });
  } else if (VAGUE.some(re => re.test(portion))) {
    problems.push({ field: 'portion',
      msg: `"${portion}" is the kind of answer the rubric rules out. Give an amount — ` +
           `½ cup rice, 10 potato chips, 2 oz tofu.` });
  } else {
    if (!hasNumber(portion)) problems.push({ field: 'portion', msg: 'The portion needs a number.' });
    if (!unitPattern.test(portion)) problems.push({ field: 'portion',
      msg: 'Add a unit — cups, teaspoons, tablespoons, ounces or grams.' });
  }

  if (!prep) problems.push({ field: 'prep',
    msg: 'Say how it was prepared. Baked or fried? Peeled? Skin on or off?' });

  // Her worked example: a tuna sandwich becomes bread + mayo + tuna.
  if (entry.mixed && !(entry.components ?? []).length)
    problems.push({ field: 'components', severity: 'warn',
      msg: 'Mixed dish — break it into ingredients, or build it in NutriCalc’s recipe builder.' });

  // Cut and skin change the numbers materially for meat.
  if (/\b(chicken|turkey|duck)\b/i.test(food) && !/\b(breast|thigh|leg|wing|drumstick)\b/i.test(`${food} ${prep}`))
    problems.push({ field: 'food', severity: 'warn',
      msg: 'Which cut — leg, thigh or breast? And skin on or off?' });

  return problems;
}

export const entryOk = entry => !checkEntry(entry).some(p => p.severity !== 'warn');

/** Progress across the ten days. */
export function diaryProgress(diary = {}) {
  const days = Object.entries(diary)
    .map(([date, day]) => {
      const entries = Object.values(day.entries ?? {});
      const clean = entries.filter(entryOk);
      return {
        date, routine: day.routine !== false,
        entries: entries.length, clean: clean.length,
        problems: entries.length - clean.length,
        counts: entries.length > 0 && clean.length === entries.length,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const counted = days.filter(d => d.counts);
  const nonRoutine = counted.filter(d => !d.routine);

  return {
    days, counted: counted.length, required: REQUIRED_DAYS,
    complete: counted.length >= REQUIRED_DAYS,
    remaining: Math.max(0, REQUIRED_DAYS - counted.length),
    hasNonRoutineDay: nonRoutine.length > 0,
    points: Math.min(REQUIRED_DAYS, counted.length) * POINTS_PER_DAY,
    maxPoints: REQUIRED_DAYS * POINTS_PER_DAY,
    warnings: [
      ...(counted.length >= REQUIRED_DAYS && !nonRoutine.length
        ? ['Ten days are logged, but none is marked as a non-routine day. She asks for at least one day off your usual routine.'] : []),
      ...(days.some(d => d.problems > 0)
        ? ['Some entries are missing a portion, a preparation method, or both. They do not count toward a day yet.'] : []),
    ],
  };
}

/** Her collection tips, carried verbatim in substance so nothing is lost. */
export const TIPS = [
  'Include every food and drink, and be as specific as you can. Chicken — leg, thigh or breast? Skin on or off?',
  'Estimate the portion as carefully as you can: ½ cup rice, 10 potato chips, 2 oz tofu.',
  'Record how it was cooked or prepared. Was the potato peeled? Was the chicken skinless? Baked or fried?',
  'Include anything added to it — ketchup, mustard, salad dressing.',
  'Record all snacks, beverages and desserts.',
  'Fast food is usually already in the database. Search by the item: "hamburger", "cheesecake".',
  'Break mixed dishes into their parts. A tuna sandwich is 2 slices wholewheat bread, 1 T mayo, 3 oz tuna in water.',
  'NutriCalc has a recipe builder — enter the recipe once, then say what serving you ate.',
];

export const SUBMISSION = {
  what: 'The Food List Report, exported from NutriCalc as a PDF.',
  where: 'In NutriCalc, under Reports.',
  warning: 'No credit is given without the Food List Report.',
  alternatives: [
    'Keep a paper daily food log and type it into NutriCalc afterwards, or',
    'Use the mobile shortcut on Android or iOS and track as you go.',
  ],
};

/**
 * The diary synced from the phone and watch.
 *
 * Only the tailnet copy has this file — the public site returns 404 and simply
 * shows nothing, which is the intended behaviour rather than a fallback. What
 * someone eats is not published.
 */
export async function loadSyncedDiary(url = './diary.json') {
  try {
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) return null;
    const raw = await response.json();
    if (raw?.version !== 1 || typeof raw.days !== 'object') return null;
    return raw;
  } catch {
    return null;
  }
}

/**
 * Fold synced days onto the ones typed into this browser.
 *
 * A date present in both takes the phone's version: it is logged as the food is
 * eaten, where the browser copy is typed from memory afterwards. Nothing is
 * deleted — a browser-only day survives untouched.
 */
export function mergeSynced(localDiary = {}, synced) {
  if (!synced?.days) return { diary: localDiary, syncedDates: [] };
  const diary = { ...localDiary };
  const syncedDates = [];
  for (const [date, day] of Object.entries(synced.days)) {
    if (!day?.entries?.length) continue;
    syncedDates.push(date);
    diary[date] = {
      routine: day.isRoutine !== false,
      fromPhone: true,
      entries: Object.fromEntries(day.entries.map((e, i) => [e.id || `s${i}`, {
        food: e.food, portion: e.portion, prep: e.prep,
        mixed: Boolean(e.isMixed), components: e.components ?? [],
      }])),
    };
  }
  return { diary, syncedDates: syncedDates.sort() };
}
