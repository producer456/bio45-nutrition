import {flatten,inflate} from './state-merge.js';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const missing=Symbol('missing');
const at=(fields,path)=>Object.hasOwn(fields,path)?fields[path]:missing;
const ancestor=(a,b)=>{const x=JSON.parse(a),y=JSON.parse(b);return x.length<y.length&&x.every((v,i)=>v===y[i]);};
// Replacing an empty object with its children is expansion, not deletion.
const expanded=(path,before,after)=>at(before,path)!==missing&&at(after,path)===missing&&Object.keys(after).some(k=>ancestor(path,k));
export function mergeCourse(base,local,remote) {
  const before=flatten(base),ours=flatten(local),theirs=flatten(remote),merged={...theirs};
  const changed=[...new Set([...Object.keys(before),...Object.keys(ours)])].filter(k=>!same(at(before,k),at(ours,k)));
  const remoteChanged=[...new Set([...Object.keys(before),...Object.keys(theirs)])].filter(k=>!same(at(before,k),at(theirs,k)));
  for(const path of changed){
    if(remoteChanged.includes(path)&&!same(at(ours,path),at(theirs,path)))throw Error('This field changed in another tab. Your edits remain here. Export a backup before reloading to review the other tab’s changes.');
    // Do not silently resurrect a record deleted by another tab (or erase its edits).
    for(const other of remoteChanged)if((ancestor(path,other)||ancestor(other,path))&&!expanded(path,before,ours)&&!expanded(other,before,theirs))throw Error('This record changed in another tab. Export your edits before reloading.');
    if(at(ours,path)===missing)delete merged[path];else merged[path]=ours[path];
  }
  return inflate(merged,{});
}
export class CourseStore {
  constructor({key,initial,get,set,validate,notify,storage=localStorage,locks=navigator.locks}) {
    Object.assign(this,{key,get,set,validate,notify,storage,locks});
    this.base=structuredClone(initial);this.intent=structuredClone(initial);this.pending=0;this.failed=false;this.tail=Promise.resolve();
  }
  read(){const raw=this.storage.getItem(this.key);return raw===null?structuredClone(this.base):this.validate(JSON.parse(raw));}
  save(next,{replace=false}={}) {
    const base=structuredClone(this.intent),requested=structuredClone(next);
    this.intent=structuredClone(next);this.pending++;
    const task=this.tail.then(async()=>{
      if(this.failed&&!replace)throw Error('Saving is paused after a conflict or storage error. Export a backup before reloading, or restore a reviewed backup.');
      const write=()=>{
        const merged=replace?requested:mergeCourse(base,requested,this.read());
        this.validate(merged);
        const current=mergeCourse(requested,this.get(),merged);
        const intent=mergeCourse(requested,this.intent,merged);
        this.validate(current);
        this.storage.setItem(this.key,JSON.stringify(merged));
        this.base=structuredClone(merged);this.intent=intent;this.set(current);this.failed=false;
      };
      // Serialize read/merge/write across tabs, including simultaneous clicks.
      if(!this.locks)throw Error('This browser cannot safely coordinate saves across tabs. Export a backup and use a current browser.');
      await this.locks.request(this.key,write);
    });
    const result=task.catch(error=>{this.failed=true;this.notify(error);throw error;}).finally(()=>{this.pending--;});
    this.tail=result.catch(()=>{});
    return result;
  }
  receive(){
    if(this.pending||this.failed)return;
    try{const remote=this.read();const current=this.validate(mergeCourse(this.base,this.get(),remote));this.base=structuredClone(remote);this.intent=structuredClone(current);this.set(current);}
    catch(error){this.failed=true;this.notify(error);}
  }
}
