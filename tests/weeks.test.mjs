import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';

const ROOT=new URL('..',import.meta.url).pathname;
const course=JSON.parse(readFileSync(join(ROOT,'course.json')));
const authored=course.weeks.filter(w=>w.depth==='authored');
const load=w=>JSON.parse(readFileSync(join(ROOT,w.contentFile)));

test('every authored week has its content file, and it agrees about which week it is',()=>{
  assert.ok(authored.length>0);
  for(const w of authored){
    assert.ok(existsSync(join(ROOT,w.contentFile)),`${w.contentFile} missing`);
    assert.equal(load(w).week,w.n,`${w.contentFile} says week ${load(w).week}`);
  }
});

test('a scaffolded week may be empty, but must not pretend to be written',()=>{
  for(const w of course.weeks.filter(x=>x.depth==='scaffold')){
    if(!existsSync(join(ROOT,w.contentFile))) continue;
    const d=load(w);
    if(d.questions?.length)
      assert.fail(`week ${w.n} is marked scaffold but ships ${d.questions.length} questions — ` +
                  `mark it authored so the quality rules apply to it`);
  }
});

test('question ids are unique across every week',()=>{
  const seen=new Set();
  for(const w of authored) for(const q of load(w).questions){
    assert.ok(!seen.has(q.id),`duplicate question id ${q.id}`);
    seen.add(q.id);
  }
  assert.ok(seen.size>=30,`only ${seen.size} questions authored`);
});

test('every question is well formed and cites a real book',()=>{
  const books=new Set(Object.keys(course.readingMap));
  for(const w of authored){
    const d=load(w);
    const objectives=new Set(d.objectives.map(o=>o.id));
    for(const q of d.questions){
      assert.equal(q.type,'mc',`${q.id}`);
      assert.equal(q.options.length,4,`${q.id} needs exactly 4 options`);
      assert.equal(new Set(q.options.map(o=>o.toLowerCase())).size,4,`${q.id} has duplicate options`);
      assert.ok(q.answer>=0&&q.answer<4,`${q.id} answer out of range`);
      assert.ok(q.why&&q.why.length>15,`${q.id} needs a real explanation`);
      assert.ok(objectives.has(q.objective),`${q.id} -> unknown objective ${q.objective}`);
      assert.ok(books.has(q.source?.book),`${q.id} -> unknown book`);
      assert.ok(q.source.section,`${q.id} needs a section`);
      assert.match(q.source.license,/CC BY-NC-SA/,`${q.id} must carry its licence`);
    }
  }
});

test('every wrong option says why it is wrong, and the right one says nothing',()=>{
  for(const w of authored) for(const q of load(w).questions){
    assert.equal(q.distractorNotes.length,4,`${q.id}`);
    assert.equal(q.distractorNotes[q.answer],null,`${q.id}: the correct option must have a null note`);
    for(let i=0;i<4;i++) if(i!==q.answer)
      assert.ok(q.distractorNotes[i]?.length>10,`${q.id} option ${i} needs a reason`);
  }
});

test('ANTI-LONGEST-ANSWER: the quiz cannot be passed by picking the longest option',()=>{
  // Chance alone puts the correct answer longest about 25% of the time. A tie gives
  // no signal, so only a uniquely-longest correct answer counts as a tell.
  const all=[];
  for(const w of authored) all.push(...load(w).questions);
  const tells=all.filter(q=>{
    const L=q.options.map(o=>o.length), max=Math.max(...L);
    return L.filter(x=>x===max).length===1 && L[q.answer]===max;
  });
  const share=tells.length/all.length;
  assert.ok(share<=0.30,
    `${tells.length}/${all.length} = ${(share*100).toFixed(0)}% of correct answers are the ` +
    `uniquely longest option (cap 30%): ${tells.map(q=>q.id).join(', ')}`);
});

test('objectives and terms are cited, and objectives are actually used',()=>{
  for(const w of authored){
    const d=load(w);
    assert.ok(d.objectives.length>=3,`week ${w.n} needs objectives`);
    assert.ok(d.terms.length>=4,`week ${w.n} needs terms`);
    const used=new Set(d.questions.map(q=>q.objective));
    for(const o of d.objectives){
      assert.ok(o.text?.length>20,`${o.id} needs a real objective`);
      assert.ok(o.source?.section,`${o.id} needs a citation`);
      assert.ok(used.has(o.id),`${o.id} is declared but no question tests it`);
    }
    for(const t of d.terms){
      assert.ok(t.gloss?.length>20,`${t.term} needs a real gloss`);
      assert.ok(t.source?.section,`${t.term} needs a citation`);
    }
  }
});

test('AI POLICY: application prompts ask questions, they do not answer them',()=>{
  const BANS=/\b(draft|write|compose|generate)\s+(your|my|a|the)\s+(post|response|reflection|answer|essay|submission)/i;
  for(const w of authored) for(const a of load(w).applicationPrompts??[]){
    assert.ok(a.checklist?.length,`${a.id} needs a checklist`);
    assert.ok(a.selfCheck?.length,`${a.id} needs self-check questions`);
    assert.ok(a.aiPolicy,`${a.id} must carry the policy line`);
    assert.match(a.aiPolicy,/does not write any part of a submission/i);
    for(const line of [...a.checklist,...a.selfCheck])
      assert.equal(BANS.test(line),false,`${a.id}: "${line}" reads like it drafts work for you`);
  }
});

test('no shipped text copies a long run from the source book',()=>{
  // The seed is an authoring scaffold, not a quarry. If a shipped string reproduces
  // a long verbatim run from the textbook, that is redistribution, not adaptation.
  const seedPath=join(ROOT,'content/_seed/manifest.json');
  if(!existsSync(seedPath)) return;  // seed is gitignored; skip when absent
  const bank=[];
  for(let ch=1;ch<=15;ch++){
    const p=join(ROOT,`content/_seed/chapter-${String(ch).padStart(2,'0')}.json`);
    if(!existsSync(p)) continue;
    for(const s of JSON.parse(readFileSync(p)).sections)
      bank.push(...s.objectives,...s.takeaways,...s.exercises);
  }
  const norm=s=>s.toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
  const grams=new Set();
  for(const t of bank){
    const w=norm(t).split(' ');
    for(let i=0;i+12<=w.length;i++) grams.add(w.slice(i,i+12).join(' '));
  }
  const hits=[];
  for(const w of authored){
    const d=load(w);
    const strings=[...d.objectives.map(o=>o.text),...d.terms.map(t=>t.gloss),
                   ...d.questions.flatMap(q=>[q.prompt,q.why,...q.options])];
    for(const s of strings){
      const words=norm(s).split(' ');
      for(let i=0;i+12<=words.length;i++)
        if(grams.has(words.slice(i,i+12).join(' '))) hits.push(s.slice(0,70));
    }
  }
  assert.deepEqual([...new Set(hits)],[],'shipped text reproduces 12+ consecutive words from the source');
});
