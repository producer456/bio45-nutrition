// State-merge primitives, extracted verbatim from the Bio 40C Companion's
// course-connection.js (assets/state-merge.js there did not exist; the sync
// client that wrapped these is deliberately not carried over).
// Used by course-store.js for three-way merge. No course content here.

export const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function flatten(state) {
  const result={};
  function visit(value,path) {
    if(value && typeof value==='object' && !Array.isArray(value) && Object.keys(value).length) {
      for(const [key,row] of Object.entries(value)) {if(['__proto__','constructor','prototype'].includes(key))throw Error('Invalid state key');visit(row,[...path,key]);}
    } else result[JSON.stringify(path)]=value;
  }
  for(const [key,value] of Object.entries(state)) {
    if(['assignments','attempts'].includes(key)) {for(const row of value)visit(row,[key,row.id]);}
    else visit(value,[key]);
  }
  return result;
}
export function inflate(fields,template) {
  const state={};
  // Parents precede children so an old empty object cannot erase new descendants.
  for(const [path,value] of Object.entries(fields).sort(([a],[b])=>JSON.parse(a).length-JSON.parse(b).length)) {
    if(value?.$deleted===true)continue;
    const parts=JSON.parse(path);let target=state;
    if(parts.some(p=>['__proto__','constructor','prototype'].includes(p)))throw Error('Invalid sync path');
    parts.forEach((key,i)=>{if(i===parts.length-1)target[key]=structuredClone(value);else target=target[key]??={};});
  }
  for(const key of ['assignments','attempts'])state[key]=Object.values(state[key]??{});
  return {...template,...state};
}
