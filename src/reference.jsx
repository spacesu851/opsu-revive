import React,{useEffect,useId,useRef,useState} from 'react';
import {Compass,Monitor,Smartphone,Gamepad2,Code2,Folder,Boxes,Play,Square,ChevronDown,ArrowUpRight,FolderOpen,Star,Copy,ImagePlus,ClipboardPaste,Pencil,LoaderCircle,AlertCircle,GitBranch,FileText,Check,X,Sparkles,Plus} from 'lucide-react';
import claudeMark from './assets/brands/claude.svg';
import idlePoster from './assets/neon-folder-idle-poster.webp';
import neonFolderIdle from './assets/neon-folder-idle.webm';
import scanCometPoster from './assets/neon-scan-comet-poster.webp';
import scanComet from './assets/neon-scan-comet.webm';
export const typeIcons={'网页':Compass,'游戏':Gamepad2,'桌面应用':Monitor,'小程序':Smartphone,'脚本 / 工具':Code2,'其他':Folder};
export const colorNames=[['slate','雾灰'],['blue','海蓝'],['violet','紫罗兰'],['pink','玫瑰'],['coral','珊瑚'],['amber','琥珀'],['green','松绿'],['cyan','青碧']];
const compactSize=n=>n>1024**3?`${(n/1024**3).toFixed(1)} GB`:n>1024**2?`${(n/1024**2).toFixed(1)} MB`:n>1024?`${Math.round(n/1024)} KB`:`${n||0} B`;
const date=n=>new Date(n).toLocaleString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
const idle=n=>{const d=Math.max(0,Math.floor((Date.now()-n)/86400000));return d===0?'今天更新':d===1?'昨天更新':`${d} 天未更新`;};
export function AgentMark({name}) {
  let mark;
  switch (name) {
    case 'Codex':
      mark = <span
        className="agent-mark agent-mark-mask"
        aria-hidden="true"
      />;
      break;
    case 'Claude Code':
      mark = <img className="agent-mark" src={claudeMark} alt="" draggable={false}/>;
      break;
    case 'Cursor':
      mark = <Boxes size={16} aria-hidden="true"/>;
      break;
    default:
      mark = <Sparkles size={16} aria-hidden="true"/>;
  }
  return <span className={`agent agent-${name.toLowerCase().split(' ')[0]}`} title={name}>{mark}</span>;
}
export function FolderArt({p,large=false,mini=false}){
  const uid=useId().replace(/:/g,'');const Icon=typeIcons[p.type]||Folder;
  return <div className={`folder-art color-${p.color||'slate'} ${mini?'mini':large?'large':''} ${p.thumbnail?'has-cover':''}`} aria-hidden={mini || undefined}>
    <div className="folder-back" style={{'--exposed-back': `url(#exposed-back-${uid})`}}/>
    <div className="folder-sheet sheet-one">
      <div className="folder-sheet-paper">
        {!mini && (p.thumbnail ? <img src={p.thumbnail} alt="项目封面" draggable="false"/> : <Icon strokeWidth={1.6}/>)}
      </div>
    </div>
    <div aria-hidden="true" className="folder-frost frost-near" style={{maskImage: `url(#frost-near-${uid})`}}/>
    <div aria-hidden="true" className="folder-frost frost-deep" style={{maskImage: `url(#frost-deep-${uid})`}}/>
    <svg className="folder-pocket-shadow" viewBox="0 0 206 116" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <filter id={`lip-shadow-${uid}`} filterUnits="userSpaceOnUse" x="-10" y="-10" width="226" height="136">
          {/* Figma blur 4 corresponds to a Gaussian standard deviation of 2. */}
          <feGaussianBlur in="SourceAlpha" stdDeviation="2"/>
          <feOffset dy="-2"/>
          <feComposite in2="SourceAlpha" operator="out"/>
        </filter>
      </defs>
      <g filter={`url(#lip-shadow-${uid})`} opacity=".10">
        <use href={`#pocket-shape-${uid}`} transform="scale(206 116)" fill="black"/>
      </g>
    </svg>
    <div className="folder-front" style={{clipPath: `url(#pocket-clip-${uid})`}}>
      <svg className="folder-front-surface" viewBox="0 0 206 116" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <clipPath id={`pocket-clip-${uid}`} clipPathUnits="objectBoundingBox">
            <path id={`pocket-shape-${uid}`} className="folder-pocket-clip" transform="scale(.004854368932 .008620689655)"/>
          </clipPath>
          {/* Map the pocket viewport (0,35,206,116) into the rear plate (13.5,23,178,124). */}
          <mask id={`exposed-back-${uid}`} maskContentUnits="objectBoundingBox" x="0" y="0" width="1" height="1" style={{maskType: 'luminance'}}>
            <rect width="1" height="1" fill="white"/>
            <g transform={`matrix(${206 / 178} 0 0 ${116 / 124} ${-13.5 / 178} ${12 / 124})`}>
              <use href={`#pocket-shape-${uid}`} fill="black"/>
            </g>
          </mask>
          <linearGradient id={`frost-entry-${uid}`} x2="0" y2="1">
            <stop stopColor="white" stopOpacity="0"/>
            <stop offset=".23" stopColor="white"/>
          </linearGradient>
          <linearGradient id={`frost-depth-${uid}`} x2="0" y2="1">
            <stop offset=".15" stopColor="white" stopOpacity="0"/>
            <stop offset=".62" stopColor="white" stopOpacity=".85"/>
            <stop offset="1" stopColor="white"/>
          </linearGradient>
          <mask id={`frost-near-${uid}`} maskContentUnits="objectBoundingBox" x="0" y="0" width="1" height="1">
            <use href={`#pocket-shape-${uid}`} fill={`url(#frost-entry-${uid})`}/>
          </mask>
          <mask id={`frost-deep-${uid}`} maskContentUnits="objectBoundingBox" x="0" y="0" width="1" height="1">
            <use href={`#pocket-shape-${uid}`} fill={`url(#frost-depth-${uid})`}/>
          </mask>
          <linearGradient id={`rim-${uid}`} x2="0" y2="1">
            <stop stopColor="white" stopOpacity="0"/>
            <stop offset=".29" stopColor="white" stopOpacity=".05"/>
            <stop offset=".83" stopColor="white" stopOpacity=".23"/>
            <stop offset="1" stopColor="white" stopOpacity=".32"/>
          </linearGradient>
        </defs>
        <path className="folder-pocket-outline" fill="none" stroke={`url(#rim-${uid})`} strokeWidth="2.4"/>
        {/* The face clip keeps the inner half of this stroke: 0.8 CSS pixels at every size. */}
        <path className="folder-pocket-border" fill="none" stroke="white" strokeOpacity=".2" strokeWidth="1.6" vectorEffect="non-scaling-stroke"/>
      </svg>
      {!mini && <div className="folder-copy"><h3 title={p.name}>{p.name||'下一份灵感'}</h3><p>{p.exists===false?'文件夹已移动':p.status==='active'?'正在进行':idle(p.modified||Date.now())}{p.sourceSummary&&<> · {p.sourceSummary.limited?'≥ ':''}{compactSize(p.sourceSummary.bytes)}</>}</p><div className="folder-bottom"><span className="agent-group">{p.agents?.slice(0,3).map(a=><AgentMark key={a} name={a}/>)}</span><span className="folder-front-type">{p.type}</span></div></div>}
    </div>
    {!mini && (p.running?<span className="folder-badge is-running"><Play size={10} fill="currentColor"/>运行中</span>:p.status==='done'?<span className="folder-badge"><Check size={10}/>已完成</span>:null)}
  </div>;
}
export function ActivityChart({projects}){
  const now=new Date();const months=Array.from({length:12},(_,i)=>{const d=new Date(now.getFullYear(),now.getMonth()-11+i,1);return {label:d.getMonth()===0?`${d.getFullYear()} 1月`:`${d.getMonth()+1}月`,count:projects.filter(p=>{const x=new Date(p.modified);return x.getFullYear()===d.getFullYear()&&x.getMonth()===d.getMonth();}).length};});
  const monday=new Date(now);monday.setHours(0,0,0,0);monday.setDate(now.getDate()-(now.getDay()+6)%7);const thisWeek=monday.getTime();
  const bins=[...months,{label:'上周',count:projects.filter(p=>p.modified>=thisWeek-7*86400000&&p.modified<thisWeek).length},{label:'本周',count:projects.filter(p=>p.modified>=thisWeek).length}];const max=Math.max(1,...bins.map(m=>m.count));
  return <div className="activity"><div className="activity-bars">{bins.map((m,i)=><div className="activity-month" key={i} title={`${m.label}：${m.count} 个最近更新的项目`}><span className="bar" style={{height:Math.max(3,m.count/max*38)}}/><small>{m.label}</small></div>)}</div></div>;
}
export function Mascot({flying=false}) {
  const video = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const element = video.current;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncPlayback = () => {
      if (reducedMotion.matches || document.hidden) {
        element.pause();
      } else {
        void element.play().catch(() => setReady(false));
      }
    };
    reducedMotion.addEventListener('change', syncPlayback);
    document.addEventListener('visibilitychange', syncPlayback);
    element.addEventListener('loadeddata', syncPlayback);
    syncPlayback();
    return () => {
      reducedMotion.removeEventListener('change', syncPlayback);
      document.removeEventListener('visibilitychange', syncPlayback);
      element.removeEventListener('loadeddata', syncPlayback);
    };
  }, []);

  return <div className={`mascot ${flying?'flying':''} ${ready?'motion-ready':''}`} aria-hidden="true">
    <img className="mascot-poster" src={flying ? scanCometPoster : idlePoster} alt="" draggable={false}/>
    <video ref={video} className="mascot-motion" src={flying ? scanComet : neonFolderIdle}
      autoPlay loop muted playsInline preload="auto"
      onLoadedData={() => setReady(true)} onError={() => setReady(false)}/>
  </div>;
}
export function ScanScreen({scan,onCancel}){return <div className="scan-screen"><div className="scan-spotlight"/><Mascot flying/><h2><strong>{scan.found}</strong> 个项目已找到</h2><p>{scan.phase==='sessions'?'正在找回上一次的开发记录':'正在翻找你电脑里散落的灵感'}</p><div className="discovery-track"><span/></div><small title={scan.current}>{scan.current}</small><button className="scan-cancel" onClick={onCancel}>停止扫描</button></div>;}
export function SessionActivity({p,context}){
  const start=new Date();start.setHours(0,0,0,0);start.setDate(start.getDate()-357-(start.getDay()+6)%7);const days=Array.from({length:364},(_,i)=>new Date(start.getTime()+i*86400000));const counts=new Map();for(const s of p.sessions||[]){const k=new Date(s.at).toLocaleDateString('en-CA');counts.set(k,(counts.get(k)||0)+1);}
  const tokens=context?.usage?.totalTokens;
  return <section className="session-card"><div className="session-title"><span className="agent-group">{p.agents?.slice(0,2).map(a=><AgentMark key={a} name={a}/>)}</span><strong>{context?.tool||p.agents?.[0]||'本地项目'}</strong><small>{idle(p.modified)}</small></div><div className="session-heatmap" aria-label="最近一年开发会话分布">{days.map(d=>{const n=counts.get(d.toLocaleDateString('en-CA'))||0;return <span key={d.getTime()} className={`heat heat-${Math.min(n,4)}`} title={`${d.toLocaleDateString('zh-CN')} · ${n} 条会话记录`}/>;})}</div><div className="usage-row"><strong>{p.sessions?.length?`${p.sessions.length} 条本地会话记录`:'尚未匹配到开发会话'}</strong>{tokens!=null&&<span>{new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(tokens)} tokens</span>}</div><small className="hint">{tokens!=null?'Token 用量来自最近会话的累计记录':'按本机会话文件的更新时间显示'}</small></section>;
}
export function ProjectDetail({p,details:d,loading,error,onClose,onContinue,onCopyContext,onPreview,onFolder,onEditor,onCopy,onFavorite,onCover,onPasteCover,onRename,onEdit,onHide,previewing,busy,categories,Scroll,Btn,IconBtn,Note}){
  const blankPress=useRef(null);
  useEffect(()=>{
    const editable=target=>target.closest('input, textarea, [contenteditable]:not([contenteditable="false"]), .modal-backdrop');
    const paste=e=>{if(editable(e.target))return;e.preventDefault();onPasteCover();};
    const keys=e=>{if((e.ctrlKey||e.metaKey)&&!e.altKey&&e.key.toLowerCase()==='v')paste(e);};
    window.addEventListener('paste',paste);window.addEventListener('keydown',keys);
    return ()=>{window.removeEventListener('paste',paste);window.removeEventListener('keydown',keys);};
  },[p.id,onPasteCover]);
  const isBlank=target=>target.matches('.project-detail, .detail-stage, .inspector-actions, .detail-content, .detail-content .scroll-content, .detail-content [data-overlayscrollbars-viewport]');
  return <div className="project-detail inspector" role="dialog" aria-modal="true" aria-label={`${p.name} 项目详情`}
    onPointerDown={e=>{blankPress.current=isBlank(e.target)?e.target:null;}}
    onClick={e=>{if(e.target===blankPress.current&&isBlank(e.target))onClose();blankPress.current=null;}}>
    <div className={`detail-ambient color-${p.color||'slate'}`}/><button className="detail-close" aria-label="关闭项目详情" onClick={onClose}><X size={19}/></button>
    <div className="detail-stage"><div className="detail-folder-wrap"><FolderArt p={{...p,running:previewing}} large/></div><div className="inspector-actions"><div className="continue-split"><Btn variant="primary" icon={p.sessions?.length?Sparkles:Play} disabled={p.exists===false} onClick={onContinue}>继续开发</Btn><details className="continue-options"><summary aria-label="继续开发选项"><ChevronDown size={13}/></summary><div><button onClick={onCopyContext}><Copy size={13}/>只复制续作上下文</button><button onClick={onEditor}><Code2 size={13}/>在编辑器打开</button></div></details></div><Btn icon={busy?LoaderCircle:previewing?Square:Play} disabled={busy||loading||p.exists===false||(d?.plan.kind==='none'&&p.type!=='桌面应用')} onClick={onPreview}>{busy?'启动中…':previewing?'停止预览':'运行'}</Btn><IconBtn icon={FolderOpen} label="在资源管理器打开" onClick={onFolder}/><IconBtn icon={Star} label={p.favorite?'取消收藏':'收藏项目'} active={p.favorite} onClick={onFavorite}/></div><p className="continue-hint">复制续作上下文，并打开你的编辑器</p>{d?.plan.kind==='dev'&&<small className="dev-command">预览运行：{d.plan.command}</small>}</div>
    <Scroll className="detail-content inspector-scroll" resetKey={p.id}>
      <div className="detail-preview"><div className="preview-controls"><span>{p.thumbnail?'项目预览':'项目封面'}</span><div><IconBtn icon={ClipboardPaste} label="粘贴剪贴板图片（Ctrl+V）" onClick={onPasteCover}/><IconBtn icon={ImagePlus} label="设置项目封面" onClick={onCover}/><IconBtn icon={ArrowUpRight} label="打开项目预览" disabled={loading||busy||(d?.plan.kind==='none'&&p.type!=='桌面应用')} onClick={onPreview}/></div></div>{p.thumbnail?<img className="detail-preview-image" src={p.thumbnail} alt={`${p.name} 的项目预览`}/>:<div className="preview-placeholder"><Monitor size={38} strokeWidth={1.1}/><strong>{p.name}</strong><span>{p.description||p.stack?.join(' · ')||p.type}</span><button onClick={onPreview} disabled={loading||busy||(d?.plan.kind==='none'&&p.type!=='桌面应用')}><Play size={12}/>打开预览</button><small>预览后自动生成封面，也可自行添加图片</small></div>}</div>
      <SessionActivity p={p} context={d?.context}/>
      {loading&&<div className="detail-loading"><LoaderCircle className="spin" size={15}/>读取项目信息…</div>}{error&&<div className="inline-error"><AlertCircle size={15}/>{error}</div>}
      <section className="detail-section facts"><h4>项目信息</h4><div className="info-row"><span>显示标题</span><button className="detail-title-button" onClick={onRename} title="修改文件夹标题">{p.name}<Pencil size={12}/></button></div><div className="info-row"><span>类型</span><strong>{p.type}</strong></div><div className="info-row"><span>技术栈</span><strong>{p.stack?.join(' / ')||'—'}</strong></div><div className="info-row"><span>源码大小</span><strong>{d?.size?`${d.size.limited?'至少 ':''}${compactSize(d.size.bytes)}`:'正在统计…'}</strong></div><div className="info-row"><span>最近修改</span><strong>{date(p.modified)}</strong></div><div className="info-row"><span>项目位置</span><button title="复制项目路径" className="detail-path" onClick={onCopy}>{p.path}<Copy size={11}/></button></div><small className="hint">源码大小不含依赖、缓存与构建产物</small></section>
      {d?.git.available&&<section className="detail-section"><h4><GitBranch size={14}/>Git 状态</h4><p className="git-branch">{d.git.error||d.git.branch}</p>{!d.git.error&&<small>{d.git.changed?`${d.git.changed} 个已跟踪文件有改动`:'已跟踪文件无改动'}{d.git.commit&&` · ${d.git.commit}`}</small>}</section>}
      <section className="detail-section organize"><h4>整理项目</h4><div className="detail-field"><label>状态</label><select aria-label="项目状态" value={p.status||'paused'} onChange={e=>onEdit({status:e.target.value})}>{[['active','进行中'],['paused','暂时搁置'],['idea','灵感草稿'],['done','已完成']].map(([v,n])=><option key={v} value={v}>{n}</option>)}</select></div><div className="detail-field"><label>分类</label><select aria-label="项目分类" value={p.category||''} onChange={e=>onEdit({category:e.target.value})}><option value="">未分类</option>{categories.map(c=><option key={c}>{c}</option>)}</select></div><div className="detail-field"><label>颜色</label><div className="detail-swatches">{colorNames.map(([v,n])=><button key={v} className={`swatch color-${v} ${(p.color||'slate')===v?'picked':''}`} aria-label={`标记为${n}`} title={n} onClick={()=>onEdit({color:v})}/>)}</div></div><Note key={p.id} note={p.note||''} onSave={note=>onEdit({note})}/></section>
      {d?.context?.lastPrompt&&<section className="detail-section"><h4><Sparkles size={14}/>最近开发任务</h4><p className="context-text">{d.context.lastPrompt}</p><Btn icon={Copy} onClick={onContinue}>复制上下文继续</Btn></section>}
      {d?.readme&&<section className="detail-section"><h4><FileText size={14}/>README</h4><pre className="readme">{d.readme.slice(0,5000)}</pre></section>}
      <div className="inspector-bottom"><button onClick={onEditor}><Code2 size={14}/>在编辑器打开</button><button onClick={onHide}>{p.hidden?'恢复显示':'隐藏这个项目'}</button></div>
    </Scroll>
  </div>;
}
