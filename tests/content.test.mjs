import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync,existsSync} from 'node:fs';
import {join,relative} from 'node:path';

const ROOT=new URL('..',import.meta.url).pathname;
const course=JSON.parse(readFileSync(join(ROOT,'course.json')));

function walk(dir,out=[]){
  for(const e of readdirSync(dir)){
    if(['.git','node_modules','_seed'].includes(e)) continue;
    const p=join(dir,e);
    (statSync(p).isDirectory()?walk(p,out):out.push(p));
  }
  return out;
}
const FILES=walk(ROOT).filter(f=>/\.(js|mjs|json|html|css|md)$/.test(f));

// Two tiers, because they fail differently.
//
// CRITICAL things — storage keys, remote hosts, native bridges — are dangerous even
// inside a comment, because a comment is where someone finds a key to paste back in.
// producer456.github.io is a SHARED origin: the 40C companion, the 40C runway and
// four BIOL 40B sites all share its localStorage, and a stray key here would read
// and overwrite a real course's saved work.
const CRITICAL=/bio40[abc][a-z0-9-]*|39756|instructure\.com|tailb97|\.ts\.net|companionService|webkit\.messageHandlers|docketID/i;

// COURSE-CONTENT things are a different failure: stale 40C material masquerading as
// nutrition material. Naming the fork source in a provenance comment is good
// practice, so those are allowed in comments and banned everywhere else.
const CONTENT=/Bio 40|BIOL F040C|\b40C\b|Woods|Schinske/i;

const stripComments=text=>text
  .replace(/\/\*[\s\S]*?\*\//g,'')
  .split('\n').map(l=>l.replace(/(^|\s)\/\/.*$/,'')).join('\n');

test('NO 40C CONTAMINATION: keys, remotes and native bridges, comments included',()=>{
  const hits=[];
  for(const f of FILES){
    const rel=relative(ROOT,f);
    if(rel.startsWith('tests/')) continue;
    for(const line of readFileSync(f,'utf8').split('\n')){
      const m=line.match(CRITICAL);
      if(m) hits.push(`${rel}: ${m[0]} -> ${line.trim().slice(0,90)}`);
    }
  }
  assert.deepEqual(hits,[],'a 40C storage key, remote or native hook must never survive');
});

test('NO 40C CONTENT outside provenance comments',()=>{
  const hits=[];
  for(const f of FILES){
    const rel=relative(ROOT,f);
    if(rel.startsWith('tests/')) continue;
    const code=/\.(js|mjs|css)$/.test(f)?stripComments(readFileSync(f,'utf8')):readFileSync(f,'utf8');
    for(const line of code.split('\n')){
      const m=line.match(CONTENT);
      if(m) hits.push(`${rel}: ${m[0]} -> ${line.trim().slice(0,90)}`);
    }
  }
  assert.deepEqual(hits,[],'40C course material must not survive the fork');
});

test('neither guard is vacuous',()=>{
  assert.ok(FILES.length>=10,`scanned ${FILES.length} files`);
  assert.ok(CRITICAL.test('bio40c-state-v1'),'critical pattern works');
  assert.ok(CRITICAL.test('// see bio40c-state-v1'),'and it fires inside a comment');
  assert.ok(CONTENT.test('BIOL F040C section 02'),'content pattern works');
  assert.equal(CONTENT.test(stripComments('// the Bio 40C Companion')),false,
    'but a provenance comment is allowed');
  assert.ok(stripComments('const x=1; // Bio 40C').includes('const x=1'),
    'stripComments keeps the code');
});

test('no remote origins: nothing is fetched from another host',()=>{
  for(const f of FILES.filter(f=>/\.(js|mjs|html|css)$/.test(f))){
    const rel=relative(ROOT,f);
    if(rel.startsWith('tests/')) continue;
    const text=readFileSync(f,'utf8');
    const urls=[...text.matchAll(/https?:\/\/[^\s'"()]+/g)].map(m=>m[0])
      .filter(u=>!/^https?:\/\/(creativecommons\.org|www\.w3\.org)/.test(u));
    assert.deepEqual(urls,[],`${rel} must not reference a remote origin`);
  }
});

test('WEEK CALENDAR is contiguous and every topic week ends Sunday',()=>{
  const topic=course.weeks.filter(w=>w.n<=11);
  assert.equal(topic.length,11);
  assert.equal(topic[0].start,course.term.termStart);
  for(let i=0;i<topic.length;i++){
    const w=topic[i];
    assert.equal(w.n,i+1,'week numbers are dense');
    const s=new Date(w.start+'T12:00:00Z'),e=new Date(w.end+'T12:00:00Z');
    assert.equal((e-s)/86400000,6,`week ${w.n} spans 7 days`);
    assert.equal(e.getUTCDay(),0,`week ${w.n} ends Sunday`);
    if(i) assert.equal((s-new Date(topic[i-1].end+'T12:00:00Z'))/86400000,1,
      `week ${w.n} starts the day after week ${w.n-1} ends`);
  }
  assert.equal(topic[10].end,'2026-12-06');
  assert.ok(course.weeks.at(-1).end<=course.term.termEnd);
});

test('REFERENTIAL INTEGRITY: every assignment resolves',()=>{
  const weeks=new Set(course.weeks.map(w=>w.n));
  const cats=new Set(course.grading.categories.map(c=>c.id));
  const ids=new Set();
  for(const a of course.assignments){
    assert.ok(!ids.has(a.id),`duplicate assignment id ${a.id}`); ids.add(a.id);
    assert.ok(weeks.has(a.week),`${a.id} -> unknown week ${a.week}`);
    if(a.category!==null) assert.ok(cats.has(a.category),`${a.id} -> unknown category ${a.category}`);
    assert.ok(a.title,`${a.id} needs a title`);
    if(a.due) assert.ok(a.due>=course.term.termStart&&a.due<=course.term.termEnd,
      `${a.id} due ${a.due} outside the term`);
  }
});

test('every reading points at a book in the reading map',()=>{
  const books=new Set(Object.keys(course.readingMap));
  for(const w of course.weeks){
    for(const r of [...w.readings,...w.supplements])
      assert.ok(books.has(r.book),`week ${w.n} -> unknown book ${r.book}`);
    for(const r of w.readings) assert.ok(r.file&&r.title,`week ${w.n} reading needs file+title`);
  }
});

test('PROJECTED WORK IS ALWAYS MARKED — a guess never looks like her schedule',()=>{
  for(const a of course.assignments){
    if(a.projected) assert.equal(a.dueConfidence,'inferred',`${a.id} projected but not inferred`);
    if(a.dueConfidence==='inferred') assert.equal(a.projected,true,`${a.id} inferred but not projected`);
  }
  assert.ok(course.assignments.some(a=>a.projected),'there ARE projections to mark');
  assert.ok(course.assignments.filter(a=>a.week===1).every(a=>!a.projected),'week 1 is all real');
});

test('THE KNOWN UNKNOWNS ship as unknowns, not as guesses',()=>{
  const u=course.grading.unplaced;
  const byCat=Object.fromEntries(u.map(x=>[x.category,x]));
  assert.ok(byCat.application,'4 application assignments have no week');
  assert.equal(byCat.application.count,4);
  assert.ok(byCat.reflections,'the 6th reflection has no week');
  assert.equal(byCat.reflections.count,1);
  assert.ok(byCat.videoquiz,'video quizzes are never enumerated');
  assert.equal(byCat.videoquiz.count,null);
  for(const x of u){ assert.ok(x.note&&x.note.length>40,'each says WHY'); assert.ok(x.clarificationKey); }
});

test('placed + unplaced points reconcile to each category budget',()=>{
  const placed={};
  for(const a of course.assignments){
    if(a.graded===false||a.category===null) continue;
    placed[a.category]=(placed[a.category]??0)+a.possible;
  }
  const unplaced=Object.fromEntries(course.grading.unplaced.map(u=>[u.category,u.points]));
  for(const c of course.grading.categories){
    const total=(placed[c.id]??0)+(unplaced[c.id]??0);
    assert.equal(total,c.rawBudget,
      `${c.id}: placed ${placed[c.id]??0} + unplaced ${unplaced[c.id]??0} should equal raw ${c.rawBudget}`);
  }
});

test('scaffolded weeks are honestly labelled',()=>{
  for(const w of course.weeks) assert.ok(['authored','scaffold'].includes(w.depth),`week ${w.n}`);
  assert.deepEqual(course.weeks.filter(w=>w.depth==='authored').map(w=>w.n),[1,2,3]);
});

test('Thanksgiving is recorded as a risk to Week 10, not silently adjusted',()=>{
  const t=course.term.notableDates.find(d=>d.date==='2026-11-26');
  assert.ok(t,'2026-11-26 is noted');
  assert.match(t.what,/Thanksgiving/);
  assert.match(t.what,/Week 10/);
  const w10=course.weeks.find(w=>w.n===10);
  assert.ok('2026-11-26'>=w10.start&&'2026-11-26'<=w10.end,'it really is inside week 10');
});

test('the course carries its licence and permission posture',()=>{
  for(const b of Object.values(course.readingMap)) assert.match(b.license,/CC BY-NC-SA/);
  assert.match(course.policyStatus,/Unofficial/i);
  assert.ok(course.term.source&&course.term.sourceDate);
});

test('no inline style attributes: the CSP drops them silently',()=>{
  // style-src 'self' means a style="" attribute is parsed into the DOM and never
  // applied. That failed silently once already — a 0% progress bar rendered full.
  const hits=[];
  for(const f of FILES.filter(f=>/\.(js|mjs|html)$/.test(f))){
    const rel=relative(ROOT,f);
    if(rel.startsWith('tests/')) continue;
    const src=/\.(js|mjs)$/.test(f)?stripComments(readFileSync(f,'utf8')):readFileSync(f,'utf8');
    for(const line of src.split('\n'))
      if(/\bstyle="/.test(line)) hits.push(`${rel}: ${line.trim().slice(0,80)}`);
  }
  assert.deepEqual(hits,[],'set styles through element.style instead, which CSP allows');
});

test('the CSP itself is present and strict',()=>{
  const html=readFileSync(join(ROOT,'index.html'),'utf8');
  const csp=html.match(/Content-Security-Policy"[^>]*content="([^"]+)"/)?.[1];
  assert.ok(csp,'index.html must carry a CSP');
  for(const d of ["default-src 'self'","style-src 'self'","script-src 'self'","object-src 'none'"])
    assert.ok(csp.includes(d),`CSP must include ${d}`);
  assert.equal(/unsafe-inline|unsafe-eval/.test(csp),false,'no unsafe escapes');
  assert.match(html,/name="referrer" content="no-referrer"/);
});

test('SERVICE WORKER: scope confined, and it deletes only its own caches',()=>{
  const sw=readFileSync(join(ROOT,'sw.js'),'utf8');
  assert.match(sw,/url\.origin !== self\.location\.origin/,'must bail on cross-origin');
  assert.match(sw,/url\.pathname\.indexOf\(BASE\) !== 0/,'must bail outside its own directory');
  assert.match(sw,/startsWith\('b45-'\)/,"must delete only caches prefixed b45-");
  assert.match(sw,/request\.method !== 'GET'/,'must ignore non-GET');
  assert.match(sw,/mode === 'navigate'/,'navigations must be handled separately');
  const app=readFileSync(join(ROOT,'assets/course-app.js'),'utf8');
  assert.match(app,/register\('sw\.js', \{ scope: '\.\/' \}\)/,'explicit relative scope');
  assert.match(app,/\.catch\(\(\) => \{\}\)/,'registration failure must not block the app');
  assert.equal(/location\.protocol === 'https/.test(app),false,'not https-gated, so localhost works');
});

test('PRECACHE MATCHES index.html BOTH WAYS',()=>{
  // Drift in either direction serves a stale file offline, which is the exact
  // failure the ?v= convention exists to prevent.
  const html=readFileSync(join(ROOT,'index.html'),'utf8');
  const sw=readFileSync(join(ROOT,'sw.js'),'utf8');
  const versioned=[...html.matchAll(/(?:src|href)="\.\/((?:assets\/)?[\w.-]+\.(?:css|js))\?v=(\d+)"/g)]
    .map(m=>({path:m[1],v:m[2]}));
  assert.ok(versioned.length>=8,`only ${versioned.length} versioned assets found`);
  for(const a of versioned){
    assert.ok(existsSync(join(ROOT,a.path)),`${a.path} referenced but missing on disk`);
    assert.ok(sw.includes(`'./${a.path}?v=${a.v}'`),
      `sw.js SHELL is missing ./${a.path}?v=${a.v}`);
  }
  const shell=sw.slice(sw.indexOf('const SHELL'),sw.indexOf('];',sw.indexOf('const SHELL')));
  for(const m of shell.matchAll(/'\.\/((?:assets\/)?[\w.-]+\.(?:css|js))\?v=(\d+)'/g))
    assert.ok(html.includes(`"./${m[1]}?v=${m[2]}"`),
      `sw.js precaches ./${m[1]}?v=${m[2]} but index.html does not reference it`);
});

test('every unversioned file sw.js precaches exists',()=>{
  const sw=readFileSync(join(ROOT,'sw.js'),'utf8');
  const shell=sw.slice(sw.indexOf('const SHELL'),sw.indexOf('];',sw.indexOf('const SHELL')));
  for(const m of shell.matchAll(/'\.\/([\w./-]+\.(?:js|json|svg|html))'/g))
    assert.ok(existsSync(join(ROOT,m[1])),`sw.js precaches ${m[1]} which does not exist`);
});
