import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NS,STATE_KEY,blankState,validateState,mergeAssignments,setOverlay,spentCoupons,backupName} from '../assets/state.js';
import {flatten,inflate} from '../assets/state-merge.js';

const course=JSON.parse(readFileSync(new URL('../course.json',import.meta.url)));

test('the namespace is ours alone',()=>{
  assert.equal(NS,'bio45-nutrition-');
  assert.equal(STATE_KEY,'bio45-nutrition-state-v1');
  assert.equal(/bio40/.test(STATE_KEY),false,'must not collide on the shared origin');
  assert.equal(backupName('2026-09-25'),'bio45-nutrition-backup-2026-09-25.json');
});

test('a blank state validates and round-trips',()=>{
  const b=blankState();
  assert.deepEqual(validateState(b),b);
  assert.deepEqual(validateState(JSON.parse(JSON.stringify(b))),b);
});

test('validateState refuses junk with a sentence a person can read',()=>{
  for(const [bad,re] of [
      [null,/does not contain saved work/],
      ['nope',/does not contain saved work/],
      [{version:99},/version 99/],
      [{version:1,assignments:{}},/should be a list/],
      [{version:1,coupons:[]},/should be an object/],
      [{version:1,assignments:[{}]},/no id/],
      [{version:1,assignments:[{id:'a'},{id:'a'}]},/Two rows claim/],
      [{version:1,assignments:[{id:'a',status:'sideways'}]},/not a status/],
      [{version:1,assignments:[{id:'a',earned:'lots'}]},/not a number/],
      [{version:1,assignments:[{id:'a',earned:-5}]},/not a number/],
      [{version:1,theme:'neon'},/Unknown appearance/]])
    assert.throws(()=>validateState(bad),re,JSON.stringify(bad));
});

test('a foreign backup is rejected, not silently absorbed',()=>{
  // A 40C-shaped backup can carry version 1 as well. Its fields must not ride in.
  assert.throws(()=>validateState({version:1,rules:[{id:'exams',weight:25}],lecturePrep:{}}),
    /belongs to a different app/);
  assert.throws(()=>validateState({schemaVersion:1,units:[]}),/version/);
  assert.throws(()=>validateState({...blankState(),sourceStudy:{}}),/sourceStudy/);
});

test('every field of our own blank state is accepted',()=>{
  const b=blankState();
  for(const k of Object.keys(b)) assert.doesNotThrow(()=>validateState({...b,[k]:b[k]}),k);
});

test('the overlay folds onto course records without mutating them',()=>{
  const frozen=JSON.stringify(course.assignments);
  let s=blankState();
  s=setOverlay(s,'w01-checkin',{status:'done',earned:23});
  const rows=mergeAssignments(course.assignments,s);
  const row=rows.find(r=>r.id==='w01-checkin');
  assert.equal(row.status,'done'); assert.equal(row.earned,23);
  assert.equal(row.possible,25,'course data still supplies the denominator');
  assert.equal(rows.find(r=>r.id==='w01-discussion').status,'todo');
  assert.equal(rows.find(r=>r.id==='w01-discussion').earned,null,'untouched work is UNGRADED, not zero');
  assert.equal(JSON.stringify(course.assignments),frozen,'course.json untouched');
});

test('an overlay that carries nothing is dropped, so state stays small',()=>{
  let s=blankState();
  s=setOverlay(s,'w01-checkin',{status:'done'});
  assert.equal(s.assignments.length,1);
  s=setOverlay(s,'w01-checkin',{status:'todo'});
  assert.equal(s.assignments.length,0,'back to default means back to absent');
});

test('coupons are a keyed object so two tabs can spend two different ones',()=>{
  const base={...blankState(),coupons:{}};
  const tabA={...base,coupons:{'w02-checkin':{spentOn:'2026-10-05'}}};
  const tabB={...base,coupons:{'w03-application':{spentOn:'2026-10-12'}}};
  const merged=inflate({...flatten(tabA),...flatten(tabB)},blankState());
  assert.deepEqual(Object.keys(merged.coupons).sort(),['w02-checkin','w03-application'],
    'both survive — this is why coupons are not an array');
  assert.equal(spentCoupons(merged).length,2);
});

test('an array collection would NOT have merged per-item — documenting why',()=>{
  const a={...blankState(),attempts:[{id:'q1',correct:true}]};
  const b={...blankState(),attempts:[{id:'q2',correct:false}]};
  const merged=inflate({...flatten(a),...flatten(b)},blankState());
  assert.equal(merged.attempts.length,2,'attempts IS id-keyed by flatten, so it merges');
  const x={...blankState(),diary:{'2026-10-01':{routine:true}}};
  const y={...blankState(),diary:{'2026-10-02':{routine:false}}};
  assert.deepEqual(Object.keys(inflate({...flatten(x),...flatten(y)},blankState()).diary).sort(),
    ['2026-10-01','2026-10-02'],'diary is keyed by date for the same reason');
});

test('state survives a flatten/inflate round trip unchanged',()=>{
  let s=blankState();
  s=setOverlay(s,'w01-checkin',{status:'done',earned:25,note:'went fine'});
  s={...s,coupons:{'w04-application':{spentOn:'2026-10-19',extendedTo:'2026-10-25'}},
       diary:{'2026-10-01':{routine:true,entries:{e1:{food:'oats',portion:'1 cup'}}}},
       theme:'dim',privacyAck:true};
  assert.deepEqual(inflate(flatten(s),blankState()),s);
});
