const {app,BrowserWindow,ipcMain,dialog,shell,clipboard,Menu,Tray,nativeTheme,session,protocol,net,nativeImage}=require('electron');
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {pathToFileURL}=require('node:url');
const {execFile,spawn}=require('node:child_process');
const {promisify}=require('node:util');
const run=promisify(execFile);
const {Library,key}=require('./library.cjs');
const {scan,sourceSize}=require('./scanner.cjs');
const {indexSessions,contextFor}=require('./contexts.cjs');
const {previewPlan,staticServer,startDev}=require('./preview.cjs');
const {previewHub}=require('./preview-hub.cjs');
const {createProjectMonitor,directoryMissing,findMissingProjects}=require('./monitor.cjs');
// Keep the existing profile across the product rename, including the single-instance lock.
const profilePath=(!app.isPackaged&&process.env.REVIVE_TEST_DATA)||path.join(app.getPath('appData'),'续作');
app.setPath('userData',profilePath);
app.setName('伏笔');app.setAppUserModelId('cc.opsu.revive');
protocol.registerSchemesAsPrivileged([{scheme:'revive-cover',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
const renderer=path.join(__dirname,'../dist/index.html');
let win,lib,tray,monitor,job=null,scanState=null,problem='',editorList=[],shuttingDown=false;
const previews=new Map();
const covers=new Map();
function coverPath(id){return path.join(app.getPath('userData'),'covers',id+'.png');}
async function saveCover(id,image){if(image.isEmpty())throw new Error('这张图片无法读取。');const target=coverPath(id);await fsp.mkdir(path.dirname(target),{recursive:true});await fsp.writeFile(target,image.resize({width:1000,quality:'best'}).toPNG());covers.set(id,Date.now());publish();}
const defaults={theme:'dark',view:'grid',cardSize:210,maxDepth:6,sort:'modified',period:'all',indexSessions:true};
function state(){return {projects:lib.present().map(p=>({...p,thumbnail:covers.has(p.id)?`revive-cover://cache/${p.id}.png?v=${covers.get(p.id)}`:null,sessions:(p.sessions||[]).map(({file,...s})=>s)})),roots:lib.get('roots',[]),watchingPaths:monitor?.paths()||[],settings:lib.get('settings',defaults),categories:lib.get('categories',['灵感实验','正在打磨','准备发布']),scan:scanState,problem,editors:editorList.map(({id,name})=>({id,name})),previewIds:[...previews.keys()],version:app.getVersion(),lastScan:lib.get('lastScan',null)};}
function publish(){if(win&&!win.isDestroyed())win.webContents.send('revive:state',state());}
function settings(changes){const next={...defaults,...lib.get('settings',{}),...changes};next.maxDepth=Math.min(10,Math.max(1,Number(next.maxDepth)||6));next.cardSize=Math.min(290,Math.max(170,Number(next.cardSize)||210));if(!['dark','light'].includes(next.theme))next.theme='dark';lib.set('settings',next);nativeTheme.themeSource=next.theme;if('maxDepth' in changes)monitor?.refresh({rescan:true});publish();return next;}
function showWindow(){if(win&&!win.isDestroyed()){if(win.isMinimized())win.restore();win.show();win.focus();}}
function receiveProjects(projects){if(shuttingDown)return;const previous=new Map(lib.all().map(p=>[p.id,p]));lib.upsert(projects.map(p=>({...previous.get(p.id),...p,originalName:p.originalName??p.name,sessions:p.sessions||previous.get(p.id)?.sessions||[],agents:[...new Set([...(previous.get(p.id)?.agents||[]),...(p.agents||[])])]})));publish();}
async function discoverEditors(){const candidates=[['vscode','VS Code',path.join(process.env.LOCALAPPDATA||'','Programs','Microsoft VS Code','Code.exe')],['vscode-system','VS Code',path.join(process.env.ProgramFiles||'C:/Program Files','Microsoft VS Code','Code.exe')],['cursor','Cursor',path.join(process.env.LOCALAPPDATA||'','Programs','cursor','Cursor.exe')],['trae','Trae',path.join(process.env.LOCALAPPDATA||'','Programs','Trae','Trae.exe')],['vscodium','VSCodium',path.join(process.env.LOCALAPPDATA||'','Programs','VSCodium','VSCodium.exe')]];editorList=candidates.filter(([, ,p])=>fs.existsSync(p)).map(([id,name,exe])=>({id,name,exe}));const custom=lib.get('editor',null);if(custom&&fs.existsSync(custom.exe))editorList.push(custom);publish();}
function removeMissing(projects){if(!shuttingDown&&projects.length){lib.markMissing(projects);publish();}}
async function ensureProject(id){const p=lib.one(id);if(await directoryMissing(p.path)){removeMissing([p]);throw new Error('项目文件夹已移动或删除。');}return p;}
async function doScan(){if(job)return;const roots=lib.get('roots',[]).filter(r=>r.enabled!==false).map(r=>r.path);if(!roots.length)throw new Error('请先添加一个扫描文件夹。');job=new AbortController();problem='';scanState={phase:'files',directories:0,found:0,current:''};publish();
  try{const result=await scan(roots,{maxDepth:lib.get('settings',defaults).maxDepth,signal:job.signal,onProgress:p=>{scanState={...p,phase:'files'};publish();}});lib.upsert(result.projects);
    const missing=await findMissingProjects(lib.present().filter(p=>roots.some(r=>key(p.path)===key(r)||key(p.path).startsWith(key(r)+'/'))));
    removeMissing(missing);
    if(!job.signal.aborted&&lib.get('settings',defaults).indexSessions){scanState={phase:'sessions',found:result.projects.length,directories:result.directories,current:'匹配本机 Codex / Claude Code 会话记录'};publish();const matched=await indexSessions(lib.present(),count=>{scanState={...scanState,current:`已检查 ${count} 条会话记录`};publish();},job.signal);if(!job.signal.aborted){const updates=lib.present().map(p=>{const sessions=(matched.get(p.id)||[]).sort((a,b)=>b.at-a.at).slice(0,30);return {...p,sessions,agents:[...new Set([...p.agents,...sessions.map(s=>s.tool)])]};});lib.upsert(updates);}}
    const report={at:Date.now(),count:result.projects.length,directories:result.directories,errors:result.errors,cancelled:result.cancelled||job.signal.aborted,truncated:result.truncated};lib.set('lastScan',report);
  }catch(e){problem=e.message;}finally{job=null;scanState=null;publish();}
}
async function addRoots(paths){let roots=lib.get('roots',[]);for(const p of paths){if(typeof p!=='string')continue;try{const real=await fsp.realpath(p);if(!(await fsp.stat(real)).isDirectory())continue;if(!roots.some(r=>key(r.path)===key(real)))roots.push({path:real,enabled:true});}catch{}}lib.set('roots',roots);monitor?.refresh();publish();return roots;}
async function details(id){const p=await ensureProject(id);let readme='';for(const n of ['README.md','readme.md','README.MD','README.txt']){try{const h=await fsp.open(path.join(p.path,n),'r');try{const b=Buffer.alloc(24000);const {bytesRead}=await h.read(b,0,b.length,0);readme=b.subarray(0,bytesRead).toString('utf8');}finally{await h.close();}break;}catch{}}
  const git={available:p.git};if(p.git){try{const a=await run('git',['-C',p.path,'-c','core.fsmonitor=false','status','--porcelain','--branch','--untracked-files=no'],{windowsHide:true,timeout:6000,maxBuffer:100000});const lines=a.stdout.trim().split(/\r?\n/);git.branch=lines.shift()?.replace(/^## /,'')||'';git.changed=lines.length;git.summary=lines.slice(0,20).join('\n');const c=await run('git',['-C',p.path,'log','-1','--format=%s'],{windowsHide:true,timeout:4000});git.commit=c.stdout.trim();}catch{git.error='Git 信息暂不可读';}}
  const measured=await sourceSize(p.path);lib.upsert([{...lib.one(id),sourceSummary:measured}]);publish();
  return {readme,git,size:measured,context:await contextFor(p),plan:await previewPlan(p)};
}
async function openEditor(p,editorId){const e=editorList.find(e=>e.id===editorId)||editorList[0];if(!e)throw new Error('尚未找到编辑器，请到设置里选择编辑器 EXE。');await new Promise((resolve,reject)=>{const child=spawn(e.exe,[p.path],{detached:true,stdio:'ignore',windowsHide:false});child.once('error',reject);child.once('spawn',()=>{child.unref();resolve();});});return {editor:e.name};}
async function preview(p){let plan=await previewPlan(p);
  if(p.type==='桌面应用'){
    if(plan.kind==='none'){
      const choice=await dialog.showOpenDialog(win,{title:'选择这个项目的应用程序 EXE',defaultPath:p.path,properties:['openFile'],filters:[{name:'Windows 应用程序',extensions:['exe']}]});
      if(choice.canceled||!choice.filePaths.length)return {cancelled:true};
      plan={kind:'desktop',exe:choice.filePaths[0]};
    }
    const error=await shell.openPath(plan.exe);if(error)throw new Error(error);
    lib.edit(p.id,{executable:plan.exe});publish();return {kind:'desktop',executable:plan.exe};
  }
  if(previews.has(p.id)){previews.get(p.id).window?.focus();return;}if(plan.kind==='none')throw new Error(plan.reason);const entry={starting:true};previews.set(p.id,entry);publish();
  try{const runtime=plan.kind==='hub'?await previewHub.start(plan):plan.kind==='static'?await staticServer(plan.root):await startDev(p,plan,()=>{},starting=>{entry.runtime=starting;});entry.runtime=runtime;if(shuttingDown){await runtime.stop();return;}
    const view=new BrowserWindow({title:`${p.name} · 预览`,width:1200,height:820,backgroundColor:'#151619',icon:path.join(__dirname,'../build/window-icon.png'),webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,partition:`revive-preview-${p.id}`}});entry.window=view;entry.starting=false;const origin=new URL(runtime.url).origin;view.webContents.session.setPermissionRequestHandler((_w,_p,cb)=>cb(false));view.webContents.session.setPermissionCheckHandler(()=>false);view.webContents.on('will-navigate',(e,url)=>{if(new URL(url).origin!==origin)e.preventDefault();});view.webContents.setWindowOpenHandler(({url})=>{if(/^https?:\/\//i.test(url))void shell.openExternal(url);return {action:'deny'};});view.on('closed',()=>{previews.delete(p.id);void runtime.stop();publish();});await view.loadURL(runtime.url);publish();setTimeout(()=>{if(!view.isDestroyed())void view.webContents.capturePage().then(image=>saveCover(p.id,image)).catch(()=>{});},900);
  }catch(e){previews.delete(p.id);await entry.runtime?.stop();publish();throw e;}
}
async function action(name,payload={}){switch(name){
  case 'state':return state();
  case 'scan':void doScan().catch(e=>{problem=e.message;publish();});return true;
  case 'cancelScan':job?.abort();return true;
  case 'pickRoot':{const r=await dialog.showOpenDialog(win,{title:'选择项目所在文件夹',properties:['openDirectory','multiSelections']});if(!r.canceled)await addRoots(r.filePaths);return !r.canceled;}
  case 'addRoots':return addRoots(Array.isArray(payload.paths)?payload.paths.slice(0,20):[]);
  case 'rootEnabled':{const roots=lib.get('roots',[]).map(r=>key(r.path)===key(payload.path)?{...r,enabled:!!payload.enabled}:r);lib.set('roots',roots);monitor?.refresh();publish();return true;}
  case 'removeRoot':lib.set('roots',lib.get('roots',[]).filter(r=>key(r.path)!==key(payload.path)));monitor?.refresh();publish();return true;
  case 'edit':lib.edit(payload.id,payload.changes||{});publish();return true;
  case 'settings':return settings(payload);
  case 'category':{const name=String(payload.name||'').trim().slice(0,50);const cs=lib.get('categories',[]);if(name&&!cs.includes(name)){lib.set('categories',[...cs,name]);publish();}return true;}
  case 'details':return details(payload.id);
  case 'pickCover':{const p=await ensureProject(payload.id);const r=await dialog.showOpenDialog(win,{title:'选择项目封面',properties:['openFile'],filters:[{name:'图片',extensions:['png','jpg','jpeg','webp']}]});if(r.canceled)return false;await saveCover(p.id,nativeImage.createFromPath(r.filePaths[0]));return true;}
  case 'pasteCover':{const p=await ensureProject(payload.id),image=clipboard.readImage();if(image.isEmpty())throw new Error('剪贴板中没有图片，请先复制图片或截图。');await saveCover(p.id,image);return true;}
  case 'openFolder':{const e=await shell.openPath((await ensureProject(payload.id)).path);if(e)throw new Error(e);return true;}
  case 'openEditor':return openEditor(await ensureProject(payload.id),payload.editor);
  case 'pickEditor':{const r=await dialog.showOpenDialog(win,{title:'选择编辑器程序',properties:['openFile'],filters:[{name:'Windows 程序',extensions:['exe']}]});if(r.canceled)return false;lib.set('editor',{id:'custom',name:path.basename(r.filePaths[0],'.exe'),exe:r.filePaths[0]});await discoverEditors();return true;}
  case 'preview':return preview(await ensureProject(payload.id));
  case 'stopPreview':{const e=previews.get(payload.id);if(e?.window)e.window.close();else if(e?.runtime){await e.runtime.stop();previews.delete(payload.id);publish();}return true;}
  case 'copyPath':clipboard.writeText(lib.one(payload.id).path);return true;
  case 'copyContext':{const p=await ensureProject(payload.id);const d=await details(payload.id);const text=[`继续开发项目：${p.name}`,`本地位置：${p.path}`,`类型：${p.type}；技术：${p.stack.join(' / ')}`,p.description&&`简介：${p.description}`,p.note&&`我的备注：\n${p.note}`,d.git.branch&&`Git 分支：${d.git.branch}；已跟踪文件改动：${d.git.changed}`,d.git.commit&&`最近提交：${d.git.commit}`,d.context?.lastPrompt&&`最近一次开发任务（历史记录，供参考）：\n${d.context.lastPrompt}`,d.readme&&`项目 README（节选）：\n${d.readme.slice(0,6000)}`,'请先检查当前文件和实际运行状态，再继续实现尚未完成的部分。'].filter(Boolean).join('\n\n');clipboard.writeText(text);return true;}
  case 'export':{const r=await dialog.showSaveDialog(win,{title:'导出项目索引与备注',defaultPath:'伏笔项目索引.json',filters:[{name:'JSON',extensions:['json']}]});if(r.canceled)return false;await fsp.writeFile(r.filePath,JSON.stringify({version:1,exportedAt:Date.now(),roots:lib.get('roots',[]),projects:state().projects,categories:lib.get('categories',[])},null,2));return true;}
  case 'window':if(payload.command==='minimize')win.minimize();else if(payload.command==='maximize')win.isMaximized()?win.unmaximize():win.maximize();else if(payload.command==='close')win.close();return true;
  case 'quit':setImmediate(()=>app.quit());return true;
  default:throw new Error('不支持的操作。');}}
if(!process.env.REVIVE_TEST_DATA&&!app.requestSingleInstanceLock())app.quit();else if(process.argv.includes('--quit-for-update'))app.quit();else{
app.on('second-instance',(_event,args)=>{if(args.includes('--quit-for-update'))app.quit();else showWindow();});
app.whenReady().then(async()=>{lib=new Library(path.join(app.getPath('userData'),'library.sqlite'));if(!lib.get('settings',null))lib.set('settings',defaults);if(!lib.get('categories',null))lib.set('categories',['灵感实验','正在打磨','准备发布']);if(!lib.get('roots',null))lib.set('roots',[{path:fs.existsSync('E:/Codex')?'E:/Codex':app.getPath('documents'),enabled:true}]);Menu.setApplicationMenu(null);nativeTheme.themeSource=lib.get('settings',defaults).theme;
  const missing=await findMissingProjects(lib.present());
  removeMissing(missing);
  if(shuttingDown)return;
  try{for(const f of fs.readdirSync(path.join(app.getPath('userData'),'covers')))if(/^[a-f0-9]{24}\.png$/.test(f))covers.set(f.slice(0,-4),fs.statSync(path.join(app.getPath('userData'),'covers',f)).mtimeMs);}catch{}
  protocol.handle('revive-cover',request=>{const u=new URL(request.url);const id=u.pathname.slice(1,-4);if(u.hostname!=='cache'||!/^\/[a-f0-9]{24}\.png$/.test(u.pathname)||!covers.has(id))return new Response('Not found',{status:404});return net.fetch(pathToFileURL(coverPath(id)).href);});
  win=new BrowserWindow({title:'伏笔',width:1420,height:920,minWidth:1020,minHeight:680,frame:false,backgroundColor:'#101113',show:false,icon:path.join(__dirname,'../build/window-icon.png'),webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());session.defaultSession.setPermissionRequestHandler((_w,_p,cb)=>cb(false));
  ipcMain.handle('revive:action',async(event,name,payload)=>{if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame||event.senderFrame.url!==pathToFileURL(renderer).href)throw new Error('非法调用来源。');try{return {ok:true,value:await action(name,payload||{})};}catch(e){return {ok:false,error:e.message};}});
  win.once('ready-to-show',()=>win.show());win.on('close',event=>{if(!shuttingDown){event.preventDefault();win.hide();}});win.on('closed',()=>{win=null;});void win.loadFile(renderer);void discoverEditors();
  if(!process.env.REVIVE_TEST_DATA){tray=new Tray(nativeImage.createFromPath(path.join(__dirname,'../build/window-icon.png')).resize({width:16,height:16}));tray.setToolTip('伏笔 · 后台自动收录');tray.setContextMenu(Menu.buildFromTemplate([{label:'打开伏笔',click:showWindow},{type:'separator'},{label:'退出伏笔',click:()=>app.quit()}]));tray.on('click',showWindow);tray.on('double-click',showWindow);}
  monitor=createProjectMonitor({getRoots:()=>lib.get('roots',[]),getProjects:()=>lib.all(),getMaxDepth:()=>lib.get('settings',defaults).maxDepth,onProjects:receiveProjects,onMissing:removeMissing,onError:error=>console.warn('项目监听：',error.message)});monitor.refresh();
  if(!app.isPackaged&&process.env.REVIVE_INITIAL_SCAN==='1')void doScan();
});
app.on('before-quit',()=>{shuttingDown=true;monitor?.close();if(tray&&!tray.isDestroyed())tray.destroy();job?.abort();for(const e of previews.values())void e.runtime?.stop();});
app.on('window-all-closed',()=>{if(shuttingDown)app.quit();});
}
