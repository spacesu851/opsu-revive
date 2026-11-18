const fs=require('node:fs');
const fsp=require('node:fs/promises');
const path=require('node:path');
const {scan,inspect,skipped}=require('./scanner.cjs');
const {key}=require('./library.cjs');
const within=(root,file)=>key(file)===key(root)||key(file).startsWith(key(root)+'/');

function createProjectMonitor({getRoots,getProjects,getMaxDepth=()=>6,onProjects,onError=()=>{},debounceMs=900,retryMs=30000}){
  const watchers=new Map(),pending=new Map(),full=new Map(),controller=new AbortController();
  let timer=null,closed=false,busy=false;
  const roots=()=>[...new Map(getRoots().filter(r=>r.enabled!==false&&typeof r.path==='string').map(r=>[key(r.path),path.resolve(r.path)])).values()];
  const maxDepth=()=>Math.min(10,Math.max(1,Number(getMaxDepth())||6));
  async function realInside(root,dir){try{return within(await fsp.realpath(root),await fsp.realpath(dir));}catch{return false;}}
  function schedule(){if(closed)return;clearTimeout(timer);timer=setTimeout(()=>void flush(),debounceMs);timer.unref?.();}
  function changed(root,filename){
    if(closed)return;
    if(!filename){full.set(key(root),root);schedule();return;}
    const relative=String(filename),parts=relative.split(/[\\/]+/).filter(Boolean);
    if(parts.some((part,i)=>(skipped(part)||part.startsWith('.'))&&!(part==='.git'&&i===parts.length-1)))return;
    const file=path.resolve(root,relative);if(!within(root,file))return;
    if(pending.size>300){full.set(key(root),root);pending.clear();}else pending.set(key(file),{root,file});
    schedule();
  }
  async function collect(root,dir){
    if(closed||!within(root,dir)||!await realInside(root,dir))return;
    const depth=path.relative(root,dir).split(path.sep).filter(Boolean).length;
    if(depth>maxDepth())return;
    const result=await scan([dir],{maxDepth:Math.max(0,maxDepth()-depth),signal:controller.signal});
    if(!closed&&result.projects.length)await onProjects(result.projects);
  }
  async function processChange({root,file}){
    if(closed)return;
    const projects=getProjects();
    const missing=projects.filter(p=>p.exists!==false&&within(file,p.path)&&!fs.existsSync(p.path));
    if(missing.length)await onProjects(missing.map(p=>({...p,exists:false})));
    const owner=projects.filter(p=>within(p.path,file)&&within(root,p.path)).sort((a,b)=>a.path.length-b.path.length)[0];
    if(owner){if(await realInside(root,owner.path)){const result=await scan([owner.path],{maxDepth:0,signal:controller.signal});if(!closed&&result.projects.length)await onProjects(result.projects);}return;}
    let info;try{info=await fsp.stat(file);}catch{}
    const directory=info?.isDirectory()?file:path.dirname(file);
    // A new marker may be written after the folder itself; check its ancestors too.
    let candidate=directory;
    while(within(root,candidate)&&!closed){
      if(fs.existsSync(candidate)&&!await realInside(root,candidate))return;
      const depth=path.relative(root,candidate).split(path.sep).filter(Boolean).length;
      if(depth<=maxDepth())try{const entries=await fsp.readdir(candidate,{withFileTypes:true});const found=await inspect(candidate,entries,root);if(found){await onProjects([found]);return;}}catch{}
      if(key(candidate)===key(root))break;
      candidate=path.dirname(candidate);
    }
    if(key(directory)!==key(root)&&fs.existsSync(directory))await collect(root,directory);
  }
  async function flush(){
    if(closed||busy){if(!closed)schedule();return;}
    busy=true;const active=new Set(roots().map(key)),rescan=[...full.values()].filter(r=>active.has(key(r))),changes=[...pending.values()].filter(c=>active.has(key(c.root)));
    full.clear();pending.clear();
    try{
      for(const root of rescan){if(closed)break;await collect(root,root);}
      const visited=new Set();
      for(const change of changes){
        if(closed)break;
        if(rescan.some(r=>within(r,change.file)))continue;
        const owner=getProjects().filter(p=>within(p.path,change.file)).sort((a,b)=>a.path.length-b.path.length)[0];
        const identity=key(owner?.path||change.file);if(visited.has(identity))continue;visited.add(identity);
        await processChange(change);
      }
    }catch(error){if(!closed)onError(error);}finally{busy=false;if(!closed&&(pending.size||full.size))schedule();}
  }
  function refresh({rescan=false}={}){
    if(closed)return;
    const active=roots(),desired=new Set(active.map(key));
    for(const [id,watcher]of watchers)if(!desired.has(id)){watcher.close();watchers.delete(id);full.delete(id);}
    for(const root of active){
      const id=key(root);if(rescan)full.set(id,root);if(watchers.has(id))continue;
      try{
        const watcher=fs.watch(root,{recursive:true,persistent:false},(_event,file)=>changed(root,file));
        watchers.set(id,watcher);full.set(id,root);
        watcher.on('error',error=>{watcher.close();watchers.delete(id);if(!closed){full.set(id,root);schedule();onError(error);}});
      }catch(error){full.set(id,root);onError(error);}
    }
    if(full.size)schedule();
  }
  const retry=setInterval(()=>refresh(),retryMs);retry.unref?.();
  return {refresh,paths:()=>roots().filter(root=>watchers.has(key(root))),close(){closed=true;controller.abort();clearTimeout(timer);clearInterval(retry);for(const watcher of watchers.values())watcher.close();watchers.clear();pending.clear();full.clear();}};
}
module.exports={createProjectMonitor};
