/**
 * Render the approved deep-blue Super Day clock/check mark to PNG assets with
 * no additional graphics dependencies. Runs before each static build.
 *
 * This deliberately preserves the existing icon geometry: clock tick marks,
 * central blue circle and white completion tick, with no outer light border.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG=[11,18,32],BLUE=[8,102,255],WHITE=[255,255,255];
const rays=[
  [256,99,256,132],[256,380,256,413],
  [99,256,132,256],[380,256,413,256],
  [145,145,168,168],[344,344,367,367],
  [145,367,168,344],[344,168,367,145]
];
const segments=[[218,255,245,283],[245,283,297,226]];
function lineDist2(x,y,x1,y1,x2,y2){
  const dx=x2-x1,dy=y2-y1;
  const t=Math.max(0,Math.min(1,((x-x1)*dx+(y-y1)*dy)/(dx*dx+dy*dy)));
  const ax=x1+t*dx-x,ay=y1+t*dy-y;
  return ax*ax+ay*ay;
}
function sampleIcon(x,y,scale=1){
  const ix=(x-256)/scale+256,iy=(y-256)/scale+256;
  const d=(ix-256)*(ix-256)+(iy-256)*(iy-256);
  if(d<=84*84){
    for(const [x1,y1,x2,y2] of segments)
      if(lineDist2(ix,iy,x1,y1,x2,y2)<=8*8)return WHITE;
    return BLUE;
  }
  for(const [x1,y1,x2,y2] of rays)
    if(lineDist2(ix,iy,x1,y1,x2,y2)<=9*9)return BLUE;
  return BG;
}
function iconPixels(size,scale=1){
  const out=Buffer.alloc(size*size*3);
  for(let y=0;y<size;y++){
    for(let x=0;x<size;x++){
      const accum=[0,0,0];
      // Four coverage samples produce smooth diagonal check and circular edges.
      for(const oy of [.25,.75])for(const ox of [.25,.75]){
        const c=sampleIcon((x+ox)*512/size,(y+oy)*512/size,scale);
        for(let k=0;k<3;k++)accum[k]+=c[k];
      }
      const p=(y*size+x)*3;
      for(let k=0;k<3;k++)out[p+k]=Math.round(accum[k]/4);
    }
  }
  return out;
}
const crcTable=Array.from({length:256},(_,n)=>{
  let c=n;for(let j=0;j<8;j++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);
  return c>>>0;
});
function crc32(data){
  let c=0xffffffff;
  for(const b of data)c=crcTable[(c^b)&255]^(c>>>8);
  return (c^0xffffffff)>>>0;
}
function chunk(name,data){
  const type=Buffer.from(name),length=Buffer.alloc(4),crc=Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  crc.writeUInt32BE(crc32(Buffer.concat([type,data])));
  return Buffer.concat([length,type,data,crc]);
}
function png(width,height,rgb){
  const scan=Buffer.alloc(height*(width*3+1));
  for(let y=0;y<height;y++)rgb.copy(scan,y*(width*3+1)+1,y*width*3,(y+1)*width*3);
  const header=Buffer.alloc(13);
  header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);
  header[8]=8;header[9]=2;
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    chunk('IHDR',header),chunk('IDAT',deflateSync(scan,{level:9})),
    chunk('IEND',Buffer.alloc(0))
  ]);
}
function write(name,width,height,data){
  writeFileSync('public/icons/'+name,png(width,height,data));
}
mkdirSync('public/icons',{recursive:true});
for(const [name,size,scale] of [
  ['icon-192.png',192,1],
  ['icon-512.png',512,1],
  ['maskable-512.png',512,.79],
  ['apple-touch-icon.png',180,1]
])write(name,size,size,iconPixels(size,scale));

// Match the iPhone standalone startup splash to the dark-blue Super Content
// palette; old orange splash images are replaced on each build.
for(const [width,height] of [
  [1170,2532],[1179,2556],[1206,2622],
  [1290,2796],[1320,2868],[750,1334]
]){
  const data=Buffer.alloc(width*height*3);
  for(let i=0;i<data.length;i+=3){
    data[i]=BG[0];data[i+1]=BG[1];data[i+2]=BG[2];
  }
  const iconSize=width<900?260:350;
  const icon=iconPixels(iconSize);
  const startX=Math.floor((width-iconSize)/2);
  const startY=Math.floor(height*.45-iconSize/2);
  for(let y=0;y<iconSize;y++){
    const offset=((startY+y)*width+startX)*3;
    icon.copy(data,offset,y*iconSize*3,(y+1)*iconSize*3);
  }
  write('splash-'+width+'-'+height+'.png',width,height,data);
}
