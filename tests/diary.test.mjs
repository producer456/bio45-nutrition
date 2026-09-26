import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkEntry,entryOk,diaryProgress,TIPS,SUBMISSION,UNITS,REQUIRED_DAYS,POINTS_PER_DAY} from '../assets/diary.js';

const good={food:'brown rice',portion:'1/2 cup',prep:'boiled'};
const msgs=e=>checkEntry(e).map(p=>p.msg).join(' | ');

test('a specific entry passes',()=>{
  assert.deepEqual(checkEntry(good),[]);
  assert.ok(entryOk(good));
  for(const p of ['1/2 cup','2 oz','10 g','250 ml','2 slices','1 tbsp','3 tablespoons','½ cup'])
    assert.deepEqual(checkEntry({...good,portion:p}),[],`"${p}" should pass`);
});

test('"1 serving" is rejected, quoting HER rubric',()=>{
  const m=msgs({...good,portion:'1 serving'});
  assert.match(m,/1 serving/);
  assert.match(m,/rubric rules out|do not just put/i);
  assert.equal(entryOk({...good,portion:'1 serving'}),false);
});

test('every vague portion the rubric warns about is caught',()=>{
  for(const p of ['1 serving','servings','2 servings','some','a little','a lot','a bit',
                  'large','medium','handful','portion','plenty','enough','normal','regular'])
    assert.equal(entryOk({...good,portion:p}),false,`"${p}" should be rejected`);
});

test('a portion needs both a number and a unit',()=>{
  assert.match(msgs({...good,portion:'cup'}),/needs a number/);
  assert.match(msgs({...good,portion:'2 blobs'}),/Add a unit/);
  assert.equal(entryOk({...good,portion:''}),false);
  assert.match(msgs({...good,portion:''}),/1 serving/,'the empty case quotes the rubric too');
});

test('preparation method is required — baked or fried, peeled or not',()=>{
  assert.match(msgs({...good,prep:''}),/prepared|Baked or fried|Peeled/i);
  assert.equal(entryOk({...good,prep:''}),false);
});

test('chicken without a cut is flagged, but only as a warning',()=>{
  const e={food:'chicken',portion:'4 oz',prep:'roasted'};
  const p=checkEntry(e);
  assert.ok(p.some(x=>/leg, thigh or breast/i.test(x.msg)));
  assert.ok(p.every(x=>x.severity==='warn'));
  assert.ok(entryOk(e),'a warning does not stop the day counting');
  assert.deepEqual(checkEntry({food:'chicken breast',portion:'4 oz',prep:'grilled, skin off'}),[]);
});

test('a mixed dish is asked for its parts — her tuna-sandwich example',()=>{
  const e={food:'tuna sandwich',portion:'1 each',prep:'assembled',mixed:true};
  assert.match(msgs(e),/recipe builder|ingredients/i);
  assert.deepEqual(checkEntry({...e,components:['2 slices wholewheat bread','1 T mayo','3 oz tuna in water']}),[]);
});

test('only clean days count toward the ten',()=>{
  const day=n=>({entries:Object.fromEntries(Array.from({length:n},(_,i)=>[`e${i}`,good]))});
  const diary={};
  for(let i=1;i<=9;i++) diary[`2026-10-0${i}`]=day(3);
  let p=diaryProgress(diary);
  assert.equal(p.counted,9); assert.equal(p.complete,false); assert.equal(p.remaining,1);
  assert.equal(p.points,22.5);
  diary['2026-10-10']={entries:{a:good,b:{food:'soup',portion:'1 serving',prep:'heated'}}};
  p=diaryProgress(diary);
  assert.equal(p.counted,9,'a day with a bad entry does not count');
  assert.ok(p.warnings.some(w=>/portion, a preparation method/i.test(w)));
});

test('ten clean days complete the diary and score full marks',()=>{
  const diary={};
  for(let i=1;i<=10;i++) diary[`2026-10-${String(i).padStart(2,'0')}`]={entries:{a:good},routine:i!==4};
  const p=diaryProgress(diary);
  assert.equal(p.counted,10);
  assert.equal(p.complete,true);
  assert.equal(p.points,REQUIRED_DAYS*POINTS_PER_DAY);
  assert.equal(p.points,25);
  assert.equal(p.hasNonRoutineDay,true);
  assert.deepEqual(p.warnings,[]);
});

test('ten routine days warn that no non-routine day is marked',()=>{
  const diary={};
  for(let i=1;i<=10;i++) diary[`2026-10-${String(i).padStart(2,'0')}`]={entries:{a:good},routine:true};
  const p=diaryProgress(diary);
  assert.equal(p.complete,true);
  assert.equal(p.hasNonRoutineDay,false);
  assert.ok(p.warnings.some(w=>/non-routine/i.test(w)));
});

test('days come back in date order however they were added',()=>{
  const p=diaryProgress({'2026-10-05':{entries:{}},'2026-10-01':{entries:{}},'2026-10-03':{entries:{}}});
  assert.deepEqual(p.days.map(d=>d.date),['2026-10-01','2026-10-03','2026-10-05']);
});

test('her collection tips and the submission rule are all carried',()=>{
  const all=TIPS.join(' ');
  for(const must of ['skin on','ketchup','snacks','recipe builder','tuna sandwich','hamburger','peeled'])
    assert.match(all,new RegExp(must,'i'),`tips must mention ${must}`);
  assert.match(SUBMISSION.what,/Food List Report/);
  assert.match(SUBMISSION.where,/Reports/);
  assert.match(SUBMISSION.warning,/No credit/i);
  assert.equal(SUBMISSION.alternatives.length,2,'paper log or the mobile shortcut');
  assert.match(SUBMISSION.alternatives.join(' '),/mobile shortcut.*Android or iOS/i);
});

test('this app never computes nutrient values',()=>{
  const src=readFileSync(new URL('../assets/diary.js',import.meta.url),'utf8');
  for(const forbidden of [/\bkcal\b/i,/calorie/i,/\bprotein_g\b/,/nutrientValue/,/computeNutrients/])
    assert.equal(forbidden.test(src),false,`diary.js must not compute nutrients: ${forbidden}`);
});
import {readFileSync} from 'node:fs';

test('diary-rules.json is the SINGLE source: diary.js agrees with it exactly',()=>{
  // The iOS and watchOS app read this JSON. If the web app's own constants drift
  // from it, the two implementations start disagreeing about whether an entry
  // counts toward the ten days — the kind of split that is invisible until it
  // costs points.
  const rules=JSON.parse(readFileSync(new URL('../content/diary-rules.json',import.meta.url)));
  assert.equal(rules.requiredDays,REQUIRED_DAYS);
  assert.equal(rules.pointsPerDay,POINTS_PER_DAY);
  assert.deepEqual(rules.units,UNITS,'unit vocabulary must match');
  assert.deepEqual(rules.tips,TIPS,'her collection tips must match');
  assert.equal(rules.submission.what,SUBMISSION.what);
  assert.equal(rules.submission.where,SUBMISSION.where);
  assert.equal(rules.submission.warning,SUBMISSION.warning);
  assert.deepEqual(rules.submission.alternatives,SUBMISSION.alternatives);
  // Every portion the JSON calls vague must actually be rejected by the linter.
  for(const v of rules.vaguePortions){
    const sample=v.pattern
      .replace(/\^\\s\*/,'').replace(/\\s\*\$/,'').replace(/\\b.*$/,'')
      .replace(/\\d\*\\s\*/,'1 ').replace(/\(([^)]*)\)/,(m,g)=>g.split('|')[0])
      .replace(/[\^$\\]/g,'').trim();
    if(!sample) continue;
    assert.equal(entryOk({food:'x',prep:'y',portion:sample}),false,
      `"${sample}" is listed as vague in diary-rules.json but the linter accepts it`);
  }
});
