const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
const sizes = [16,20,24,32,40,48,64,96,128,256];
async function check(png, size) {
  const {data, info} = await sharp(png).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  if(info.width!==size||info.height!==size||info.channels!==4) throw Error('Wrong frame '+size);
  const corners=[0,size-1,size*(size-1),size*size-1].map(i=>data[i*4+3]);
  if(corners.some(Boolean)) throw Error('Opaque corner '+size);
  if(data[(Math.floor(size*.4)*size+Math.floor(size*.5))*4+3]<250) throw Error('Transparent glass interior '+size);
  return {size,corners,channels:4};
}
(async()=>{
  const write=(p,b)=>fs.writeFileSync(path.join(root,p),b);
  const source=path.join(root,'build/icon-master.png');
  const meta=await sharp(source).metadata();
  if(meta.width!==meta.height||!meta.hasAlpha)throw Error('Master must be square RGBA');
  await check(await sharp(source).png().toBuffer(),meta.width);
  const small=fs.readFileSync(path.join(root,'build/icon-small.svg'),'utf8');
  const images=[];const report=[];
  const header=Buffer.alloc(6+16*sizes.length);
  header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);let offset=header.length;
  for(const [i,size] of sizes.entries()){
    // Small sizes retain a purpose-drawn bold outline and reduced texture.
    const png=await sharp(size<=48?Buffer.from(small):source).resize(size,size).png().toBuffer();
    images.push(png);report.push(await check(png,size));
    if(size===16||size===32)write('public/icon-'+size+'.png',png);
    const at=6+16*i;header[at]=size%256;header[at+1]=size%256;
    header.writeUInt16LE(1,at+4);header.writeUInt16LE(32,at+6);
    header.writeUInt32LE(png.length,at+8);header.writeUInt32LE(offset,at+12);offset+=png.length;
  }
  const master=await sharp(source).resize(512,512).png().toBuffer();
  write('build/icon.png',master);write('public/icon.png',master);
  // A full-resolution window source lets Electron select each DPI size cleanly.
  write('build/window-icon.png',await sharp(source).resize(256,256).png().toBuffer());
  const ico=Buffer.concat([header,...images]);write('build/icon.ico',ico);
  // Re-read every embedded ICO frame to verify the bytes that Windows consumes.
  for(let i=0;i<sizes.length;i++){const e=6+16*i;await check(ico.subarray(ico.readUInt32LE(e+12),ico.readUInt32LE(e+12)+ico.readUInt32LE(e+8)),sizes[i]);}
  const previous=JSON.parse(fs.readFileSync(path.join(root,'build/brand.json'),'utf8'));
  write('build/brand.json',JSON.stringify({...previous,revision:'20261118-glass',master:'icon-master.png',smallSource:'icon-small.svg',generator:'image_gen for glass master; native SVG for optically adapted small sizes',alphaVerified:report},null,2)+'\n');
  const proof=[];
  for(const [row,bg]of ['#eeeeee','#202124'].entries()){
    proof.push({input:await sharp(source).resize(256,256).flatten({background:bg}).png().toBuffer(),left:20,top:row*300+20});
    for(const [col,size]of sizes.entries()){
      proof.push({input:images[col],left:310+col*50+Math.floor((48-size)/2),top:row*300+70});
      if(size>=48)break;
    }
    proof.push({input:await sharp(images[0]).resize(64,64,{kernel:'nearest'}).flatten({background:bg}).png().toBuffer(),left:330,top:row*300+145});
    proof.push({input:await sharp(images[3]).resize(96,96,{kernel:'nearest'}).flatten({background:bg}).png().toBuffer(),left:430,top:row*300+145});
  }
  const background=await sharp({create:{width:650,height:600,channels:4,background:'#eeeeee'}}).png().toBuffer();
  const lower=await sharp({create:{width:650,height:300,channels:4,background:'#202124'}}).png().toBuffer();
  await sharp(background).composite([{input:lower,left:0,top:300},...proof]).png().toFile(path.join(root,'build/icon-proof.png'));
  console.log(JSON.stringify({master:meta.width,frames:report.length,alpha:'all corners transparent',report}));
})().catch(e=>{console.error(e);process.exitCode=1;});

