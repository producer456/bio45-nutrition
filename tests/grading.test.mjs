import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {letterFor,applyDrops,categorySummary,courseGrade,neededFor,isScored} from '../assets/grading.js';

const course = JSON.parse(readFileSync(new URL('../course.json',import.meta.url)));
const SCALE = course.grading.scale;
const cat = id => course.grading.categories.find(c=>c.id===id);
const rows = (id,scores,unit) => scores.map((e,i)=>({id:`${id}-${i}`,category:id,possible:unit,earned:e,graded:true}));

test('letter scale: every boundary and just below it',()=>{
  for(const [pct,want] of [[100,'A'],[94,'A'],[93.99,'A-'],[90,'A-'],[89.99,'B+'],[87,'B+'],
      [86.99,'B'],[83,'B'],[82.99,'B-'],[80,'B-'],[79.99,'C+'],[77,'C+'],
      [76.99,'C'],[70,'C'],[69.99,'D'],[60,'D'],[59.99,'F'],[0,'F']])
    assert.equal(letterFor(pct,SCALE),want,`${pct}% should be ${want}`);
  assert.equal(letterFor(null,SCALE),null);
});

test('her scale has no C-',()=>{
  assert.equal(SCALE.some(b=>b.letter==='C-'),false);
  assert.equal(letterFor(71,SCALE),'C');
  assert.equal(letterFor(76.9,SCALE),'C');
});

test('scale bands descend and cover 0-100 with no gap',()=>{
  for(let i=1;i<SCALE.length;i++) assert.ok(SCALE[i].min<SCALE[i-1].min,'strictly descending');
  assert.equal(SCALE[SCALE.length-1].min,0);
  for(let p=0;p<=100;p+=0.5) assert.ok(letterFor(p,SCALE),`${p}% has a letter`);
});

test('drop removes the dropped row POSSIBLE as well as its earned',()=>{
  const r = rows('discussions',[10,10,0],10);
  const {kept,dropped} = applyDrops(r,1);
  assert.equal(dropped.length,1);
  assert.equal(dropped[0].earned,0);
  assert.equal(kept.reduce((s,x)=>s+x.possible,0),20,'denominator shrank from 30 to 20');
  assert.equal(kept.reduce((s,x)=>s+x.earned,0),20);
});

test('drop never lowers the grade',()=>{
  for(const scores of [[10,9,8],[5,5,5],[10,10,10],[0,0,10],[3,7,10]]){
    const r = rows('d',scores,10);
    const before = scores.reduce((a,b)=>a+b,0)/(scores.length*10);
    const {kept} = applyDrops(r,1);
    const after = kept.reduce((s,x)=>s+x.earned,0)/kept.reduce((s,x)=>s+x.possible,0);
    assert.ok(after>=before-1e-9,`${scores}: ${after} >= ${before}`);
  }
});

test('only SCORED rows are droppable — silence is not a zero',()=>{
  const r=[{id:'a',possible:10,earned:10,graded:true},
           {id:'b',possible:10,earned:null,graded:true},
           {id:'c',possible:10,earned:4,graded:true}];
  const {kept,dropped}=applyDrops(r,1);
  assert.equal(dropped[0].id,'c','dropped the low SCORE, not the ungraded row');
  assert.deepEqual(kept.map(x=>x.id),['a']);
  assert.equal(r.filter(isScored).length,2);
});

test('ties are deterministic',()=>{
  const a=applyDrops(rows('t',[5,5,5],10),1), b=applyDrops(rows('t',[5,5,5],10),1);
  assert.deepEqual(a.dropped.map(x=>x.id),b.dropped.map(x=>x.id));
  assert.equal(a.dropped[0].id,'t-0','lowest id breaks the tie');
});

test('excused rows and 0-point rows never reach the grade',()=>{
  const r=[{id:'a',possible:10,earned:10,graded:true},
           {id:'b',possible:10,earned:0,graded:true,status:'excused'},
           {id:'c',possible:0,earned:0,graded:false}];
  const s=categorySummary(r,{id:undefined,name:'x',drop:null,count:1,budget:10,rawBudget:10});
  assert.equal(s.possible,10); assert.equal(s.earned,10); assert.equal(s.percent,100);
});

test('at full credit each category reproduces HER published subtotal',()=>{
  const c_raw=id=>cat(id).rawBudget;
  for(const [id,n,unit,budget] of [['discussions',11,10,100],['checkins',10,25,225],['application',16,20,300]]){
    const s=categorySummary(rows(id,Array(n).fill(unit),unit),cat(id));
    assert.equal(s.projected.earned,budget,`${id} full credit == ${budget}`);
    assert.equal(s.projected.possible,budget,`${id} denominator == ${budget}`);
    assert.equal(s.earned,c_raw(id),`${id} banked is the pre-drop total`);
    assert.equal(s.dropProvisional,false,'complete category is not provisional');
  }
});

test('a drop before the category is complete is flagged provisional',()=>{
  const s=categorySummary(rows('discussions',[10,8],10),cat('discussions'));
  assert.equal(s.scoredCount,2);
  assert.equal(s.dropProvisional,true,'2 of 11 graded — the drop is a guess');
});

test('CATEGORY ARITHMETIC: count x unit - drop x unit == budget',()=>{
  for(const c of course.grading.categories){
    if(c.variablePoints||c.unitPoints===null) continue;
    assert.equal(c.count*c.unitPoints,c.rawBudget,`${c.id} raw`);
    assert.equal(c.rawBudget-(c.drop?.lowest??0)*c.unitPoints,c.budget,`${c.id} after drop`);
  }
});

test('TOTAL: categories sum to 1360, and the syllabus gap is exactly 5',()=>{
  const sum=course.grading.categories.reduce((s,c)=>s+c.budget,0);
  assert.equal(sum,1360,'this is the number the app grades against');
  assert.equal(course.grading.computedTotal,1360);
  assert.equal(course.grading.declaredTotal,1355);
  assert.equal(course.grading.computedTotal-course.grading.declaredTotal,
               course.grading.discrepancy.points);
  assert.equal(course.grading.discrepancy.points,5);
  assert.equal(course.grading.discrepancy.status,'unresolved');
});

test('courseGrade reports BOTH denominators, never just one',()=>{
  const g=courseGrade(course,rows('discussions',[10,10],10));
  assert.equal(g.earned,20,'banked points are NOT reduced by a mid-quarter drop');
  assert.equal(g.projected.earned,10,'the projection does apply the drop');
  assert.equal(g.percent,100,'current standing is on graded work only');
  assert.equal(g.denominators.computed,1360);
  assert.equal(g.denominators.declared,1355);
  assert.ok(g.floor.computed<g.floor.declared,'1360 is the harsher denominator');
  assert.equal(g.remaining.computed,1340);
  assert.ok(g.provisionalDrops.includes('discussions'));
});

test('neededFor answers in POINTS against both totals',()=>{
  const n=neededFor('A',0,course);
  assert.equal(n.computed.need,1279,'94% of 1360 is 1278.4, so 1279 is the first A');
  assert.equal(n.declared.need,1274,'94% of 1355 is 1273.7, so 1274 is the first A');
  assert.equal(n.computed.need-n.declared.need,5,'the 5-pt gap moves the A cutoff by 5');
  assert.ok(1278/1360*100<94,'1278 really is an A-, not an A');
  assert.ok(1279/1360*100>=94);
  assert.ok(n.computed.reachable);
  assert.equal(neededFor('A',1360,course).computed.need,0);
  assert.equal(neededFor('A',0,course).computed.shareOfRemaining.toFixed(4),(1279/1360).toFixed(4));
});

test('an unreachable target says so instead of pretending',()=>{
  const n=neededFor('A',100,course);
  assert.equal(n.computed.remaining,1260);
  assert.equal(n.computed.reachable,true);
  const doomed=neededFor('A',0,{grading:{...course.grading,computedTotal:100,declaredTotal:100}});
  assert.equal(doomed.computed.need,94);
});
