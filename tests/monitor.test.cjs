const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {setTimeout:delay}=require('node:timers/promises');
const {Library,idFor}=require('../electron/library.cjs');
const {createProjectMonitor,findMissingProjects}=require('../electron/monitor.cjs');
const work=path.resolve(__dirname,'../../../work');
async function fixture(){return fs.mkdtemp(path.join(work,'monitor-'));}
async function write(root,file,text='preview'){await fs.mkdir(path.dirname(path.join(root,file)),{recursive:true});await fs.writeFile(path.join(root,file),text);}
async function until(fn){const end=Date.now()+6000;while(Date.now()<end){if(fn())return;await delay(50);}assert.ok(fn(),'Timed out waiting for filesystem discovery');}

test('显示标题重扫和重启后保留，可恢复原始名称且不改磁盘目录',async()=>{
  const root=await fixture(),file=path.join(root,'library.sqlite'),p={id:idFor(root),path:root,name:'source',agents:[]};
  let db=new Library(file);db.upsert([p]);db.edit(p.id,{title:'我的灵感项目'});assert.equal(db.one(p.id).name,'我的灵感项目');assert.equal(db.one(p.id).originalName,'source');
  db.upsert([{...db.one(p.id),sourceSummary:{files:1}}]);db.upsert([{...p,name:'package-new-name'}]);db.close();db=new Library(file);
  assert.equal(db.one(p.id).name,'我的灵感项目');assert.equal(db.one(p.id).originalName,'package-new-name');assert.equal(db.one(p.id).path,root);
  db.edit(p.id,{title:''});assert.equal(db.one(p.id).name,'package-new-name');assert.equal((await fs.stat(root)).isDirectory(),true);db.close();
});

test('真实递归监听：延迟写入自动收录、跳过构建、同步新增停用和移除路径', {skip:process.platform!=='win32',timeout:12000},async t=>{
  const root=await fixture(),first=path.join(root,'first'),second=path.join(root,'second');await fs.mkdir(first);await fs.mkdir(second);
  let roots=[{path:first,enabled:true},{path:second,enabled:false}];const projects=new Map(),errors=[];
  const monitor=createProjectMonitor({getRoots:()=>roots,getProjects:()=>[...projects.values()],onProjects:ps=>{for(const p of ps)projects.set(p.id,p);},onMissing:ps=>{for(const p of ps)projects.delete(p.id);},onError:e=>errors.push(e.message),debounceMs:60,retryMs:10000});t.after(()=>monitor.close());monitor.refresh();
  await fs.mkdir(path.join(first,'new-chat/outputs/new-app'),{recursive:true});await delay(180);assert.equal(projects.size,0);
  await write(first,'new-chat/outputs/new-app/package.json',JSON.stringify({name:'new-project',dependencies:{react:'19'}}));await until(()=>[...projects.values()].some(p=>p.name==='new-project'));
  await write(first,'new-chat/outputs/new-app/src/nested/index.html');await write(first,'node_modules/dependency/index.html');await write(first,'release-0.1.0/generated/index.html');await write(first,'work/scratch/index.html');await write(second,'existing/index.html');await delay(250);assert.equal(projects.size,1);
  roots=[{path:first,enabled:true},{path:second,enabled:true}];monitor.refresh();await until(()=>projects.size===2);
  roots=[{path:first,enabled:false},{path:second,enabled:true}];monitor.refresh();await write(first,'disabled/index.html');await delay(250);assert.equal(projects.size,2);
  roots=[{path:second,enabled:true}];monitor.refresh();await write(first,'removed/index.html');await write(second,'newer/index.html');await until(()=>projects.size===3);await delay(150);assert.equal(projects.size,3);
  monitor.close();await write(second,'after-close/index.html');await delay(150);assert.equal(projects.size,3);assert.deepEqual(errors,[]);
});

test('旧索引、后台移动和删除仅保留仍存在的项目', {skip:process.platform!=='win32',timeout:15000},async t=>{
  const base=await fixture(),root=path.join(base,'projects'),oldPath=path.join(root,'group','app');
  await write(root,'group/app/index.html');
  const db=new Library(path.join(base,'library.sqlite'));
  const gonePath=path.join(base,'offline-project'),goneId=idFor(gonePath);
  db.upsert([{id:goneId,path:gonePath,name:'offline',exists:true}]);
  db.edit(goneId,{favorite:true,note:'保留笔记'});
  db.markMissing(await findMissingProjects(db.present()));
  assert.deepEqual(db.present(),[]);
  assert.equal(db.one(goneId).note,'保留笔记');
  const monitor=createProjectMonitor({getRoots:()=>[{path:root}],getProjects:()=>db.all(),
    onProjects:ps=>db.upsert(ps),onMissing:ps=>db.markMissing(ps),debounceMs:50});
  t.after(()=>{monitor.close();db.close();});
  monitor.refresh();
  await until(()=>db.present().some(p=>p.id===idFor(oldPath)));
  await fs.rename(path.join(root,'group'),path.join(root,'moved'));
  const moved=path.join(root,'moved','app');
  await until(()=>db.present().length===1&&db.present()[0].id===idFor(moved));
  await fs.unlink(path.join(moved,'index.html'));
  await fs.rmdir(moved);
  await until(()=>db.present().length===0);
});
