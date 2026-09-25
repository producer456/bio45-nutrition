import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {addDays,daysBetween,isRealDate,dueState,couponOffer,couponLedger,agenda,courseToday} from '../assets/deadlines.js';

const course=JSON.parse(readFileSync(new URL('../course.json',import.meta.url)));
const P=course.latePolicy;
const find=id=>course.assignments.find(a=>a.id===id);

test('date helpers survive month and year edges',()=>{
  assert.equal(addDays('2026-11-29',7),'2026-12-06');
  assert.equal(addDays('2026-12-28',7),'2027-01-04');
  assert.equal(daysBetween('2026-09-21','2026-09-27'),6);
  assert.equal(daysBetween('2026-12-06','2026-12-05'),-1);
  assert.ok(isRealDate('2026-02-28'));
  assert.equal(isRealDate('2026-02-31'),false,'rolls over, so it is not a real date');
  assert.equal(isRealDate('2026-9-1'),false);
});

test('every due date in course.json is a real calendar date',()=>{
  for(const a of course.assignments)
    if(a.due) assert.ok(isRealDate(a.due),`${a.id} has due ${a.due}`);
});

test('every inferred due date falls on a Sunday',()=>{
  for(const a of course.assignments){
    if(a.dueConfidence!=='inferred'||!a.due) continue;
    const d=new Date(a.due+'T12:00:00Z').getUTCDay();
    assert.equal(d,0,`${a.id} due ${a.due} should be a Sunday`);
  }
});

test('every stated due date cites a source',()=>{
  for(const a of course.assignments)
    if(a.dueConfidence==='stated') assert.ok(a.dueSource,`${a.id} must say where its date came from`);
});

test('dueState distinguishes overdue, today, soon and ahead',()=>{
  const t='2026-09-25';
  assert.equal(dueState({due:'2026-09-20'},t).state,'overdue');
  assert.equal(dueState({due:'2026-09-25'},t).state,'today');
  assert.equal(dueState({due:'2026-09-27'},t).state,'soon');
  assert.equal(dueState({due:'2026-10-30'},t).state,'ahead');
  assert.equal(dueState({due:'2026-09-20',status:'done'},t).state,'done');
  assert.equal(dueState({due:'2026-09-20'},t).overdue,true);
  assert.equal(dueState({due:'2026-10-04',dueConfidence:'inferred'},t).inferred,true);
});

test('the two Week 1 NO-LATE-COUPON items refuse a coupon, quoting Canvas',()=>{
  for(const id of ['w01-about-you','w01-first-discussion']){
    const o=couponOffer(find(id),P,[]);
    assert.equal(o.eligible,false,`${id} must refuse`);
    assert.match(o.reason,/No Late Coupons/i);
  }
});

test('a normal coupon buys exactly 7 days',()=>{
  const o=couponOffer({id:'x',due:'2026-10-04',coupon:true},P,[]);
  assert.equal(o.eligible,true);
  assert.equal(o.extendedTo,'2026-10-11');
  assert.equal(o.daysGained,7);
  assert.equal(o.clamped,false);
  assert.equal(o.remainingAfter,2);
});

test('an extension past the cutoff is clamped to 2026-12-05',()=>{
  const o=couponOffer({id:'x',due:'2026-11-29',coupon:true},P,[]);
  assert.equal(o.extendedTo,'2026-12-05','not 2026-12-06');
  assert.equal(o.clamped,true);
  assert.equal(o.daysGained,6,'six days, not the full seven');
  assert.match(o.clampNote,/2026-12-05/);
});

test('WEEK 11 CANNOT BE COUPONED — the cutoff precedes its deadline',()=>{
  const w11=course.assignments.filter(a=>a.week===11&&a.due);
  assert.ok(w11.length>0,'week 11 has dated work');
  for(const a of w11){
    assert.equal(a.due,'2026-12-06');
    const o=couponOffer(a,P,[]);
    assert.equal(o.eligible,false,`${a.id} must refuse: 12-05 is before 12-06`);
    assert.match(o.reason,/not after this due date|buy nothing/i);
  }
  assert.match(P.hardStopWarning,/Week 11/);
});

test('coupons are a finite consumable',()=>{
  const spent=[{assignment:'a'},{assignment:'b'},{assignment:'c'}];
  const o=couponOffer({id:'d',due:'2026-10-04',coupon:true},P,spent);
  assert.equal(o.eligible,false);
  assert.match(o.reason,/All 3 late coupons are spent/);
  assert.equal(couponLedger(P,spent).left,0);
  assert.equal(couponLedger(P,spent.slice(0,1)).left,2);
});

test('the same coupon cannot be spent twice, and done work refuses one',()=>{
  const a={id:'w02-checkin',due:'2026-10-04',coupon:true};
  assert.match(couponOffer(a,P,[{assignment:'w02-checkin'}]).reason,/already spent/i);
  assert.match(couponOffer({...a,status:'done'},P,[]).reason,/Already submitted/i);
});

test('agenda buckets by day, soonest first, and flags inferred days',()=>{
  const rows=agenda(course.assignments,'2026-09-25');
  assert.ok(rows.length>0);
  for(let i=1;i<rows.length;i++) assert.ok(rows[i-1].date<=rows[i].date,'sorted');
  const sunday=rows.find(r=>r.date==='2026-09-27');
  assert.equal(sunday.items.length,7,'seven graded items land on 2026-09-27');
  assert.equal(sunday.points,135);
  assert.equal(sunday.anyInferred,false,'week 1 is all stated');
  assert.ok(rows.find(r=>r.date==='2026-10-04').anyInferred,'week 2 is inferred');
});

test('week 1 really does carry 155 graded points',()=>{
  const w1=course.assignments.filter(a=>a.week===1&&a.graded!==false);
  assert.equal(w1.reduce((s,a)=>s+a.possible,0),155);
  assert.equal(w1.length,8);
});

test('courseToday returns a real ISO date in the course timezone',()=>{
  const t=courseToday(new Date('2026-09-26T04:30:00Z'));
  assert.equal(t,'2026-09-25','04:30 UTC is still the 25th in California');
  assert.ok(isRealDate(courseToday()));
});
