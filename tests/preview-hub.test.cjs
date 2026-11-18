const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const {createPreviewHubClient,directoryKey}=require('../electron/preview-hub.cjs');

async function hub(t,projects){
  const requests=[];
  const server=http.createServer((req,res)=>{
    requests.push({url:req.url,method:req.method,headers:req.headers});
    if(req.method==='POST'){
      const entry=projects.find(p=>req.url===`/api/projects/${p.id}/start`);
      if(entry)entry.running=true;
    }
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({app:'spacesu-preview-hub',projects}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin=`http://127.0.0.1:${server.address().port}`;
  return {origin,requests,client:createPreviewHubClient({origin,configFiles:[]})};
}

test('复用在线预览，只读匹配共享缓存，关闭不停止共享服务',async t=>{
  const {client,requests}=await hub(t,[{id:'demo',directory:'E:\\Codex\\Example',url:'http://127.0.0.1:5207/',running:true}]);
  const [first,second]=await Promise.all([client.find({path:'D:/Codex/Example'}),client.find({path:'E:/Codex/Example'})]);
  assert.equal(first.kind,'hub');assert.deepEqual(first,second);assert.equal(requests.length,1);
  const runtime=await client.start(first);assert.equal(runtime.url,'http://127.0.0.1:5207/');await runtime.stop();
  assert.equal(requests.filter(r=>r.method==='POST').length,0);
});

test('仅启动所选离线项目，使用预览台要求的本机控制请求头',async t=>{
  const {client,requests,origin}=await hub(t,[{id:'demo',directory:'E:/Codex/Example',url:'http://127.0.0.1:5207/',running:false}]);
  const plan=await client.find({path:'E:/Codex/Example'});await client.start(plan);
  const posts=requests.filter(r=>r.method==='POST');assert.equal(posts.length,1);assert.equal(posts[0].url,'/api/projects/demo/start');
  assert.equal(posts[0].headers.origin,origin);assert.equal(posts[0].headers['x-preview-hub'],'local-control');
});

test('按实际目录匹配单个 frontend，拒绝同名、模糊祖先和远程预览',async t=>{
  const {client}=await hub(t,[{id:'frontend',name:'Same name',directory:'E:/Codex/GoodJob/frontend',url:'http://127.0.0.1:5224/',running:true},{id:'remote',directory:'E:/Codex/Remote',url:'https://example.com/',running:true}]);
  assert.equal((await client.find({path:'E:/Codex/GoodJob'})).hubId,'frontend');
  assert.equal(await client.find({path:'E:/Codex',name:'Same name'}),null);
  assert.equal(await client.find({path:'E:/Elsewhere',name:'Same name'}),null);
  assert.equal(await client.find({path:'E:/Codex/Remote'}),null);
  assert.equal(directoryKey('C:/Users/old/Documents/Codex/Example'),'e:/codex/example');
});

test('预览台不可用时按已有配置找到 frontend/dist/client 本地构建',async t=>{
  const root=await fs.mkdtemp(path.resolve(__dirname,'../../../work/hub-fallback-'));
  const output=path.join(root,'frontend/dist/client');await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'index.html'),'preview');
  const file=path.join(root,'projects.json');await fs.writeFile(file,JSON.stringify([{id:'demo',directory:path.join(root,'frontend'),output:'dist/client'}]));
  const server=http.createServer((_q,r)=>{r.writeHead(503);r.end();});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
  const client=createPreviewHubClient({origin:`http://127.0.0.1:${server.address().port}`,configFiles:[file]});
  const plan=await client.find({path:root});assert.equal(plan.kind,'static');assert.equal(plan.root,output);
});
