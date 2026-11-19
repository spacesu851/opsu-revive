const {DatabaseSync} = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const key = p => path.resolve(p).replaceAll('\\','/').toLowerCase().replace(/\/$/,'');
const idFor = p => crypto.createHash('sha256').update(key(p)).digest('hex').slice(0,24);
const projectFromRow=r=>{const data=JSON.parse(r.data),meta=JSON.parse(r.meta);return {...data,...meta,originalName:data.name,name:meta.title||data.name};};
class Library {
  constructor(file) {
    fs.mkdirSync(path.dirname(file),{recursive:true});
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, pathkey TEXT UNIQUE NOT NULL, data TEXT NOT NULL, meta TEXT NOT NULL DEFAULT \'{}\');');
  }
  get(name, fallback) {const r=this.db.prepare('SELECT value FROM settings WHERE key=?').get(name); return r?JSON.parse(r.value):fallback;}
  set(name,value) {this.db.prepare('INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(name,JSON.stringify(value)); return value;}
  all() {return this.db.prepare('SELECT data,meta FROM projects').all().map(projectFromRow);}
  present() {return this.all().filter(project=>project.exists!==false);}
  markMissing(projects) {
    const setMissing=this.db.prepare("UPDATE projects SET data=json_set(data, '$.exists', json('false')) WHERE id=?");
    this.db.exec('BEGIN');
    try{for(const project of projects)setMissing.run(project.id);this.db.exec('COMMIT');}
    catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  one(id) {const r=this.db.prepare('SELECT data,meta FROM projects WHERE id=?').get(id);if(!r)throw new Error('找不到这个项目，请重新扫描。');return projectFromRow(r);}
  upsert(projects) {
    const stmt=this.db.prepare('INSERT INTO projects(id,pathkey,data) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data');
    this.db.exec('BEGIN');try{for(const p of projects){const data={...p,name:p.originalName??p.name};delete data.originalName;delete data.title;stmt.run(p.id,key(p.path),JSON.stringify(data));}this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  edit(id, changes) {
    const r=this.db.prepare('SELECT meta FROM projects WHERE id=?').get(id);if(!r)throw new Error('项目已不存在。');
    const allowed={};
    if(typeof changes.title==='string')allowed.title=changes.title.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,120);
    for(const k of ['favorite','hidden'])if(typeof changes[k]==='boolean')allowed[k]=changes[k];
    for(const k of ['category','color','note','status'])if(typeof changes[k]==='string')allowed[k]=changes[k].slice(0,k==='note'?10000:80);
    if(typeof changes.executable==='string'&&changes.executable.length<=32767&&path.isAbsolute(changes.executable)&&/\.exe$/i.test(changes.executable))allowed.executable=changes.executable;
    if(allowed.color&&!['slate','blue','violet','pink','coral','amber','green','cyan'].includes(allowed.color))delete allowed.color;
    if(allowed.status&&!['active','paused','done','idea'].includes(allowed.status))delete allowed.status;
    this.db.prepare('UPDATE projects SET meta=? WHERE id=?').run(JSON.stringify({...JSON.parse(r.meta),...allowed}),id);
    return this.one(id);
  }
  close(){this.db.close();}
}
module.exports={Library,key,idFor};
