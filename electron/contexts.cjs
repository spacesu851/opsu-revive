const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {key}=require('./library.cjs');
async function chunk(file,length=32768,tail=false){let h;try{h=await fs.open(file,'r');const s=await h.stat();const b=Buffer.alloc(Math.min(length,s.size));const {bytesRead}=await h.read(b,0,b.length,tail?Math.max(0,s.size-b.length):0);return b.subarray(0,bytesRead).toString('utf8');}catch{return '';}finally{await h?.close();}}
async function filesUnder(dir,max=6000){const q=[dir],found=[];while(q.length&&found.length<max){const d=q.pop();let es;try{es=await fs.readdir(d,{withFileTypes:true});}catch{continue;}for(const e of es.sort((a,b)=>a.name.localeCompare(b.name))){if(e.isSymbolicLink())continue;const p=path.join(d,e.name);if(e.isDirectory())q.push(p);else if(e.isFile()&&e.name.endsWith('.jsonl'))found.push(p);}}return found;}
function parseHeader(text,tool){for(const line of text.split('\n')){try{const r=JSON.parse(line);if(tool==='Codex'&&r.type==='session_meta'&&r.payload?.cwd&&r.payload?.id)return {cwd:r.payload.cwd,id:r.payload.id,at:r.payload.timestamp||r.timestamp};if(tool==='Claude Code'&&r.cwd&&r.sessionId)return {cwd:r.cwd,id:r.sessionId,at:r.timestamp};}catch{}}return null;}
function matchProjects(projects,cwd){const cwdKey=key(cwd);const keys=[...new Set([cwdKey,cwdKey.replace(/^d:\/codex(?=\/|$)/,'e:/codex'),cwdKey.replace(/^c:\/users\/[^/]+\/documents\/codex(?=\/|$)/,'e:/codex')])];const exact=projects.filter(p=>keys.includes(key(p.path)));return exact.length?exact:projects.filter(p=>keys.some(k=>key(p.path).startsWith(k+'/outputs/')));}
async function indexSessions(projects,onProgress=()=>{},signal) {
  const homes=[process.env.CODEX_HOME,path.join(os.homedir(),'.codex'),path.join(os.homedir(),'.codex-recovered-1600')].filter(Boolean);
  const sources=[...new Set(homes)].map(h=>({dir:path.join(h,'sessions'),tool:'Codex'}));
  sources.push({dir:path.join(os.homedir(),'.claude','projects'),tool:'Claude Code'});
  const byPath=new Map(projects.map(p=>[key(p.path),p]));const result=new Map();let read=0;
  for(const src of sources){if(signal?.aborted)break;const files=await filesUnder(src.dir);for(const file of files){if(signal?.aborted)break;const h=parseHeader(await chunk(file,128*1024),src.tool);if(!h)continue;
    // Codex chats often keep deliverables in cwd/outputs/<project>. Only this known layout permits ancestor matching.
    const targets=matchProjects(projects,h.cwd);
    if(targets.length){const s=await fs.stat(file).catch(()=>null);for(const p of targets){const a=result.get(p.id)||[];if(!a.some(x=>x.id===h.id))a.push({tool:src.tool,id:h.id,at:s?.mtimeMs||Date.parse(h.at)||0,file});result.set(p.id,a);}}if(++read%200===0){onProgress(read);await new Promise(r=>setImmediate(r));}}}
  return result;
}
function lastPrompt(text,tool){const prompts=[];for(const l of text.split('\n')){try{const r=JSON.parse(l);let s;if(tool==='Codex'&&r.type==='event_msg'&&r.payload?.type==='user_message')s=r.payload.message;if(tool==='Claude Code'&&r.type==='user')s=typeof r.message?.content==='string'?r.message.content:r.message?.content?.filter(x=>x.type==='text').map(x=>x.text).join('\n');if(s&&!s.includes('<environment_context>')&&!s.includes('<INSTRUCTIONS>')&&!s.startsWith('<local-command'))prompts.push(s);}catch{}}return (prompts.at(-1)||'').slice(0,2500);}
function sessionUsage(text){let usage=null;for(const l of text.split('\n')){try{const r=JSON.parse(l);const total=r.type==='event_msg'&&r.payload?.type==='token_count'?r.payload.info?.total_token_usage:null;if(total&&Number.isSafeInteger(total.total_tokens)&&total.total_tokens>=0)usage={totalTokens:total.total_tokens,inputTokens:total.input_tokens||0,outputTokens:total.output_tokens||0};}catch{}}return usage;}
async function contextFor(project){const sessions=project.sessions||[];const latest=[...sessions].sort((a,b)=>b.at-a.at)[0];if(!latest)return null;const text=await chunk(latest.file,128*1024,true);return {...latest,lastPrompt:lastPrompt(text,latest.tool),usage:sessionUsage(text)};}
module.exports={indexSessions,contextFor,parseHeader,lastPrompt,chunk,matchProjects,sessionUsage};
