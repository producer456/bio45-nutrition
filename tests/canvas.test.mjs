import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {normaliseTitle,instantToCourseDate,dueDateOf,validateCalendar,applyCalendar} from '../assets/canvas.js';

const course=JSON.parse(readFileSync(new URL('../course.json',import.meta.url)));
const A=course.assignments;

test('a UTC instant lands on the right COURSE date, not the viewer’s',()=>{
  // 06:59 UTC is 23:59 the previous day in California. The milestone that looks
  // like the 24th in the feed is really the 23rd for the student.
  assert.equal(instantToCourseDate('2026-09-24T06:59:00+00:00'),'2026-09-23');
  assert.equal(instantToCourseDate('2026-09-26T06:59:00+00:00'),'2026-09-25');
  assert.equal(instantToCourseDate('2026-09-27T07:00:00+00:00'),'2026-09-27');
  assert.equal(instantToCourseDate('nonsense'),null);
});

test('titles normalise across the ways Canvas and the syllabus spell them',()=>{
  assert.equal(normaliseTitle('About the Course and You- NO LATE COUPONS'),
               normaliseTitle('About the Course and You'));
  assert.equal(normaliseTitle('First Discussion- Introduce yourself - No Late Coupons'),
               normaliseTitle('First Discussion- Introduce yourself'));
  assert.equal(normaliseTitle('Week 1 Discussion: Intro to Nutrition: Milestone 1'),
               normaliseTitle('Week 1 Discussion: Intro to Nutrition'));
  // Both decorations at once, in the order Canvas writes them. A single ordered
  // pass missed this: the coupon note only reaches the end after the milestone
  // suffix is gone, so the milestone lost its parent and showed as an orphan.
  assert.equal(normaliseTitle('First Discussion- Introduce yourself - No Late Coupons: Milestone 1'),
               normaliseTitle('First Discussion- Introduce yourself'));
  assert.notEqual(normaliseTitle('Case Study 1: Nutrient Density'),
                  normaliseTitle('Case Study: Energy Density'),
                  'genuinely different assignments must NOT collapse together');
});

test('a feed that never stated a timezone yields no date at all',()=>{
  assert.equal(dueDateOf({due:'20260927T235900',dueKind:'floating'}),null);
  assert.equal(dueDateOf({due:null,dueKind:'unknown'}),null);
  assert.equal(dueDateOf({due:'2026-09-27',dueKind:'date'}),'2026-09-27');
});

test('a calendar for the wrong course, or the wrong shape, is refused',()=>{
  assert.equal(validateCalendar(null),null);
  assert.equal(validateCalendar({version:2,items:[],course:'40466'}),null);
  assert.equal(validateCalendar({version:1,items:{},course:'40466'}),null);
  assert.equal(validateCalendar({version:1,items:[],course:'39756'}),null,'that is BIOL 40C');
  assert.ok(validateCalendar({version:1,items:[],course:'40466'}));
});

test('a missing or broken calendar changes NOTHING',()=>{
  for(const bad of [null,undefined,{},{version:1},{version:1,course:'39756',items:[]}]){
    const r=applyCalendar(A,bad);
    assert.equal(r.applied,0);
    assert.deepEqual(r.assignments,A,'the schedule must survive a bad feed intact');
  }
});

test('a Canvas date overrides a projection and clears the inferred flag',()=>{
  const target=A.find(a=>a.projected&&a.due);
  assert.ok(target,'there are projections to override');
  const cal={version:1,course:'40466',error:'',items:[
    {id:'x',title:target.title,due:'2026-10-07',dueKind:'date',milestone:false}]};
  const r=applyCalendar(A,cal);
  const after=r.assignments.find(a=>a.id===target.id);
  assert.equal(after.due,'2026-10-07');
  assert.equal(after.dueConfidence,'canvas');
  assert.equal(after.projected,false,'a real date is not a projection');
  assert.match(after.dueSource,/Canvas/);
  assert.equal(r.applied,1);
});

test('a milestone attaches to its parent rather than becoming its own row',()=>{
  const cal={version:1,course:'40466',error:'',items:[
    {id:'m',title:'Week 1 Discussion: Intro to Nutrition: Milestone 1',
     due:'2026-09-24T06:59:00+00:00',dueKind:'instant',milestone:true}]};
  const r=applyCalendar(A,cal);
  assert.equal(r.assignments.length,A.length,'no extra row was created');
  const parent=r.assignments.find(a=>a.id==='w01-discussion');
  assert.equal(parent.milestone.date,'2026-09-23','converted into course time');
  assert.equal(parent.milestone.source,'canvas');
  assert.equal(parent.due,'2026-09-27','the assignment date itself is untouched');
});

test('something Canvas knows about and we do not is SURFACED, never dropped',()=>{
  // This is how a newly added or renamed assignment becomes visible instead of
  // silently missing. It is exactly how the Case Study rename was caught.
  const cal={version:1,course:'40466',error:'',items:[
    {id:'n',title:'Surprise Extra Credit Essay',due:'2026-10-20',dueKind:'date',milestone:false}]};
  const r=applyCalendar(A,cal);
  assert.equal(r.extras.length,1,'an unmatched Canvas item must show up');
  assert.equal(r.extras[0].title,'Surprise Extra Credit Essay');
  assert.equal(r.extras[0].due,'2026-10-20');
});

test('the Case Study rename is reconciled: Canvas and course.json now agree',()=>{
  const ours=A.find(a=>a.id==='w01-energy-density');
  assert.equal(ours.title,'Case Study 1: Nutrient Density',
    'Canvas is the live source; the syllabus summary called it Energy Density');
  const cal={version:1,course:'40466',error:'',items:[
    {id:'n',title:'Case Study 1: Nutrient Density',due:'2026-09-27',dueKind:'date',milestone:false}]};
  const r=applyCalendar(A,cal);
  assert.deepEqual(r.extras,[],'it matches now, so it is no longer an extra');
  assert.equal(r.applied,1);
});

test('EVERY item in the live feed finds its home',()=>{
  const path=new URL('../calendar.json',import.meta.url);
  if(!existsSync(path)) return;
  const cal=JSON.parse(readFileSync(path));
  const r=applyCalendar(A,cal);
  assert.deepEqual(r.extras.map(x=>x.title),[],
    'an unmatched feed item means the app is missing or misnaming an assignment');
  assert.equal(r.applied,cal.items.length,
    `${r.applied} of ${cal.items.length} feed items were applied`);
});

test('the published feed applies cleanly to the real course data',()=>{
  const path=new URL('../calendar.json',import.meta.url);
  if(!existsSync(path)) return;                     // published separately; skip if absent
  const cal=JSON.parse(readFileSync(path));
  const r=applyCalendar(A,cal);
  assert.ok(r.applied>=8,`only ${r.applied} of ${cal.items.length} feed items matched`);
  for(const a of r.assignments)
    if(a.dueConfidence==='canvas') assert.equal(a.projected,false);
});

import {calendarHealth,STALE_HOURS} from '../assets/canvas.js';

test('a feed that stopped refreshing is reported STALE, not trusted silently',()=>{
  const now=1790000000;
  const fresh=calendarHealth({lastAttempt:now-600,error:''},now);
  assert.equal(fresh.stale,false);
  assert.equal(fresh.error,null);
  const old=calendarHealth({lastAttempt:now-(STALE_HOURS+1)*3600,error:''},now);
  assert.equal(old.stale,true,'past the threshold it must be flagged');
  assert.ok(old.ageHours>STALE_HOURS);
  // A publisher that has never run at all is the worst case, not the best.
  assert.equal(calendarHealth({error:''},now).stale,true);
  assert.equal(calendarHealth(null,now).present,false);
});

test("the publisher's own error is carried through, not swallowed",()=>{
  const h=calendarHealth({lastAttempt:1790000000,error:'Canvas refresh failed.'},1790000600);
  assert.equal(h.stale,false,'recent attempt');
  assert.match(h.error,/Canvas refresh failed/,'but the error still surfaces');
});

test('the last-checked date is in COURSE time, not UTC',()=>{
  // 2026-09-26T00:18Z is still the evening of the 25th in California.
  const h=calendarHealth({lastAttempt:Date.parse('2026-09-26T00:18:00Z')/1000,error:''},
                         Date.parse('2026-09-26T00:20:00Z')/1000);
  assert.equal(h.checkedAt,'2026-09-25');
});
