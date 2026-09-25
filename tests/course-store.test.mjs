import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CourseStore,mergeCourse} from '../assets/course-store.js';
const initial=()=>({version:1,assignments:[],attempts:[],theme:'system'});
function fixture(){let raw=JSON.stringify(initial()),tail=Promise.resolve();const storage={getItem:()=>raw,setItem:(k,v)=>{raw=v;}};const locks={request:(key,fn)=>{const result=tail.then(fn);tail=result.catch(()=>{});return result;}};const client=()=>{let state=initial();const errors=[];const store=new CourseStore({key:'test',initial:state,get:()=>state,set:v=>{state=v;},validate:v=>v,notify:e=>errors.push(e),storage,locks});return {store,errors,get:()=>state,save:next=>{state=next;return store.save(next);}};};return {client,storage,read:()=>JSON.parse(raw)};}
test('simultaneous unrelated tab edits survive under one write lock',async()=>{
 const f=fixture(),a=f.client(),b=f.client();
 await Promise.all([a.save({...a.get(),assignments:[{id:'one',title:'Worksheet'}]}),b.save({...b.get(),theme:'dark'})]);
 assert.equal(f.read().assignments[0].title,'Worksheet');assert.equal(f.read().theme,'dark');
 a.store.receive();assert.equal(a.get().theme,'dark');
});
test('conflicting edits preserve disk and the losing tab’s recoverable local copy',async()=>{
 const f=fixture(),a=f.client(),b=f.client();
 const result=await Promise.allSettled([a.save({...a.get(),theme:'dark'}),b.save({...b.get(),theme:'light'})]);
 assert.equal(result.filter(x=>x.status==='rejected').length,1);assert.equal(f.read().theme,'dark');assert.equal(b.get().theme,'light');
 await b.store.tail;assert.equal(b.errors.length,1);assert.equal(b.store.failed,true);
});
test('queued typing keeps the latest draft and unrelated remote values',async()=>{
 const f=fixture(),a=f.client(),b=f.client();
 await Promise.all([a.save({...a.get(),learningHub:{drafts:{q:'a'}}}),a.save({...a.get(),learningHub:{drafts:{q:'ab'}}}),b.save({...b.get(),theme:'dark'})]);
 assert.equal(f.read().learningHub.drafts.q,'ab');assert.equal(f.read().theme,'dark');
});
test('explicit restore replaces state while routine saves merge; corruption blocks writes',async()=>{
 const f=fixture(),a=f.client();await a.save({...a.get(),theme:'dark'});f.storage.setItem('test','broken');
 await assert.rejects(a.save({...a.get(),theme:'light'}));await a.store.tail;
 await a.store.save(initial(),{replace:true});assert.equal(f.read().theme,'system');
});
test('independent additions under a previously empty object merge',()=>{
 const b={...initial(),learningHub:{}};const a={...b,learningHub:{drafts:{q:'Answer'}}};const r={...b,learningHub:{work:{one:{note:'Task'}}}};
 assert.deepEqual(mergeCourse(b,a,r).learningHub,{work:{one:{note:'Task'}},drafts:{q:'Answer'}});
});
