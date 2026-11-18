const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const DEFAULT_ORIGIN='http://127.0.0.1:5190';
function directoryKey(value){return String(value||'').replace(/[\\/]+/g,'/').replace(/\/$/,'').toLowerCase().replace(/^d:\/codex(?=\/|$)/,'e:/codex').replace(/^[a-z]:\/users\/[^/]+\/documents\/codex(?=\/|$)/,'e:/codex');}
function localUrl(value){try{const url=new URL(value);return url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname)&&!url.username&&!url.password?url.href:null;}catch{return null;}}
function selectProject(project,projects){
  const key=directoryKey(project.path),exact=projects.filter(p=>directoryKey(p.directory)===key);
  if(exact.length===1)return exact[0];
  if(exact.length>1)return null;
  const children=projects.filter(p=>{const directory=directoryKey(p.directory);return directory.startsWith(key+'/')&&/^(frontend|client|web)(\/[^/]+)?$/.test(directory.slice(key.length+1));});
  return children.length===1?children[0]:null;
}
function createPreviewHubClient({origin=DEFAULT_ORIGIN,configFiles=[path.join(os.homedir(),'Documents/Codex/preview-hub/projects.json'),'E:/Codex/preview-hub/projects.json'],timeout=1500,cacheMs=2000}={}){
  if(!localUrl(origin))throw new Error('预览台地址必须是本机 HTTP 地址。');
  origin=new URL(origin).origin;let cache=null,at=0,pending=null;
  async function status(force=false){
    if(!force&&cache&&Date.now()-at<cacheMs)return cache;
    if(pending)return pending;
    pending=(async()=>{try{const response=await fetch(origin+'/api/status',{signal:AbortSignal.timeout(timeout),redirect:'error'});if(!response.ok)throw new Error('预览台不可用');const data=await response.json();if(data.app!=='spacesu-preview-hub'||!Array.isArray(data.projects))throw new Error('不是拾羽预览台');cache={online:true,projects:data.projects.filter(p=>p&&typeof p.directory==='string'&&/^[a-z0-9-]+$/.test(p.id)&&localUrl(p.url))};}catch{let projects=[];for(const file of configFiles){try{const data=JSON.parse((await fs.readFile(file,'utf8')).replace(/^\uFEFF/,''));if(Array.isArray(data)){projects=data.filter(p=>p&&typeof p.directory==='string');break;}}catch{}}cache={online:false,projects};}at=Date.now();return cache;})().finally(()=>{pending=null;});
    return pending;
  }
  async function find(project){
    const state=await status(),entry=selectProject(project,state.projects);if(!entry)return null;
    if(state.online)return {kind:'hub',hubId:entry.id,url:localUrl(entry.url),directory:entry.directory,label:'打开本地预览'};
    if(typeof entry.output==='string'&&!entry.server){const suffix=directoryKey(entry.directory).slice(directoryKey(project.path).length),root=path.resolve(project.path,'.'+suffix,entry.output),relative=path.relative(project.path,root);if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))return null;try{if((await fs.stat(path.join(root,'index.html'))).isFile())return {kind:'static',root,label:'打开本地构建'};}catch{}}
    return null;
  }
  async function start(plan){
    let state=await status(true),entry=state.online&&state.projects.find(p=>p.id===plan.hubId&&directoryKey(p.directory)===directoryKey(plan.directory));
    if(!entry)throw new Error('拾羽预览台暂时未连接，请打开预览台后重试。');
    if(!entry.running){
      const response=await fetch(origin+'/api/projects/'+encodeURIComponent(entry.id)+'/start',{method:'POST',headers:{Origin:origin,'X-Preview-Hub':'local-control'},signal:AbortSignal.timeout(30000),redirect:'error'});
      const data=await response.json();if(!response.ok)throw new Error(data.error||'本地预览启动失败。');
      entry=data.projects?.find(p=>p.id===plan.hubId&&directoryKey(p.directory)===directoryKey(plan.directory));
      if(data.app!=='spacesu-preview-hub'||!entry?.running)throw new Error(entry?.error||'本地预览尚未就绪，请在拾羽预览台检查。');
      cache=null;
    }
    const url=localUrl(entry.url);if(!url)throw new Error('本地预览地址无效。');
    // The hub owns these shared servers. Closing a Revive window must not stop them.
    return {url,stop:async()=>{}};
  }
  return {find,start};
}
const previewHub=createPreviewHubClient();
module.exports={createPreviewHubClient,previewHub,directoryKey};
