const fs=require('node:fs/promises');
const path=require('node:path');
const http=require('node:http');
const {spawn,execFile}=require('node:child_process');
const {promisify}=require('node:util');
const run=promisify(execFile);
const {previewHub}=require('./preview-hub.cjs');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2','.mp4':'video/mp4','.wasm':'application/wasm'};
const isWithin=(root,p)=>{const rel=path.relative(root,p);return rel===''||!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel);};
async function staticServer(root){root=await fs.realpath(root);const server=http.createServer(async(req,res)=>{try{const raw=decodeURIComponent((req.url||'/').split('?')[0]);if(raw.includes('\0')||raw.split(/[\\/]/).some(x=>x.startsWith('.'))){res.writeHead(403);return res.end('Forbidden');}let p=path.resolve(root,'.'+raw);if(!isWithin(root,p)){res.writeHead(403);return res.end('Forbidden');}let stat=await fs.stat(p);if(stat.isDirectory())p=path.join(p,'index.html');p=await fs.realpath(p);if(!isWithin(root,p)){res.writeHead(403);return res.end('Forbidden');}const b=await fs.readFile(p);res.writeHead(200,{'Content-Type':MIME[path.extname(p).toLowerCase()]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});res.end(b);}catch{res.writeHead(404);res.end('Not found');}});await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});return {url:`http://127.0.0.1:${server.address().port}`,stop:()=>new Promise(r=>server.close(r))};}
async function desktopPlan(project){
  if(project.executable){try{if(path.isAbsolute(project.executable)&&/\.exe$/i.test(project.executable)&&(await fs.stat(project.executable)).isFile())return {kind:'desktop',exe:project.executable,label:'打开应用'};}catch{}}
  let pkg={};try{pkg=JSON.parse((await fs.readFile(path.join(project.path,'package.json'),'utf8')).replace(/^\uFEFF/,''));}catch{}
  const normalize=name=>String(name||'').toLowerCase().replace(/\.exe$/,'').replace(/[\s._-]/g,'');
  const expected=new Set([pkg.build?.win?.executableName,pkg.build?.executableName,pkg.build?.productName,pkg.productName,pkg.name,project.originalName,project.name,path.basename(project.path)].filter(Boolean).map(normalize));
  const configured=pkg.build?.directories?.output;
  const roots=['release','dist','out','build','bin','src-tauri/target/release','target/release','target/debug'];
  if(typeof configured==='string'&&isWithin(project.path,path.resolve(project.path,configured)))roots.unshift(configured);
  try{for(const entry of await fs.readdir(project.path,{withFileTypes:true}))if(entry.isDirectory()&&/^(release|dist|build)[-_]\d/i.test(entry.name))roots.push(entry.name);}catch{}
  const queue=[{dir:project.path,depth:0,rank:100},...roots.map((name,rank)=>({dir:path.resolve(project.path,name),depth:1,rank}))];
  const visited=new Set(),candidates=[];let directories=0;
  while(queue.length&&directories<250){
    const current=queue.shift();let real,entries;try{real=await fs.realpath(current.dir);if(!isWithin(project.path,real)||visited.has(real.toLowerCase()))continue;visited.add(real.toLowerCase());entries=await fs.readdir(real,{withFileTypes:true});directories++;}catch{continue;}
    for(const entry of entries){
      if(entry.isSymbolicLink())continue;
      const file=path.join(real,entry.name);
      if(entry.isFile()&&/\.exe$/i.test(entry.name)){
        if(/(?:^|[-_.\s])(setup|installer|uninstall\w*|unins\d*|update|updater|elevate|electron|chrome|crashpad_handler|ffmpeg|7za|signtool)(?:[-_.\s]|$)/i.test(entry.name))continue;
        candidates.push({exe:file,matched:expected.has(normalize(entry.name)),rank:current.rank,unpacked:/[\\/]win(?:32)?(?:-x64)?-unpacked[\\/]/i.test(file),mtime:(await fs.stat(file)).mtimeMs});
      }else if(entry.isDirectory()&&current.depth>0&&current.depth<4&&!/^(node_modules|resources|locales|vendor|\.git|.*\.tmp|.*\.app)$/i.test(entry.name))queue.push({dir:file,depth:current.depth+1,rank:current.rank});
    }
  }
  const matching=candidates.filter(c=>c.matched),choices=matching.length?matching:candidates.length===1?candidates:[];
  choices.sort((a,b)=>Number(b.unpacked)-Number(a.unpacked)||a.rank-b.rank||b.mtime-a.mtime||a.exe.localeCompare(b.exe));
  return choices.length?{kind:'desktop',exe:choices[0].exe,label:'打开应用'}:{kind:'none',label:'选择应用程序',reason:'未找到对应的 EXE，请选择已打包或已安装的应用程序。'};
}
async function previewPlan(project){if(project.type==='桌面应用')return desktopPlan(project);const registered=await previewHub.find(project);if(registered)return registered;for(const folder of ['dist','build','out','']){const file=path.join(project.path,folder,'index.html');try{const text=await fs.readFile(file,'utf8');if(folder||!/<script[^>]+(?:src=["'][^"']*\.(?:jsx|tsx)|src=["']\/?src\/)/i.test(text))return {kind:'static',root:path.dirname(file),label:folder?`预览 ${folder} 构建`:'预览网页'};}catch{}}
  const scripts=project.scripts||{};const script=scripts.dev?'dev':scripts.start?'start':null;
  return script?{kind:'dev',script,label:'启动开发预览',command:`npm run ${script}`}:{kind:'none',label:'暂无网页预览',reason:'没有找到可直接预览的 index.html 或 dev / start 脚本。'};
}
async function findNode(){const {stdout}=await run('where.exe',['node.exe'],{windowsHide:true});return stdout.trim().split(/\r?\n/)[0];}
async function startDev(project,plan,onLog=()=>{},onStarting=()=>{}) {
  try{await fs.access(path.join(project.path,'node_modules'));}catch{throw new Error('这个项目尚未安装依赖。请在原开发工具中安装后，再启动预览。');}
  const node=await findNode();const npm=path.join(path.dirname(node),'node_modules','npm','bin','npm-cli.js');await fs.access(npm);
  const reservation=await staticServer(project.path);const port=new URL(reservation.url).port;await reservation.stop();
  // Extra arguments are passed only for recognized dev servers; arbitrary npm scripts keep their original arguments.
  const command=project.scripts[plan.script];const args=[npm,'run',plan.script];
  if(/\bvite\b/.test(command)&&!command.includes('preview'))args.push('--','--host','127.0.0.1','--port',port,'--strictPort');
  else if(/\bnext\s+(dev|start)\b/.test(command))args.push('--','--hostname','127.0.0.1','--port',port);
  const child=spawn(node,args,{cwd:project.path,windowsHide:true,env:{...process.env,PORT:port,BROWSER:'none',HOST:'127.0.0.1'},stdio:['ignore','pipe','pipe']});
  let ended=false,logs='',url=`http://127.0.0.1:${port}`,error;
  const append=b=>{const text=b.toString().replace(/\x1b\[[0-9;]*m/g,'');logs=(logs+text).slice(-18000);onLog(text);const found=text.match(/http:\/\/(?:localhost|127\.0\.0\.1):\d+/);if(found)url=found[0];};
  child.stdout.on('data',append);child.stderr.on('data',append);child.once('error',e=>{ended=true;error=e;});child.once('exit',()=>ended=true);
  const stop=async()=>{if(child.pid&&!ended){try{await run('taskkill.exe',['/pid',String(child.pid),'/t','/f'],{windowsHide:true});}catch{child.kill();}}};
  onStarting({stop,pid:child.pid});
  try{for(let i=0;i<180;i++){if(ended)throw new Error(error?.message||'项目启动失败。\n'+logs.slice(-1800));try{const r=await fetch(url,{signal:AbortSignal.timeout(500)});if(r.status<500)return {url,stop,pid:child.pid};}catch{}await new Promise(r=>setTimeout(r,350));}throw new Error('启动超时，请在原开发工具中检查项目。\n'+logs.slice(-1200));}catch(e){await stop();throw e;}
}
module.exports={staticServer,previewPlan,startDev,isWithin};
