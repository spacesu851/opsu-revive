const fs = require('node:fs/promises');
const path = require('node:path');
const {idFor,key} = require('./library.cjs');
const SKIP = new Set(['node_modules','.git','.svn','.hg','.next','.nuxt','.cache','.venv','venv','__pycache__','target','dist','build','release','vendor','coverage','.idea','.vscode','work','tmp','temp','toolchains','snapshots','migration-records','codex-history','codex-workspace-archive','codex-internal-projects','.migration','$recycle.bin','system volume information','windows','program files','program files (x86)']);
const skipped=name=>SKIP.has(name.toLowerCase())||/^(?:release|dist|build)[-_]\d/i.test(name);
async function json(file){try{return JSON.parse((await fs.readFile(file,'utf8')).replace(/^\uFEFF/,''));}catch{return {};}}
function classify(names,pkg={}) {
  const has=n=>names.has(n);const deps={...pkg.dependencies,...pkg.devDependencies};
  if(has('project.config.json')||has('project.private.config.json')||has('app.json')&&has('app.wxss'))return {type:'小程序',stack:['微信小程序']};
  if(deps.electron||has('tauri.conf.json')||has('src-tauri'))return {type:'桌面应用',stack:[deps.electron?'Electron':'Tauri',...(deps.react?['React']:[])]};
  if(Object.keys(deps).some(x=>/phaser|three|pixi|babylon|kaboom/.test(x))||has('project.godot')||has('game.html'))return {type:'游戏',stack:Object.keys(deps).filter(x=>/phaser|three|pixi|babylon|kaboom/.test(x))};
  if(has('package.json')||has('index.html'))return {type:'网页',stack:[deps.next?'Next.js':deps.react?'React':deps.vue?'Vue':has('index.html')?'HTML':'Node.js',...(deps.vite?['Vite']:[]),...(deps.typescript?['TypeScript']:[])]};
  if(has('pyproject.toml')||has('requirements.txt')||has('main.py'))return {type:'脚本 / 工具',stack:['Python']};
  if(has('cargo.toml'))return {type:'脚本 / 工具',stack:['Rust']};
  if(has('go.mod'))return {type:'脚本 / 工具',stack:['Go']};
  return {type:'其他',stack:[]};
}
async function inspect(dir,entries,root) {
  const names=new Set(entries.map(e=>e.name.toLowerCase()));
  const indicators=['package.json','index.html','game.html','project.config.json','project.godot','pyproject.toml','requirements.txt','cargo.toml','go.mod','main.py'];
  if(!indicators.some(n=>names.has(n))&&!names.has('.git')&&!entries.some(e=>/\.(sln|csproj)$/i.test(e.name)))return null;
  const pkg=names.has('package.json')?await json(path.join(dir,'package.json')):{};
  const stats=await Promise.all(entries.filter(e=>e.isFile()&&!e.name.startsWith('.')).slice(0,80).map(e=>fs.stat(path.join(dir,e.name)).catch(()=>null)));
  let modified=Math.max((await fs.stat(dir)).mtimeMs,...stats.filter(Boolean).map(s=>s.mtimeMs));
  // Bounded source sampling keeps large libraries responsive while noticing edits inside common source directories.
  const sourceQueue=entries.filter(e=>e.isDirectory()&&['src','app','pages','components','electron','public'].includes(e.name.toLowerCase())).map(e=>({dir:path.join(dir,e.name),depth:0}));let sampled=0;
  while(sourceQueue.length&&sampled<160){const source=sourceQueue.shift();let es;try{es=await fs.readdir(source.dir,{withFileTypes:true});}catch{continue;}for(const e of es){if(e.isSymbolicLink()||skipped(e.name))continue;const p=path.join(source.dir,e.name);if(e.isFile()){try{modified=Math.max(modified,(await fs.stat(p)).mtimeMs);sampled++;}catch{}if(sampled>=160)break;}else if(e.isDirectory()&&source.depth<2)sourceQueue.push({dir:p,depth:source.depth+1});}}
  const agents=[];
  if(names.has('.claude')||names.has('claude.md'))agents.push('Claude Code');
  if(names.has('.cursor')||names.has('.cursorrules'))agents.push('Cursor');
  if(names.has('.gemini')||names.has('gemini.md'))agents.push('Gemini');
  if(names.has('agents.md')||names.has('.codex'))agents.push('Codex');
  if(names.has('.trae'))agents.push('Trae');
  const name=[pkg.productName,pkg.name].find(n=>typeof n==='string'&&n.trim())||path.basename(dir);
  const scripts=Object.fromEntries(Object.entries(pkg.scripts&&typeof pkg.scripts==='object'?pkg.scripts:{}).filter(([k,v])=>typeof v==='string'));
  return {id:idFor(dir),path:dir,root,name,folderName:path.basename(dir),description:typeof pkg.description==='string'?pkg.description.slice(0,300):'',...classify(names,pkg),modified,discoveredAt:Date.now(),exists:true,agents,git:names.has('.git'),scripts,markers:[...names].filter(n=>indicators.includes(n)||n==='readme.md'),sourceBytes:stats.filter(Boolean).reduce((s,v)=>s+v.size,0)};
}
async function scan(roots,{maxDepth=6,maxDirs=25000,maxProjects=3000,signal,onProgress=()=>{}}={}) {
  const queue=roots.map(dir=>({dir:path.resolve(dir),depth:0,root:path.resolve(dir)}));const seen=new Set();const projects=[];let directories=0,errors=0,truncated=false;
  while(queue.length) {
    if(signal?.aborted)break;
    if(directories>=maxDirs||projects.length>=maxProjects){truncated=true;break;}
    const item=queue.shift();if(seen.has(key(item.dir)))continue;seen.add(key(item.dir));
    let entries;try{entries=await fs.readdir(item.dir,{withFileTypes:true});}catch{errors++;continue;}directories++;
    const project=await inspect(item.dir,entries,item.root).catch(()=>null);if(project)projects.push(project);
    // A detected project owns its source tree. Nested dependencies and generated copies are not separate projects.
    if(!project&&item.depth<maxDepth)for(const e of entries)if(e.isDirectory()&&!e.isSymbolicLink()&&!skipped(e.name)&&!e.name.startsWith('.'))queue.push({dir:path.join(item.dir,e.name),depth:item.depth+1,root:item.root});
    if(directories%20===0){onProgress({directories,found:projects.length,current:item.dir,errors});await new Promise(r=>setImmediate(r));}
  }
  onProgress({directories,found:projects.length,current:'',errors});
  return {projects,directories,errors,truncated,cancelled:!!signal?.aborted};
}
async function sourceSize(dir,maxFiles=30000){let bytes=0,files=0,limited=false;const queue=[dir];while(queue.length){const current=queue.pop();let es;try{es=await fs.readdir(current,{withFileTypes:true});}catch{continue;}for(const e of es){if(e.isSymbolicLink()||skipped(e.name))continue;const p=path.join(current,e.name);if(e.isDirectory())queue.push(p);else if(e.isFile()){try{bytes+=(await fs.stat(p)).size;files++;}catch{}if(files>=maxFiles){limited=true;break;}}}if(limited)break;}return {bytes,files,limited};}
module.exports={scan,inspect,classify,sourceSize,SKIP,skipped};
