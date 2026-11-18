const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {previewPlan}=require('../electron/preview.cjs');
const {Library,idFor}=require('../electron/library.cjs');
const work=path.resolve(__dirname,'../../../work');
async function fixture(){await fs.mkdir(work,{recursive:true});return fs.mkdtemp(path.join(work,'desktop-launch-'));}
async function write(root,file,text='fixture'){await fs.mkdir(path.dirname(path.join(root,file)),{recursive:true});await fs.writeFile(path.join(root,file),text);}
test('桌面应用优先打开构建 EXE，忽略网页入口、安装器和辅助程序',async()=>{
  const root=await fixture();await write(root,'package.json',JSON.stringify({name:'test-desktop',productName:'测试应用',build:{directories:{output:'release'}}}));
  await write(root,'dist/index.html','<h1>renderer</h1>');await write(root,'release/Test-Desktop-Setup.exe');await write(root,'release/win-unpacked/elevate.exe');await write(root,'release/win-unpacked/测试应用.exe');
  const plan=await previewPlan({path:root,type:'桌面应用',name:'测试应用',scripts:{dev:'vite',start:'electron .'}});
  assert.equal(plan.kind,'desktop');assert.equal(plan.exe,path.join(root,'release/win-unpacked/测试应用.exe'));
  assert.equal((await previewPlan({path:root,type:'网页'})).kind,'static');
});
test('自定义输出目录中的应用可识别，不从依赖和 resources 中选程序',async()=>{
  const root=await fixture();await write(root,'package.json',JSON.stringify({productName:'My Tool',build:{directories:{output:'artifacts/windows'}}}));
  await write(root,'artifacts/windows/My Tool.exe');await write(root,'node_modules/My Tool.exe');await write(root,'release/resources/My Tool.exe');
  assert.equal((await previewPlan({path:root,type:'桌面应用'})).exe,path.join(root,'artifacts/windows/My Tool.exe'));
});
test('无构建或有多个不明 EXE 时要求选择，不退回网页或启动安装器',async()=>{
  const root=await fixture();await write(root,'dist/index.html','<h1>renderer</h1>');await write(root,'release/App-Setup.exe');await write(root,'release/Uninstall App.exe');
  assert.equal((await previewPlan({path:root,type:'桌面应用',scripts:{dev:'vite'}})).kind,'none');
  await write(root,'release/First.exe');await write(root,'release/Second.exe');assert.equal((await previewPlan({path:root,type:'桌面应用'})).kind,'none');
});
test('手动选择的 EXE 重扫、重启后保留，失效后重新查找且不接受非 EXE',async()=>{
  const root=await fixture(),outside=await fixture(),exe=path.join(outside,'已安装程序.exe');await write(outside,'已安装程序.exe');
  const file=path.join(root,'library.sqlite'),p={id:idFor(root),path:root,name:'项目',type:'桌面应用'};let db=new Library(file);db.upsert([p]);db.edit(p.id,{executable:exe});db.upsert([p]);db.close();db=new Library(file);
  assert.equal((await previewPlan(db.one(p.id))).exe,exe);db.edit(p.id,{executable:path.join(outside,'bad.txt')});assert.equal(db.one(p.id).executable,exe);
  await fs.rename(exe,path.join(outside,'moved.exe'));assert.equal((await previewPlan(db.one(p.id))).kind,'none');db.close();
});
