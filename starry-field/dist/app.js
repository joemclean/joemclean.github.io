import {TAU} from './dynamics.js';
import {FramePainter} from './painter.js';

const $=id=>document.getElementById(id),canvas=$('world');
const gl=canvas.getContext('webgl2',{antialias:true,alpha:false,powerPreference:'high-performance'});
if(!gl){$('error').hidden=false;$('error').textContent='This experiment needs WebGL 2. Try a browser with hardware graphics enabled.';throw Error('WebGL2 unavailable');}
const coarse=matchMedia('(pointer:coarse)').matches;
$('panel').hidden=true;
$('settings').setAttribute('aria-expanded',String(!$('panel').hidden));
let seed=88;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const mul=(a,s)=>a.map(v=>v*s);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>mul(a,1/(Math.hypot(...a)||1));
const color=s=>[parseInt(s.slice(1,3),16)/255,parseInt(s.slice(3,5),16)/255,parseInt(s.slice(5,7),16)/255];
const triangles=[],obstacles=[],cypresses=[];
const mapBounds={minX:-83,maxX:83,minZ:-66,maxZ:116};
const worldWidth=mapBounds.maxX-mapBounds.minX,worldDepth=mapBounds.maxZ-mapBounds.minZ;
function wrapCoordinate(value,min,max){const span=max-min;return min+((value-min)%span+span)%span;}
function periodicDelta(value,center,span){return value-center-Math.round((value-center)/span)*span;}
function hill(x,z,cx,cz,rx,rz){const dx=Math.sin(Math.PI*(x-cx)/worldWidth)*worldWidth/Math.PI, dz=Math.sin(Math.PI*(z-cz)/worldDepth)*worldDepth/Math.PI;return Math.exp(-((dx/rx)**2+(dz/rz)**2));}
const riverCenter=x=>4+2.6*Math.sin(x/worldWidth*TAU);
const bridgeZ=riverCenter(6);
const lakeRadius=(x,z)=>Math.hypot((x+29)/13,(z-56)/10);
const paths=[
 [[0,24],[6,13],[6,-3],[8,-9],[8,-24]],
 [[8,-24],[14,-24],[22,-28],[31,-26]],
 [[8,-24],[-9,-24],[-27,-27],[-39,-34]],
 [[6,13],[23,17],[38,23],[46,33]],
 [[0,24],[3,34],[12,45],[24,61],[24,77]],
 [[3,34],[-10,42],[-12,57],[-22,70],[-43,84],[-53,90]],
 [[24,61],[48,65],[55,83],[40,101],[7,98],[-22,70]],
 [[6,-3],[-7,-8],[-9,-17],[-9,-24]],
 [[-9,-17],[-18,-16],[-29,-16],[-39,-21],[-39,-34]],
 [[8,-9],[21,-9],[34,-10],[43,-20],[43,-36],[31,-26]],
 [[14,-24],[14,-36],[0,-44],[-18,-39],[-27,-27]],
 [[21,-9],[21,-19],[14,-24]],
 [[-18,-16],[-18,-5],[-34,-3],[-43,-5],[-43,-16],[-39,-21]],
 [[6,13],[-8,16],[-23,19],[-39,20],[-50,29],[-39,39],[-10,42]],
 [[-39,20],[-43,9],[-43,-5]],
 [[-23,19],[-23,27],[-10,42]],
 [[23,17],[34,8],[34,-10]],
 [[38,23],[54,34],[62,48],[48,65]],
 [[-12,57],[-10,67],[-22,70]],
 [[24,77],[34,80],[34,91],[7,98]],
 [[34,-10],[52,-12],[61,-26],[55,-43],[34,-39]],
 [[-43,-16],[-61,-14],[-64,-32],[-48,-34]],
 [[-39,39],[-47,48],[-46,63],[-43,74],[-43,84]],
 [[-10,67],[5,69],[13,76],[24,77]],
 [[-53,90],[-62,96],[-66,102]],
 [[-47,48],[-47,53],[-42.6,53]],
 [[38,23],[58,20],[70,20],[83,20]],
 [[-83,20],[-73,20],[-61,23],[-50,29]],
 [[55,-43],[70,-54],[83,-54]],
 [[-83,-54],[-70,-54],[-64,-32]],
 [[70,-66],[70,-54],[70,-14],[70,20],[70,64],[70,102],[70,116]],
 [[-73,-66],[-73,-43],[-73,-14],[-73,20],[-73,64],[-73,101],[-73,116]],
 [[62,48],[70,64]],
 [[-73,101],[-73,95],[-62,96]],
 [[7,98],[7,116]],
 [[7,-66],[7,-56],[0,-44]],
 [[-18,-39],[-25,-50],[-35,-54],[-43,-54],[-70,-54]],
 [[40,101],[55,102],[70,102]],
];
const landing={minX:-42.5,maxX:-39.5,minZ:52.8,maxZ:58.15,y:.61};
const onLanding=(x,z)=>x>=landing.minX&&x<=landing.maxX&&z>=landing.minZ&&z<=landing.maxZ;
const bridges=[{x:6,z:bridgeZ,width:6},{x:-43,z:riverCenter(-43),width:5},{x:34,z:riverCenter(34),width:5},{x:70,z:riverCenter(70),width:5},{x:-73,z:riverCenter(-73),width:5}];
function ground(x,z){
 const u=x/worldWidth*TAU,v=z/worldDepth*TAU;
 let base=1.8+1.5*Math.sin(u+v)+1.1*Math.cos(v);
 base+=8*hill(x,z,0,-53,100,13)*(1+.35*Math.sin(u*4));
 base+=7*hill(x,z,31,-32,15,13)+8*hill(x,z,24,82,18,18)+4*hill(x,z,-48,92,24,20);
 // Small hills on the outer circuit add a changing skyline without scenery walls.
 base+=5*hill(x,z,75,80,16,24)+5*hill(x,z,-75,-35,15,18);
 const localX=wrapCoordinate(x,mapBounds.minX,mapBounds.maxX),localZ=wrapCoordinate(z,mapBounds.minZ,mapBounds.maxZ);
 const shore=clamp((lakeRadius(localX,localZ)-.85)/.4,0,1);base=-.7*(1-shore)+base*shore;
 const bank=clamp((Math.abs(periodicDelta(z,riverCenter(x),worldDepth))-2.6)/3,0,1);
 return -.8*(1-bank)+base*bank;
}
function height(x,z){
 const y=ground(x,z);x=wrapCoordinate(x,mapBounds.minX,mapBounds.maxX);z=wrapCoordinate(z,mapBounds.minZ,mapBounds.maxZ);
 if(onLanding(x,z))return Math.max(y,landing.y);
 for(const b of bridges)if(Math.abs(periodicDelta(x,b.x,worldWidth))<=b.width/2&&Math.abs(periodicDelta(z,b.z,worldDepth))<8){const t=1-Math.abs(periodicDelta(z,b.z,worldDepth))/8;return Math.max(y,4.2*Math.sin(t*Math.PI*.5));}
 return y;
}
function groundColor(x,z){
 const u=x/worldWidth*TAU,v=z/worldDepth*TAU,t=.5+.5*Math.sin(u*2+v);
 let c=color('#345356').map((a,i)=>a*(1-t)+color('#6e7c55')[i]*t);
 const gold=.65*hill(x,z,46,55,23,34),stone=.55*hill(x,z,0,-53,80,12);
 c=c.map((a,i)=>(a*(1-gold)+color('#a19b61')[i]*gold)*(1-stone)+color('#3e5870')[i]*stone);
 return c;
}
function groundNormal(x,z){return norm([ground(x-.1,z)-ground(x+.1,z),.2,ground(x,z-.1)-ground(x,z+.1)]);}
function pathDistance(x,z){let closest=Infinity;for(const route of paths)for(let i=1;i<route.length;i++){const [ax,az]=route[i-1],[bx,bz]=route[i],dx=bx-ax,dz=bz-az,t=clamp(((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz),0,1);closest=Math.min(closest,Math.hypot(x-ax-dx*t,z-az-dz*t));}return closest;}
function triangle(a,b,c,col){
 const n=norm(cross(sub(b,a),sub(c,a)));
 for(const p of [a,b,c])triangles.push(...p,...n,...col);
}
function quad(a,b,c,d,col,density=3,angle=0){triangle(a,b,c,col,density,angle);triangle(a,c,d,col,density,angle);}
function box(x,y,z,w,h,d,col,density=4,collision=true){
 const a=[x-w/2,y,z-d/2],b=[x+w/2,y,z-d/2],c=[x+w/2,y+h,z-d/2],e=[x-w/2,y+h,z-d/2];
 const f=[x-w/2,y,z+d/2],g=[x+w/2,y,z+d/2],i=[x+w/2,y+h,z+d/2],j=[x-w/2,y+h,z+d/2];
 quad(f,g,i,j,col,density,Math.PI/2);quad(b,a,e,c,col,density,Math.PI/2);quad(a,f,j,e,col,density,Math.PI/2);quad(g,b,c,i,col,density,Math.PI/2);quad(e,j,i,c,col,density);
 if(collision)obstacles.push({x,z,w:w+.9,d:d+.9});
}
function roof(x,y,z,w,d,h,col){
 const a=[x-w/2,y,z-d/2],b=[x+w/2,y,z-d/2],c=[x+w/2,y,z+d/2],e=[x-w/2,y,z+d/2],f=[x,y+h,z-d/2],g=[x,y+h,z+d/2];
 quad(a,e,g,f,col,4,.15);quad(b,f,g,c,col,4,.15);triangle(a,f,b,col,4);triangle(e,c,g,col,4);
}
// The game renderer supplies an ordinary color frame and a depth buffer.
const columns=coarse?64:80,rows=coarse?72:88;
for(let i=0;i<columns;i++)for(let j=0;j<rows;j++){
 const x=mapBounds.minX+i*worldWidth/columns,z=mapBounds.minZ+j*worldDepth/rows,dx=worldWidth/columns,dz=worldDepth/rows;
 const corners=[[x,ground(x,z),z],[x,ground(x,z+dz),z+dz],[x+dx,ground(x+dx,z+dz),z+dz],[x+dx,ground(x+dx,z),z]];
 for(const indices of [[0,1,2],[0,2,3]])for(const k of indices){const point=corners[k];triangles.push(...point,...groundNormal(point[0],point[2]),...groundColor(point[0],point[2]));}
}
const churchY=height(3,-19)-.4;
box(3,churchY,-19,4,5,9,color('#929d9d'),5);roof(3,churchY+5,-19,4.4,9.4,2,color('#294760'));
box(3,churchY,-13.9,2.3,9,2.3,color('#adb09b'),6);
const sp=[3,churchY+15,-13.9],sy=churchY+9;
for(const [a,b] of [[[1.5,sy,-15.4],[4.5,sy,-15.4]],[[4.5,sy,-15.4],[4.5,sy,-12.4]],[[4.5,sy,-12.4],[1.5,sy,-12.4]],[[1.5,sy,-12.4],[1.5,sy,-15.4]]])triangle(a,sp,b,color('#253c52'),7,Math.PI/2);
function tree(x,z,h,r){
 // Keep the whole crown off the water, including the river's curved banks.
 if(Math.abs(z-riverCenter(x))<2.8+r+.8||lakeRadius(x,z)<1.03+(r+.6)/10)return false;
 cypresses.push({x,z,h,r});
 const y=height(x,z),rings=h>12?10:6,sides=h>12?12:8;
 const pts=(level,k)=>{const t=level/rings,a=k/sides*TAU,rad=r*Math.pow(1-t,.8)*(1+.14*Math.sin(k*3+level));return [x+Math.cos(a)*rad+Math.sin(t*4)*.6,y+t*h,z+Math.sin(a)*rad];};
 for(let j=0;j<rings;j++)for(let k=0;k<sides;k++)quad(pts(j,k),pts(j+1,k),pts(j+1,k+1),pts(j,k+1),color(['#18392e','#244b37','#223d3e'][k%3]),5,Math.PI/2);
 obstacles.push({x,z,w:r*1.2,d:r*1.2});
}

for(let i=0;i<14;i++){const x=(random()-.5)*90,z=-37-random()*14;if(pathDistance(x,z)>3.5)tree(x,z,4+random()*4,1);}

// River, paths, and landmarks are ordinary game geometry; the painter receives
// the resulting frame without knowing which objects produced it.
for(let i=0;i<112;i++){
 const x=mapBounds.minX+i*worldWidth/112,step=worldWidth/112;
 const a=riverCenter(x),b=riverCenter(x+step);
 quad([x,.25,a-2.8],[x,.25,a+2.8],[x+step,.25,b+2.8],[x+step,.25,b-2.8],color(x%3<1.5?'#2b6078':'#3b738b'));
 for(let k=0;k<3;k++){const z=a-2+k*1.7;quad([x,.27,z],[x+.9,.27,z+.08],[x+.9,.27,z+.3],[x,.27,z+.2],color('#7ca59c'));}
}
function path(route,width=2.8){
 for(let i=1;i<route.length;i++){
  const [ax,az]=route[i-1],[bx,bz]=route[i],dx=bx-ax,dz=bz-az,len=Math.hypot(dx,dz),steps=Math.ceil(len),nx=-dz/len*width/2,nz=dx/len*width/2;
  for(let j=0;j<steps;j++){const t=j/steps,u=(j+1)/steps,x=ax+dx*t,z=az+dz*t,xx=ax+dx*u,zz=az+dz*u;
   const point=(px,pz)=>[px,height(px,pz)+.1,pz];quad(point(x+nx,z+nz),point(x-nx,z-nz),point(xx-nx,zz-nz),point(xx+nx,zz+nz),color(['#a99c72','#8b8968','#b2a47b'][j%3]));
  }
 }
}
paths.forEach(route=>path(route));
// Broad bridge ramps share the same height function as the walking camera.
for(let z=bridgeZ-8;z<bridgeZ+8;z+=.5){
 quad([3,height(3,z)+.12,z],[9,height(9,z)+.12,z],[9,height(9,z+.5)+.12,z+.5],[3,height(3,z+.5)+.12,z+.5],color(z%1<.5?'#a5a494':'#8d948d'));
}
for(const x of [2.85,9.15]){
 for(let z=bridgeZ-5;z<bridgeZ+5;z+=1.5)box(x,height(clamp(x,3,9),z)+.1,z,.45,.85,1.45,color('#919a94'),3);
}
function roundTower(x,y,z,r,h,col,sides=12,topRadius=r){
 for(let k=0;k<sides;k++){const a=k/sides*TAU,b=(k+1)/sides*TAU;
  quad([x+r*Math.cos(a),y,z+r*Math.sin(a)],[x+topRadius*Math.cos(a),y+h,z+topRadius*Math.sin(a)],[x+topRadius*Math.cos(b),y+h,z+topRadius*Math.sin(b)],[x+r*Math.cos(b),y,z+r*Math.sin(b)],color(col));
  triangle([x,y+h,z],[x+topRadius*Math.cos(a),y+h,z+topRadius*Math.sin(a)],[x+topRadius*Math.cos(b),y+h,z+topRadius*Math.sin(b)],color(col));
 }
}
// A fountain courtyard gives the village a destination and open walking space.
const plazaY=height(-3,-18);
for(let k=0;k<32;k++){const a=k/32*TAU,b=(k+1)/32*TAU;triangle([-3,plazaY+.13,-18],[-3+5*Math.cos(a),height(-3+5*Math.cos(a),-18+5*Math.sin(a))+.13,-18+5*Math.sin(a)],[-3+5*Math.cos(b),height(-3+5*Math.cos(b),-18+5*Math.sin(b))+.13,-18+5*Math.sin(b)],color(k%2?'#858986':'#a4a28c'));}
roundTower(-3,plazaY,-18,1.4,.7,'#929f9a');roundTower(-3,plazaY+.72,-18,1.15,.03,'#407789');roundTower(-3,plazaY+.73,-18,.2,1.5,'#b1b19a');obstacles.push({x:-3,z:-18,w:3.1,d:3.1});
// Hilltop windmill, with a silhouette large enough to navigate toward.
const millX=31,millZ=-32,millY=height(millX,millZ);
roundTower(millX,millY,millZ,2.4,9,'#c2b795',12,1.7);roundTower(millX,millY+9,millZ,2.1,3,'#334a64',12,0);
obstacles.push({x:millX,z:millZ,w:5.4,d:5.4});
box(millX,millY+.1,millZ+2.35,.95,2.4,.12,color('#2a3b40'),3,false);
const hub=[millX,millY+8,millZ+1.95];
for(let k=0;k<4;k++){const a=.3+k*Math.PI/2,along=[Math.cos(a),Math.sin(a)],across=[-along[1],along[0]];
 const p=(r,w)=>[hub[0]+along[0]*r+across[0]*w,hub[1]+along[1]*r+across[1]*w,hub[2]];
 quad(p(.25,-.18),p(6,-.18),p(6,.18),p(.25,.18),color('#a59167'));
 for(let j=0;j<6;j++)quad(p(1+j*.75,.15),p(1.6+j*.75,.15),p(1.6+j*.75,1.1),p(1+j*.75,1.1),color(j%2?'#d7c997':'#bdb68a'));
}
// Orchard and garden patches bring rounded foliage and warm color into the town.
for(let i=0;i<4;i++)for(let j=0;j<3;j++){
 const x=-27-i*5,z=-22-j*6,y=height(x,z);if(pathDistance(x,z)<2.3)continue;box(x,y,z,.5,3,.5,color('#514838'),3,false);
 roundTower(x,y+2,z,2.3,2.7,i%2?'#426653':'#596c45',8,.45);obstacles.push({x,z,w:1.6,d:1.6});
 for(let k=0;k<4;k++){const a=k*2.4;roundTower(x+Math.sin(a)*1.5,y+3.2,z+Math.cos(a)*1.5,.3,.25,'#b69852',6,.1);}
}
for(let row=0;row<5;row++){
 const x=24+row*3,z=25;path([[x,z-5],[x,z+5]],1.4);
 for(let j=0;j<10;j++){const zz=z-4+j*.9,y=height(x,zz);roundTower(x,y,zz,.48,.5,['#c5a65a','#839853','#ad7951'][row%3],6,.12);}
}
for(const [x,z] of [[6,12],[6,-3],[3,-9],[12,-23],[22,-28],[-14,-22],[-27,-27]]){
 const y=height(x+2,z);box(x+2,y,z,.14,2.8,.14,color('#354a4a'),3,false);box(x+2,y+2.5,z,.5,.65,.5,color('#edcc76'),3,false);
}
// The rear landscape is connected to the starting meadow by a branching loop.
// Water and landmarks leave the paths clear so exploration has no hidden traps.
for(let k=0;k<64;k++){
 const a=k/64*TAU,b=(k+1)/64*TAU;
 triangle([-29,.2,56],[-29+13*Math.cos(a),.2,56+10*Math.sin(a)],[-29+13*Math.cos(b),.2,56+10*Math.sin(b)],color(k%3?'#356f87':'#528da0'));
}
for(let k=0;k<32;k++){
 const a=k/32*TAU,x=-29+14.7*Math.cos(a),z=56+11.5*Math.sin(a),y=height(x,z);
 if(pathDistance(x,z)<2.8)continue;
 roundTower(x,y,z,.45+.2*Math.sin(k*3),.7,['#818c81','#a4a58e','#687d79'][k%3],7,.2);
}
// A waterside hamlet has windows on both sides, visible when circling it.
for(const [x,z,w,d,h] of [[-7,33,4,4,3.2],[11,34,4.5,4,3.8],[-25,37,4,5,3.1],[21,43,5,4,3.4],[-23,34,4.2,4.5,3.6]]){
 const y=height(x,z)-.2;box(x,y,z,w,h,d,color('#bbb39b'));roof(x,y+h,z,w+.5,d+.5,1.8,color('#435776'));
 for(const side of [-1,1])for(const offset of [-.9,.9]){
  const wx=x+offset,wz=z+side*(d/2+.02),wy=y+1.2;
  quad([wx-.26,wy,wz],[wx+.26,wy,wz],[wx+.26,wy+.7,wz],[wx-.26,wy+.7,wz],color('#e6c578'));
 }
}
// A small observatory on the rear hill forms a second navigational anchor.
const observatoryY=height(24,84);
roundTower(24,observatoryY,84,3.4,7,'#afa98e',16,3.1);
roundTower(24,observatoryY+7,84,3.3,1.6,'#697e84',16,2.7);
roundTower(24,observatoryY+8.6,84,2.7,1.6,'#87978b',16,.9);
box(24,observatoryY+.1,80.85,1.1,2.6,.14,color('#273f48'),3,false);
for(const x of [22.4,25.6])box(x,observatoryY+4.2,81,.6,1.2,.15,color('#e6ca7e'),3,false);
obstacles.push({x:24,z:84,w:7.6,d:7.6});
// Old stone arches frame the western lookout while leaving a walkable opening.
for(const z of [86,94]){
 const y=height(-53,z);box(-56,y,z,1.3,4.8,1.3,color('#929c92'));box(-50,y,z,1.3,4.8,1.3,color('#a2a58f'));
 box(-53,y+4.4,z,7.3,.8,1.4,color('#b0ad95'),3,false);
}
for(let k=0;k<18;k++){
 const a=k/18*TAU,x=-53+9*Math.cos(a),z=90+9*Math.sin(a);
 if(pathDistance(x,z)<3)continue;
 roundTower(x,height(x,z),z,.9,1.2+1.3*(.5+.5*Math.sin(k*4)),k%2?'#7c8e85':'#a0a391',7,.55);
 obstacles.push({x,z,w:1.5,d:1.5});
}
// Cypress groves and flowering fields give the southern paths varied foregrounds.
for(let i=0;i<25;i++){
 const x=-65+(i*17.7%132),z=31+(i*13.1%75);
 if(pathDistance(x,z)<3.4||lakeRadius(x,z)<1.3||Math.hypot(x-24,z-84)<9)continue;
 tree(x,z,5+(i%4)*1.6,1.1+(i%3)*.25);
}
for(let i=0;i<65;i++){
 const x=36+(i*7.3%22),z=43+(i*5.7%25);
 if(pathDistance(x,z)<2.4)continue;
 const y=height(x,z);box(x,y,z,.08,.9,.08,color('#586e46'),3,false);
 roundTower(x,y+.8,z,.32,.22,i%3?'#d8b451':'#ae8752',6,.2);
}
for(const [x,z] of [[3,34],[12,45],[24,61],[24,77],[-10,42],[-12,57],[-22,70],[-43,84],[48,65],[40,101],[7,98]]){
 const y=height(x+2,z);box(x+2,y,z,.14,2.6,.14,color('#354a4a'),3,false);box(x+2,y+2.3,z,.5,.6,.5,color('#edcc76'),3,false);
}
// The town has three neighborhoods connected by the river promenade and lanes.
// All building footprints are reserved outside the street corridors.
function lantern(x,z,h=2.8){
 const y=height(x,z);box(x,y,z,.12,h,.12,color('#35484a'),3,false);
 box(x,y+h-.1,z,.42,.57,.42,color('#f4d48c'),3,false);
 roof(x,y+h+.47,z,.66,.66,.3,color('#354b5b'));
}
function bench(x,z,wide=2){
 const y=height(x,z);box(x,y+.5,z,wide,.16,.65,color('#9d8c65'),3,false);
 box(x,y+.65,z-.27,wide,.6,.1,color('#7e765b'),3,false);
 for(const xx of [x-wide*.35,x+wide*.35])box(xx,y,z,.13,.5,.45,color('#3c514e'),3,false);
}
function pot(x,z,r=.4,col='#c6a15c'){
 const y=height(x,z);roundTower(x,y,z,r*.7,.55,'#a77b58',7,r);
 roundTower(x,y+.5,z,r*.95,.65,'#48674b',7,r*.3);
 for(let i=0;i<3;i++)roundTower(x+Math.cos(i*2.1)*r*.5,y+1,z+Math.sin(i*2.1)*r*.5,.16,.18,col,5,.09);
}
function paving(x,z,r,col='#a3a48f'){
 const center=[x,height(x,z)+.14,z];
 for(let k=0;k<32;k++){const a=k/32*TAU,b=(k+1)/32*TAU,point=t=>[x+r*Math.cos(t),height(x+r*Math.cos(t),z+r*Math.sin(t))+.14,z+r*Math.sin(t)];triangle(center,point(a),point(b),color(k%4?col:'#8a9289'));}
}
function archWindow(x,y,z,w,h,face,lit=true){
 // Coordinates on each facade: horizontal t, vertical height, outward depth.
 const p=(t,v,depth=0)=>face===0?[x+t,y+v,z+depth]:[x+depth,y+v,z+t];
 const c=color(lit?'#efd18b':'#30485a'),rim=color('#c3c0a1');
 quad(p(-w*.5,0),p(w*.5,0),p(w*.5,h*.74),p(-w*.5,h*.74),c);
 for(let k=0;k<6;k++){const a=k/6*Math.PI,b=(k+1)/6*Math.PI;triangle(p(0,h*.74),p(Math.cos(a)*w*.5,h*.74+Math.sin(a)*w*.5),p(Math.cos(b)*w*.5,h*.74+Math.sin(b)*w*.5),c);}
 quad(p(-w*.55,-.08,.018),p(w*.55,-.08,.018),p(w*.55,.04,.018),p(-w*.55,.04,.018),rim);
 quad(p(-.035,0,.025),p(.035,0,.025),p(.035,h*.85,.025),p(-.035,h*.85,.025),color('#656e61'));
 quad(p(-w*.5,h*.4,.025),p(w*.5,h*.4,.025),p(w*.5,h*.4+.045,.025),p(-w*.5,h*.4+.045,.025),color('#656e61'));
}
let townBuildings=0;
function house(x,z,w=4,d=4,h=4,style=0){
 if(pathDistance(x,z)<Math.hypot(w,d)*.5+2||lakeRadius(x,z)<1.3||Math.abs(z-riverCenter(x))<5.5)return false;
 if(obstacles.some(o=>Math.abs(x-o.x)<(o.w+w)/2+.5&&Math.abs(z-o.z)<(o.d+d)/2+.5))return false;
 const y=Math.min(...[-1,1].flatMap(a=>[-1,1].map(b=>height(x+a*w/2,z+b*d/2))))-.14;
 const walls=['#b9b89c','#92a8a8','#d0bd97','#819ca6','#c5c8b0','#aaaba0'],roofs=['#3e5971','#58677a','#715f61','#3d6474'];
 box(x,y,z,w,h,d,color(walls[style%walls.length]));roof(x,y+h,z,w+.48,d+.48,1.4+(style%3)*.35,color(roofs[style%roofs.length]));
 box(x,y,z,w+.1,.38,d+.1,color('#738986'),3,false);
 box(x,y+h-.16,z,w+.18,.18,d+.18,color('#d1c6a4'),3,false);
 const floors=h>5?2:1;
 for(const side of [-1,1]){
  const front=z+side*(d/2+.035),lateral=x+side*(w/2+.035);
  for(let level=0;level<floors;level++)for(const off of [-.25,.25]){
   const wy=y+1.25+level*2.35;
   archWindow(x+off*w,wy,front,.6,.95,0,(style+level+side+Math.round(off*4))%4!==0);
   archWindow(lateral,wy,z+off*d,.58,.9,1,(style+level+side)%4!==0);
  }
  // Doors, limestone lintels, and carved shutters make the streets readable.
  box(x,y+.38,front,.7,1.65,.09,color(style%2?'#4d6564':'#6b6454'),3,false);
  box(x,y+2.02,front,.94,.13,.12,color('#d1c4a0'),3,false);
  for(const off of [-.25,.25])for(const shutter of [-1,1])box(x+off*w+shutter*.4,y+1.28,front,.16,.88,.1,color(style%2?'#506a61':'#6e7a77'),3,false);
 }
 box(x+w*.26,y+h+.5,z-d*.18,.55,1.9,.55,color('#b4b09b'),3,false);
 box(x+w*.26,y+h+2.35,z-d*.18,.7,.15,.7,color('#d2c4a3'),3,false);
 if(style%3===0){
  box(x,y+3.15,z+d/2+.45,w*.64,.14,.9,color('#b1ad8f'),3,false);
  for(let k=0;k<6;k++)box(x-w*.28+k*w*.112,y+3.3,z+d/2+.87,.06,.6,.06,color('#475960'),3,false);
  box(x,y+3.85,z+d/2+.87,w*.66,.08,.08,color('#475960'),3,false);
 }
 if(style%4===1){
  // Broad striped shop awnings belong to buildings, never to the street floor.
  for(let k=0;k<6;k++){const ax=x-w*.42+k*w*.14,bx=ax+w*.14;
   quad([ax,y+2.6,z+d/2],[bx,y+2.6,z+d/2],[bx,y+2.22,z+d/2+.9],[ax,y+2.22,z+d/2+.9],color(k%2?'#d7c7a1':'#6c938b'));}
 }
 townBuildings++;return true;
}
// Artisan lanes form small blocks, with a taller inn and civic house at the edges.
const lots=[[-4,-6,4,4,4,1],[-13,-10,4,4,5.8,0],[-23,-10,4.5,5,4.4,3],[-32,-9,4.2,4,5.5,2],[-37,-13,4,4,4.5,1],[-30,-22,4,4,4.8,4],[-20,-22,4,4,4.4,2],[-14,-30,4,4,5.4,0],[-5,-32,4.5,4.5,4.3,1],[4,-33,5,5,6.6,2],[8,-40,4.5,4,4,3],[20,-34,4,4,5,4],[26,-36,4,4,4,1],[34,-39,5,4,5.5,0],[38,-28,4,4,4.2,2],[34,-20,4.5,4.5,5.8,3],[27,-17,4,4,5.5,1],[14,-15,4,4,4.4,4],[15,-4,4,4,5,1],[27,-3,5,4,5.8,0],[39,-4,4,4,4.8,3],[-50,-12,5,5,5,2],[-52,-23,4.5,4,4.3,4],[-48,-34,5,5,5.2,3]];
for(const lot of lots)house(...lot);
// Smaller homes complete the irregular blocks while the corridor reservation
// keeps even the tiny lanes open. The facades alternate warm and cool plaster.
for(let row=0;row<6;row++)for(let col=0;col<13;col++){
 const x=-50+col*7.1+(row%2)*1.6,z=-43+row*6.6;
 if(Math.hypot(x+3,z+18)<7||Math.hypot(x-31,z+32)<7)continue;
 house(x,z,3.2+(col%3)*.35,3.6+(row%2)*.5,3.7+((col+row*2)%4)*.7,(col+row*3)%6);
}
for(let row=0;row<3;row++)for(let col=0;col<9;col++){
 const x=-46+col*11,z=25+row*7;
 if(x>21&&x<39&&z<33)continue;
 house(x,z,3.5,3.8,3.9+((row+col)%3)*.9,col+row);
}
// Upper hillside quarters curve toward the vineyards and the ruined west gate.
for(const x of [-70,-59,-49,46,56,67])for(const z of [-44,-33,-23,-13])house(x,z,4.2,4.4,4.2+((Math.abs(x)+Math.abs(z))%3),Math.round(Math.abs(x+z))%6);
for(const lot of [[-4,75,4,4,4,1],[4,78,4,4,4.6,2],[12,85,4,4,5.4,0],[15,64,4,4,4.6,4],[-5,62,4,4,4,3],[6,60,4,4,4.8,1],[-35,76,4,4,3.8,4],[-51,70,4,4,4.2,2]])house(...lot);
// The river's southern bank becomes a lantern-lit row of inns and workshops.
for(let i=0;i<10;i++){const x=-35+i*7.3,z=12+Math.sin(i*1.8)*1.4;if(Math.abs(x-6)<5||Math.abs(x-34)<5||Math.abs(x+43)<5)continue;house(x,z,4.4,4,4.1+(i%3)*1.1,i);}
for(const lot of [[-33,29,5,4,5.6,1],[-42,28,4,4,4,4],[-46,36,4,4,5.3,3],[-31,37,4,4,4.4,0],[-16,25,4,4,4.8,2],[16,25,5,5,5.8,1],[31,32,4,4,4.2,4],[42,36,4,5,5,2],[49,43,5,5,6,3],[57,37,4,4,4,1]])house(...lot);
// East market: a paved open square, food stalls and a covered communal well.
paving(36,18,6,'#adab90');
for(const [x,z,style] of [[32,20,0],[37,14,1],[40,18,2]]){
 const y=height(x,z);box(x,y,z,2.1,.8,1.15,color('#96866a'),3,false);
 for(let i=0;i<4;i++)roundTower(x-.7+i*.47,y+.84,z,.18,.2,['#c6a151','#b57558','#809255'][style],6,.1);
 for(const xx of [x-1.1,x+1.1])box(xx,y,z-.48,.09,2.5,.09,color('#766c54'),3,false);
 for(let k=0;k<6;k++){const xx=x-1.25+k*.42;quad([xx,y+2.5,z-.7],[xx+.42,y+2.5,z-.7],[xx+.42,y+2.2,z+.9],[xx,y+2.2,z+.9],color(k%2?'#d8c59b':['#678c88','#b18465','#899578'][style]));}
}
const wellX=30,wellZ=15,wellY=height(wellX,wellZ);
roundTower(wellX,wellY,wellZ,.85,.85,'#aaa991',12);roundTower(wellX,wellY+.86,wellZ,.65,.03,'#304f62');
for(const x of [wellX-1.05,wellX+1.05])box(x,wellY,wellZ,.13,2.7,.13,color('#756e54'),3,false);
roof(wellX,wellY+2.6,wellZ,2.8,2.2,.8,color('#536c7b'));obstacles.push({x:wellX,z:wellZ,w:2,d:2});
// Church ornament, bell openings, a rose window, and a small graveyard behind it.
archWindow(3,churchY+1,-14.48,1.1,2.5,0,true);
for(const wx of [1.83,4.17])archWindow(wx,churchY+6.7,-13.9,.6,1.4,1,false);
roundTower(3,churchY+7.9,-12.72,.45,.025,'#d8cc93',16,.45);
for(let k=0;k<8;k++){const a=k/8*TAU;box(3+Math.cos(a)*.29,churchY+8.15+Math.sin(a)*.29,-12.69,.065,.075,.04,color('#53666e'),3,false);}
for(let k=0;k<7;k++){const x=-.8+(k%3)*1.15,z=-27.5-Math.floor(k/3)*1.8;if(pathDistance(x,z)<2.4)continue;const y=height(x,z);box(x,y,z,.5,.9,.2,color('#b2b59e'),3,false);roundTower(x,y+.86,z,.27,.05,'#b2b59e',6,.12);}
// Small details reward turning into courtyards without closing the walkways.
for(const [x,z] of [[-5,-12],[-14,-17],[-26,-16],[11,-26],[24,-10],[-37,23],[17,38],[20,72],[31,77],[-42,81]]){bench(x,z);pot(x+1.6,z);}
for(const route of paths){
 for(let i=1;i<route.length;i++){const a=route[i-1],b=route[i],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);
  for(let t=3;t<len;t+=11){const x=a[0]+dx*t/len-dz/len*2.4,z=a[1]+dz*t/len+dx/len*2.4;
   if(Math.abs(z-riverCenter(x))>4&&lakeRadius(x,z)>1.2&&!obstacles.some(o=>Math.abs(x-o.x)<o.w/2+.3&&Math.abs(z-o.z)<o.d/2+.3))lantern(x,z,2.7);
  }
 }
}
// Neighborhood and outer-circuit bridges share the same walkable arch profile.
for(const b of bridges.slice(1)){
 for(let z=b.z-8;z<b.z+8;z+=.5)quad([b.x-b.width/2,height(b.x,z)+.12,z],[b.x+b.width/2,height(b.x,z)+.12,z],[b.x+b.width/2,height(b.x,z+.5)+.12,z+.5],[b.x-b.width/2,height(b.x,z+.5)+.12,z+.5],color('#a7aa95'));
 for(const side of [-1,1])for(let z=b.z-5;z<b.z+5;z+=1.2){const x=b.x+side*(b.width/2+.1);box(x,height(b.x,z)+.16,z,.34,.8,1.13,color('#a4ab99'),3,false);}
 for(const dz of [-6,6])lantern(b.x+b.width/2+.25,b.z+dz,3);
}
// Lakeside boathouse and landing, with boats moored safely outside the shore path.
house(-46,58,5,5,4,3);
function boat(x,z,a){
 const p=(u,v,y)=>[x+Math.cos(a)*u-Math.sin(a)*v,y,z+Math.sin(a)*u+Math.cos(a)*v];
 const c=color('#c3ad7e');
 quad(p(-1.8,0,.52),p(-1.2,-.6,.62),p(1.3,-.6,.62),p(2,0,.52),c);quad(p(-1.8,0,.52),p(2,0,.52),p(1.3,.6,.62),p(-1.2,.6,.62),color('#859889'));
 quad(p(-1.2,-.6,.62),p(1.3,-.6,.62),p(1,.0,.25),p(-1,0,.25),color('#686f57'));
 for(const u of [-.65,.55])quad(p(u-.12,-.5,.7),p(u+.12,-.5,.7),p(u+.12,.5,.7),p(u-.12,.5,.7),color('#aa966e'));
}
boat(-33,50,.5);boat(-36,59,-.3);boat(-22,61,1.1);
for(let i=0;i<12;i++){const z=53+i*.45;box(-41,.45,z,3,.16,.4,color(i%2?'#9b956f':'#7f856d'),3,false);}
for(const z of [53,57.8])for(const x of [-42.3,-39.7])box(x,-.4,z,.15,1.6,.15,color('#6f7d69'),3,false);
// Garden terraces, hilltop gazebo, and a grove of silver birches behind the town.
paving(7,91,5,'#a4ac93');
for(let k=0;k<8;k++){const a=k/8*TAU,x=7+3.2*Math.cos(a),z=91+3.2*Math.sin(a),y=height(x,z);box(x,y,z,.14,3.1,.14,color('#b5b79d'),3,false);}
roundTower(7,height(7,91)+3.1,91,4.1,1.6,'#557989',8,0);bench(7,89,2.4);
for(let i=0;i<17;i++){
 const x=35+i*6.17%29,z=76+i*8.31%33;
 if(pathDistance(x,z)<3||Math.hypot(x-24,z-84)<10)continue;
 const y=height(x,z);box(x,y,z,.25,4.5,.25,color('#c0c6ac'),3,false);
 roundTower(x,y+3.5,z,1.65,2.7,i%2?'#718b68':'#8a986e',7,.5);obstacles.push({x,z,w:.9,d:.9});
}
// A vine-covered ruin sits off the west ridge: the gap in its walls is an entrance.

const ruinY=height(-66,104);
box(-70,ruinY,104,1,3.8,8,color('#9ca58f'));box(-62,ruinY,104,1,2.8,8,color('#879b8c'));
box(-66,ruinY,108,9,3.2,1,color('#a3aa93'));
for(let i=0;i<7;i++)roundTower(-69.7,ruinY+1+i*.35,101+i*.8,.45,.6,'#4b6c51',6,.2);
roundTower(-66,ruinY,105,.9,.65,'#b8b79b',8,.8);roundTower(-66,ruinY+.7,105,.5,1.1,'#c2bda1',8,.35);

// Stone arches frame routes that carry on into the neighboring landscape.
function stoneArch(x,z,span=5.4,spring=2.8,rise=2,axis='x'){
 const y=height(x,z),depth=.65,c=color('#a8b09a');
 const point=(u,v,d)=>axis==='x'?[x+u,y+v,z+d]:[x+d,y+v,z+u];
 for(const side of [-1,1]){
  const xx=axis==='x'?x+side*(span/2+.2):x,zz=axis==='x'?z:z+side*(span/2+.2),base=height(xx,zz);
  box(xx,base,zz,axis==='x'?.52:depth,y+spring-base,axis==='x'?depth:.52,c);
 }
 for(let k=0;k<12;k++){
  const a=k/12*Math.PI,b=(k+1)/12*Math.PI,inner=t=>[Math.cos(t)*span/2,spring+Math.sin(t)*rise],outer=t=>[Math.cos(t)*(span/2+.42),spring+Math.sin(t)*(rise+.42)];
  const ia=inner(a),ib=inner(b),oa=outer(a),ob=outer(b);
  for(const d of [-depth/2,depth/2])quad(point(...ia,d),point(...ib,d),point(...ob,d),point(...oa,d),c);
  quad(point(...oa,-depth/2),point(...ob,-depth/2),point(...ob,depth/2),point(...oa,depth/2),color('#7b918c'));
  quad(point(...ia,-depth/2),point(...ib,-depth/2),point(...ib,depth/2),point(...ia,depth/2),color('#627b7c'));
 }
}
stoneArch(83,20,6.4,3.1,2.1,'z');
stoneArch(7,116,6,3.2,2.2,'x');
for(const [x,z] of [[78,16],[78,24],[-78,16],[-78,24],[3,112],[11,112],[3,-62],[11,-62]])lantern(x,z,3.1);
// A weathered aqueduct on the high ridge is an outdoor arcade, open underneath.
for(let i=0;i<6;i++)stoneArch(-40+i*5.8,-58,5.4,2.6,2,'x');
for(const [x,z] of [[-43,-51],[-33,-51],[-23,-47]]){bench(x,z);pot(x+1.7,z,.5,'#ddc271');}
// The lantern cloister is a quiet garden off the outer circuit, with two entrances.
paving(55,102,5.8,'#899b91');
for(const x of [49,61]){
 for(const z of [98,106]){const y=height(x,z);box(x,y,z,.55,2.1,3.5,color('#a0ad98'));}
 stoneArch(x,102,4.4,2.4,1.4,'z');
}
box(55,height(55,109),109,12.6,2.4,.55,color('#a4b299'));
for(const [x,z] of [[51,107],[59,107],[51,97],[59,97]]){pot(x,z,.6,'#e0c679');lantern(x,z,2.8);}
bench(55,107,2.6);
roundTower(55,height(55,106),106,.65,.6,'#acb698',8,.9);
roundTower(55,height(55,106)+.6,106,.35,1.8,'#bfbea1',8,.22);
for(const x of [53,57])for(let j=0;j<5;j++){
 const z=97+j*.55,y=height(x,z);roundTower(x,y,z,.25,.35,j%2?'#798b5e':'#c4b26c',6,.12);
}
// Outlying cottages and terraced vines make the walk between towns feel inhabited.
for(const lot of [[77,33,3.4,4,4.4,2],[76,47,3.8,4,5,1],[-78,36,3.2,3.6,4.2,3],[-78,55,3.2,3.8,4.7,0],[61,94,4,4,4.8,4],[-60,108,4.4,4,4.5,1],[16,-59,4.4,4,4.8,2]])house(...lot);
for(let row=0;row<3;row++)for(let j=0;j<13;j++){
 const x=57+row*3.2,z=67+j*1.5;
 if(pathDistance(x,z)<2.8||obstacles.some(o=>Math.abs(x-o.x)<o.w/2+.5&&Math.abs(z-o.z)<o.d/2+.5))continue;
 const y=height(x,z);box(x,y,z,.09,1.05,.09,color('#827855'),3,false);roundTower(x,y+.75,z,.55,.75,'#647d52',7,.25);
 for(const dx of [-.25,.25])roundTower(x+dx,y+1,z+.1,.13,.22,j%2?'#8b8c62':'#8b7968',5,.06);
}
// Low stone edges accent the perimeter roads, while leaving junctions open.
for(const x of [-76.5,73.5])for(let z=30;z<97;z+=3){
 if(pathDistance(x,z)<2||lakeRadius(x,z)<1.2)continue;
 const y=height(x,z);box(x,y,z,.42,.48,2.5,color('#829486'),3,false);
}

// Cypress avenues and small groves sit on dry ground beside the walking routes.
function cypressSpace(x,z,r){
 return pathDistance(x,z)>=r+2.5&&Math.abs(z-riverCenter(x))>=2.8+r+.8&&lakeRadius(x,z)>=1.03+(r+.6)/10
  &&!obstacles.some(o=>Math.abs(x-o.x)<o.w/2+r+1&&Math.abs(z-o.z)<o.d/2+r+1);
}
// The original tall silhouette now stands in the dry meadow beside town.
if(cypressSpace(-6,22,3.2))tree(-6,22,24,3.2);
let addedCypresses=0;
for(let i=0;i<180&&addedCypresses<36;i++){
 const x=-72+(i*23.17%144),z=-57+(i*37.61%166);
 const r=1.05+(i%4)*.22,h=7+(i%7)*1.6;
 if(pathDistance(x,z)<r+2.5||Math.hypot(x-24,z-84)<10||Math.hypot(x-7,z-91)<6)continue;
 if(!cypressSpace(x,z,r))continue;
 if(tree(x,z,h,r)!==false)addedCypresses++;
}

const common=`uniform vec3 eye,right,up,forward,tileOffset;uniform float aspect,focal;vec4 project(vec3 p){vec3 d=p+tileOffset-eye;float z=dot(d,forward);return vec4(dot(d,right)*focal/aspect,dot(d,up)*focal,1.000667*z-.200067,z);}`;
const baseVertex=`#version 300 es
precision highp float;in vec3 position,normal,paint;${common}out vec3 rgb;void main(){float light=.58+.42*max(0.,dot(normal,normalize(vec3(-.4,.9,.2))));rgb=paint*light;float fog=smoothstep(65.,150.,length(position+tileOffset-eye));rgb=mix(rgb,vec3(.1025,.21,.375),fog);gl_Position=project(position);}`;
const baseFragment=`#version 300 es
precision highp float;in vec3 rgb;out vec4 outColor;void main(){outColor=vec4(rgb,1.);}`;
const skyVertex=`#version 300 es
precision highp float;in vec2 position;out vec2 screen;void main(){screen=position;gl_Position=vec4(position,1.,1.);}`;
const skyFragment=`#version 300 es
precision highp float;in vec2 screen;uniform vec3 right,up,forward;uniform float aspect,focal;out vec4 outColor;void main(){vec3 d=normalize(forward+right*screen.x*aspect/focal+up*screen.y/focal);float u=.5+atan(d.x,-d.z)/6.2831853;float v=.5+asin(d.y)/3.14159265;vec3 c=vec3(.075+.055*v,.17+.08*v,.31+.13*v);c+=exp(-pow((v-.64-.025*sin(u*35.))/.05,2.))*vec3(.072,.096,.084);vec3 stars[18]=vec3[18](vec3(.405,.73,.016),vec3(.445,.80,.009),vec3(.505,.84,.013),vec3(.555,.76,.012),vec3(.60,.86,.011),vec3(.655,.76,.012),vec3(.68,.88,.028),vec3(.35,.87,.01),vec3(.38,.63,.009),vec3(.02,.76,.012),vec3(.07,.84,.015),vec3(.14,.70,.015),vec3(.20,.85,.010),vec3(.24,.74,.022),vec3(.80,.82,.012),vec3(.87,.70,.012),vec3(.93,.86,.01),vec3(.98,.72,.018));for(int i=0;i<18;i++){float dx=u-stars[i].x;dx-=round(dx);float dist=length(vec2(dx,(v-stars[i].y)*.8)),r=stars[i].z,g=exp(-pow(dist/r,2.));c=mix(c,vec3(1.,.83,.39),g)+exp(-pow((dist-r*2.)/(r*.7),2.))*vec3(.084,.07,.017);}outColor=vec4(c,1.);}`;
function program(v,f){
 function shader(type,s){const sh=gl.createShader(type);gl.shaderSource(sh,s);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(sh));return sh;}
 const p=gl.createProgram();gl.attachShader(p,shader(gl.VERTEX_SHADER,v));gl.attachShader(p,shader(gl.FRAGMENT_SHADER,f));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return p;
}
let base,sky,painter;
try{base=program(baseVertex,baseFragment);sky=program(skyVertex,skyFragment);painter=new FramePainter(gl,program);}catch(e){$('error').hidden=false;$('error').textContent='The graphics renderer could not start: '+e.message;throw e;}
function attribute(p,name,count,stride,offset,divisor=0){const loc=gl.getAttribLocation(p,name);if(loc<0)return;gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,count,gl.FLOAT,false,stride*4,offset*4);gl.vertexAttribDivisor(loc,divisor);}
function buffer(data,usage=gl.STATIC_DRAW){const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),usage);return b;}
// Sort geometry into small spatial batches; neighboring repeats share this buffer.
const chunkMap=new Map();
for(let i=0;i<triangles.length;i+=27){const x=(triangles[i]+triangles[i+9]+triangles[i+18])/3,z=(triangles[i+2]+triangles[i+11]+triangles[i+20])/3,key=Math.floor((x-mapBounds.minX)/(worldWidth/8))+','+Math.floor((z-mapBounds.minZ)/(worldDepth/8));if(!chunkMap.has(key))chunkMap.set(key,[]);const group=chunkMap.get(key);for(let k=0;k<27;k++)group.push(triangles[i+k]);}
const sorted=[],chunks=[];
for(const group of chunkMap.values()){
 const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
 for(let i=0;i<group.length;i+=9)for(let a=0;a<3;a++){lo[a]=Math.min(lo[a],group[i+a]);hi[a]=Math.max(hi[a],group[i+a]);}
 chunks.push({first:sorted.length/9,count:group.length/9,center:lo.map((a,i)=>(a+hi[i])/2),radius:Math.hypot(...lo.map((a,i)=>(hi[i]-a)/2))});
 for(const value of group)sorted.push(value);
}
triangles.length=0;for(const value of sorted)triangles.push(value);
const baseVAO=gl.createVertexArray();gl.bindVertexArray(baseVAO);buffer(triangles);attribute(base,'position',3,9,0);attribute(base,'normal',3,9,3);attribute(base,'paint',3,9,6);
const skyVAO=gl.createVertexArray();gl.bindVertexArray(skyVAO);buffer([-1,-1,3,-1,-1,3]);attribute(sky,'position',2,2,0);
const uniforms=new Map();function uniform(p,n){let u=uniforms.get(p);if(!u){u={};uniforms.set(p,u);}if(!(n in u))u[n]=gl.getUniformLocation(p,n);return u[n];}

const camera={x:0,z:20,y:0,yaw:0,pitch:.17},keys=new Set();let journey=false,journeyTime=0,joystick=[0,0],lookJoystick=[0,0],model=null,last=performance.now(),statsTime=last,frames=0,cpuTotal=0,paused=false;
const settings={inertia:1,damping:.5,motion:3.03,size:1.14,length:1.48,width:.71,curvature:1.68,variance:.76,texture:1.7,detail:.65,density:.65,edges:.7,grid:11,view:'paint',controller:'rules'};
let basis={};function updateBasis(){const cy=Math.cos(camera.yaw),sy=Math.sin(camera.yaw),cp=Math.cos(camera.pitch),sp=Math.sin(camera.pitch);basis={right:[cy,0,sy],forward:[sy*cp,sp,-cy*cp],up:[-sy*sp,cp,cy*sp]};}
function sendCamera(p){gl.useProgram(p);gl.uniform3f(uniform(p,'eye'),camera.x,camera.y,camera.z);for(const n of ['right','up','forward'])gl.uniform3fv(uniform(p,n),basis[n]);gl.uniform1f(uniform(p,'aspect'),canvas.width/canvas.height);gl.uniform1f(uniform(p,'focal'),1/Math.tan(Math.PI/5));}
function resize(){const ratio=Math.min(devicePixelRatio,coarse?1.5:1.7),w=Math.round(innerWidth*ratio),h=Math.round(innerHeight*ratio);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;gl.viewport(0,0,w,h);}painter.resize(w,h,settings.grid);}
function home(){journey=false;$('journey').setAttribute('aria-pressed','false');Object.assign(camera,{x:0,z:20,yaw:0,pitch:.17});painter.reset();}
function collision(x,z){
 x=wrapCoordinate(x,mapBounds.minX,mapBounds.maxX);z=wrapCoordinate(z,mapBounds.minZ,mapBounds.maxZ);
 if(Math.abs(periodicDelta(z,riverCenter(x),worldDepth))<2.8&&!bridges.some(b=>Math.abs(periodicDelta(x,b.x,worldWidth))<b.width/2-.25))return true;
 if(lakeRadius(x,z)<1.03&&!onLanding(x,z))return true;
 return obstacles.some(o=>Math.abs(periodicDelta(x,o.x,worldWidth))<o.w/2&&Math.abs(periodicDelta(z,o.z,worldDepth))<o.d/2);
}
const gatewayWalk=[[23,17],[38,23],[58,20],[70,20],[83,20],[93,20],[105,23],[116,29]];
const tour=[[0,20],[6,13],...gatewayWalk,...gatewayWalk.slice(0,-1).reverse(),[6,13],[6,-3],[8,-9],[21,-9],[21,-19],[14,-24],[22,-28],[27,-27],[22,-28],[14,-24],[8,-24],[-9,-24],[-9,-17],[-18,-16],[-29,-16],[-39,-21],[-43,-16],[-43,-5],[-43,9],[-39,20],[-23,19],[-8,16],[6,13],[0,24],[3,34],[12,45],[24,61],[24,77],[34,80],[34,91],[7,98],[-22,70],[-43,84],[-53,90],[-43,84],[-22,70],[-12,57],[-10,42],[3,34],[0,20]];
function move(dt){
 if(journey){
  journeyTime+=dt;let distance=journeyTime*4.4,segment=1;
  for(;segment<tour.length;segment++){const a=tour[segment-1],b=tour[segment],length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(distance<=length)break;distance-=length;}
  if(segment>=tour.length)home();
  else{const a=tour[segment-1],b=tour[segment],dx=b[0]-a[0],dz=b[1]-a[1],t=distance/Math.hypot(dx,dz);
   camera.x=a[0]+dx*t;camera.z=a[1]+dz*t;const target=Math.atan2(dx,-dz);camera.yaw+=Math.atan2(Math.sin(target-camera.yaw),Math.cos(target-camera.yaw))*(1-Math.exp(-dt*3));camera.pitch+=(.12-camera.pitch)*(1-Math.exp(-dt*2));
  }
 }else{
  camera.yaw+=lookJoystick[0]*dt*1.45;camera.pitch=clamp(camera.pitch-lookJoystick[1]*dt*1.15,-1.1,1.1);
  let f=(keys.has('w')||keys.has('arrowup')?1:0)-(keys.has('s')||keys.has('arrowdown')?1:0)-joystick[1];
  let r=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0)+joystick[0];
  const len=Math.max(1,Math.hypot(f,r)),speed=(keys.has('shift')?8:4.4)*dt/len;
  const dx=(Math.sin(camera.yaw)*f+Math.cos(camera.yaw)*r)*speed,dz=(-Math.cos(camera.yaw)*f+Math.sin(camera.yaw)*r)*speed;
  // Positions are continuous; only queries into the repeating level use modulo.
  if(!collision(camera.x+dx,camera.z))camera.x+=dx;
  if(!collision(camera.x,camera.z+dz))camera.z+=dz;
 }
 camera.y=height(camera.x,camera.z)+2.3;updateBasis();
}
function visibleBatches(c,b,aspect){
 const tx=Math.floor((c.x-mapBounds.minX)/worldWidth),tz=Math.floor((c.z-mapBounds.minZ)/worldDepth),tanV=Math.tan(Math.PI/5),tanH=tanV*aspect,batches=[];
 for(let j=tz-1;j<=tz+1;j++)for(let i=tx-1;i<=tx+1;i++)for(const chunk of chunks){
  const x=i*worldWidth,z=j*worldDepth,d=[chunk.center[0]+x-c.x,chunk.center[1]-c.y,chunk.center[2]+z-c.z],r=chunk.radius;
  const dot=v=>d[0]*v[0]+d[1]*v[1]+d[2]*v[2],depth=dot(b.forward);
  if(depth+r<.1||depth-r>160||Math.abs(dot(b.right))>depth*tanH+r*Math.hypot(1,tanH)||Math.abs(dot(b.up))>depth*tanV+r*Math.hypot(1,tanV))continue;
  batches.push({x,z,first:chunk.first,count:chunk.count});
 }
 return batches;
}
function render(dt){
 resize();painter.beginSource();
 gl.disable(gl.BLEND);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.clearColor(.06,.12,.23,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
 gl.depthFunc(gl.LEQUAL);sendCamera(sky);gl.bindVertexArray(skyVAO);gl.drawArrays(gl.TRIANGLES,0,3);
 sendCamera(base);gl.bindVertexArray(baseVAO);
 // Keep GPU coordinates near the walker, even after thousands of circuits.
 gl.uniform3f(uniform(base,'eye'),0,0,0);
 for(const batch of visibleBatches(camera,basis,canvas.width/canvas.height)){
  gl.uniform3f(uniform(base,'tileOffset'),batch.x-camera.x,-camera.y,batch.z-camera.z);
  gl.drawArrays(gl.TRIANGLES,batch.first,batch.count);
 }
 painter.finish(camera,basis,settings,dt);
}
function tick(now){const start=performance.now(),dt=Math.min((now-last)/1000,.05);last=now;if(!paused){move(dt);render(dt);frames++;cpuTotal+=performance.now()-start;}
 if(now-statsTime>1000&&frames){$('fps').textContent=Math.round(frames*1000/(now-statsTime))+' fps';$('cpu').textContent=(cpuTotal/frames).toFixed(1)+' ms CPU';$('energy').textContent=(painter.cols*painter.rows/1000).toFixed(1)+'k cells';frames=0;cpuTotal=0;statsTime=now;}
 requestAnimationFrame(tick);
}
$('settings').onclick=()=>{$('panel').hidden=!$('panel').hidden;resetControls();$('settings').setAttribute('aria-expanded',String(!$('panel').hidden));};
for(const n of ['inertia','damping','motion','size','grid','detail','density','edges','length','width','curvature','variance','texture'])$(n).oninput=()=>{settings[n]=Number($(n).value);$(n+'-out').textContent=n==='grid'?settings[n]+' px':settings[n].toFixed(2);};
$('view').onchange=()=>settings.view=$('view').value;
$('controller').onchange=()=>{settings.controller=$('controller').value;};
$('home').onclick=home;
$('journey').onclick=()=>{if(journey)home();else{home();journey=true;journeyTime=0;$('journey').setAttribute('aria-pressed','true');}};
$('settle').onclick=()=>painter.pendingSettle=true;
$('stir').onclick=()=>painter.pendingImpulse=1;
window.addEventListener('keydown',e=>{if(!$('panel').hidden)return;if(['INPUT','SELECT','BUTTON','SUMMARY'].includes(document.activeElement?.tagName))return;const k=e.key.toLowerCase();if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','shift'].includes(k)){e.preventDefault();keys.add(k);if(journey)home();}if(k==='r')home();});
window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
window.addEventListener('blur',()=>resetControls());
let drag=null;
canvas.addEventListener('pointerdown',e=>{if(!$('panel').hidden||drag)return;if(journey){journey=false;$('journey').setAttribute('aria-pressed','false');}drag={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;camera.yaw+=(e.clientX-drag.x)*.004;camera.pitch=clamp(camera.pitch-(e.clientY-drag.y)*.004,-1.1,1.1);drag.x=e.clientX;drag.y=e.clientY;});
for(const evt of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(evt,e=>{if(drag?.id===e.pointerId)drag=null;});
function stopJourney(){if(journey){journey=false;$('journey').setAttribute('aria-pressed','false');}}
function makeStick(id,thumbID,setValue){
 const stick=$(id),thumb=$(thumbID);let pointer=null;
 function reset(){const oldPointer=pointer;pointer=null;setValue([0,0]);thumb.style.transform='';if(oldPointer!==null&&stick.hasPointerCapture?.(oldPointer))stick.releasePointerCapture(oldPointer);}
 function update(e){
  if(pointer!==e.pointerId)return;
  const b=stick.getBoundingClientRect(),radius=b.width*.32;
  const x=(e.clientX-b.left-b.width/2)/radius,y=(e.clientY-b.top-b.height/2)/radius,magnitude=Math.hypot(x,y);
  const gain=magnitude>.08?(Math.min(magnitude,1)-.08)/(.92*magnitude):0;
  setValue([x*gain,y*gain]);
  const visualScale=radius/Math.max(1,magnitude);thumb.style.transform=`translate(${x*visualScale}px,${y*visualScale}px)`;
 }
 stick.addEventListener('pointerdown',e=>{if(pointer!==null||!$('panel').hidden)return;e.preventDefault();pointer=e.pointerId;stick.setPointerCapture(pointer);stopJourney();update(e);});
 stick.addEventListener('pointermove',update);
 for(const event of ['pointerup','pointercancel','lostpointercapture'])stick.addEventListener(event,e=>{if(pointer===e.pointerId)reset();});
 return reset;
}
const resetMove=makeStick('joystick','thumb',value=>joystick=value),resetLook=makeStick('look-joystick','look-thumb',value=>lookJoystick=value);
function resetControls(){keys.clear();drag=null;resetMove();resetLook();}
document.addEventListener('visibilitychange',()=>{paused=document.hidden;last=performance.now();painter.reset();resetControls();});
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();paused=true;$('error').hidden=false;$('error').textContent='Graphics were interrupted. Reload to restart the painting.';});
fetch('./controller.json').then(r=>{if(!r.ok)throw Error('Missing controller');return r.json();}).then(m=>{model=m;painter.setModel(m);const opt=$('controller').options[1];opt.disabled=false;opt.textContent='Image flow + learned prior';}).catch(()=>{$('controller').options[1].textContent='Learned prior unavailable';});
home();move(0);requestAnimationFrame(tick);
// Read-only research observability, independent of interface controls.
window.starryField={get state(){return {camera:{...camera},settings:{...settings},pipeline:"RGB frame → field dynamics → painting",fieldCells:painter.cols*painter.rows,historyReady:painter.history,learnedControllerReady:!!model};}};
