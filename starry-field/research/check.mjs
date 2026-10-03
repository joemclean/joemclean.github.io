import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {advance,lineError,authoredSky,predict} from '../dist/dynamics.js';

assert(Math.abs(lineError(Math.PI,0))<1e-12,'Opposite directions are the same brush line');
assert.deepEqual(advance(0,3,.8,1/120,0,.5),[.8,0]);
for(const inertia of [.03,.2,.7,1])for(const damping of [0,.65,1]){
 let a=.9,v=5;for(let i=0;i<120*30;i++)[a,v]=advance(a,v,0,1/120,inertia,damping);
 assert(Number.isFinite(a)&&Number.isFinite(v),'Finite state');
 assert(Math.abs(lineError(0,a))<.025&&Math.abs(v)<.05,'Perturbed paint settles');
}
const model=JSON.parse(fs.readFileSync(new URL('../dist/controller.json',import.meta.url)));
let total=0;for(let i=0;i<300;i++){const u=i*.61803398875%1,v=.45+(.53*(i*.41421356237%1));total+=Math.abs(lineError(authoredSky(u,v),predict(model,u,v)));assert(Math.abs(lineError(predict(model,0,v),predict(model,1,v)))<1e-6,'Periodic model seam');}
assert(total/300<.08,'Held-out field approximation');

// Execute initialization against a recording WebGL/DOM adapter to validate
// geometry generation, finite GPU inputs, event wiring, and shader source capture.
const shaders=[],elements=new Map(),listeners={},arrays=[],textureData=[],framebuffers=[];
const element=id=>{if(!elements.has(id))elements.set(id,{hidden:false,tagName:'DIV',value:'',options:[{},{disabled:true}],style:{},setAttribute(){},addEventListener(e,f){listeners[id+':'+e]=f;},getBoundingClientRect(){return {left:0,top:0,width:110,height:110};},setPointerCapture(){}});return elements.get(id);};
let glID=0;const constants=new Map();const gl=new Proxy({createShader:()=>({}),shaderSource:(s,src)=>{s.source=src;shaders.push(src);},getShaderParameter:()=>true,getProgramParameter:()=>true,getExtension:()=>({}),checkFramebufferStatus:()=>gl.FRAMEBUFFER_COMPLETE,getAttribLocation:()=>0,getUniformLocation:()=>({}),getShaderInfoLog:()=>'',getProgramInfoLog:()=>'',bufferData:(target,data)=>{arrays.push(data);},texImage2D:(...args)=>{if(args.at(-1))textureData.push([...args.at(-1)]);},createProgram:()=>({}),createTexture:()=>({}),createFramebuffer:()=>({}),bindFramebuffer:(target,f)=>framebuffers.push(f),createBuffer:()=>({}),createVertexArray:()=>({}),drawArraysInstanced:()=>{throw Error('Painting must never draw surface stroke instances');}},{get(t,n){if(n in t)return t[n];if(n.toUpperCase()===n){if(!constants.has(n))constants.set(n,++glID);return constants.get(n);}return ()=>{};}});
element('world').getContext=()=>gl;
const context={console,Math,Float32Array,Uint8Array,Map,Set,Error,performance:{now:()=>0},matchMedia:()=>({matches:process.argv.includes('--mobile')}),devicePixelRatio:1,innerWidth:1200,innerHeight:800,document:{getElementById:element,addEventListener(){},hidden:false,activeElement:null},window:{addEventListener(e,f){listeners[e]=f;}},fetch:()=>new Promise(()=>{}),requestAnimationFrame:f=>context.frame=f,TAU:Math.PI*2,advance,authoredSky,predict};
vm.createContext(context);vm.runInContext(fs.readFileSync(new URL('../dist/painter.js',import.meta.url),'utf8').replace(/^import .*?;\n/gm,'').replace(/export /g,''),context);vm.runInContext(fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8').replace(/^import .*?;\n/gm,''),context);
for(const a of arrays)assert([...a].every(Number.isFinite),'Finite vertex data');
context.frame(16);assert(context.window.starryField.state.fieldCells>1000);assert(context.window.starryField.state.historyReady);assert(framebuffers.includes(null)&&framebuffers.some(Boolean),'Distinct offscreen and display stages');
const start=context.window.starryField.state.camera;
listeners.keydown({key:'w',preventDefault(){}});context.frame(32);listeners.keyup({key:'w'});
assert(context.window.starryField.state.camera.z<start.z,'Forward movement works');
element('stir').onclick();assert(vm.runInContext('painter.pendingImpulse',context)===1);context.frame(48);assert(vm.runInContext('painter.pendingImpulse',context)===0,'GPU impulse consumed');
element('settle').onclick();assert(vm.runInContext('painter.pendingSettle',context));context.frame(64);assert(!vm.runInContext('painter.pendingSettle',context),'GPU settle command consumed');
element('home').onclick();assert(context.window.starryField.state.camera.z===20,'Home resets camera');
element('journey').onclick();context.frame(80);assert(context.window.starryField.state.camera.z<20,'Recorded camera journey runs');
element('grid').value='6';element('grid').oninput();context.frame(96);
const denseCells=context.window.starryField.state.fieldCells;
element('grid').value='24';element('grid').oninput();context.frame(112);
assert(denseCells>context.window.starryField.state.fieldCells*10,'Grid spacing changes vector resolution');
element('grid').value='11';element('grid').oninput();context.frame(128);
element('density').value='1';element('density').oninput();context.frame(144);
assert(context.window.starryField.state.settings.density===1,'Density slider wired');
const easedDensity=vm.runInContext('painter.density',context);
assert(easedDensity>0&&easedDensity<1,'Density eases toward slider target');
element('density').value='0';element('density').oninput();
for(let i=0;i<150;i++)context.frame(160+i*16);
assert(vm.runInContext('painter.density',context)===0,'Bottom slider settles to exactly no density adaptation');
// Two simultaneous pointers drive independent movement and camera rotation.
element('home').onclick();
const pointer=(id,x,y)=>({pointerId:id,clientX:x,clientY:y,preventDefault(){}});
listeners['joystick:pointerdown'](pointer(1,55,15));
listeners['look-joystick:pointerdown'](pointer(2,95,55));
const beforeSticks=context.window.starryField.state.camera;
vm.runInContext('move(.1)',context);
const afterSticks=context.window.starryField.state.camera;
assert(afterSticks.z<beforeSticks.z&&afterSticks.yaw>beforeSticks.yaw,'Move and look work simultaneously');
listeners['look-joystick:pointerup'](pointer(99,55,55));
assert(vm.runInContext('lookJoystick[0]',context)>0,'Unrelated pointer cannot cancel stick');
listeners['joystick:pointerup'](pointer(1,55,15));
assert(vm.runInContext('joystick[1]',context)===0&&vm.runInContext('lookJoystick[0]',context)>0,'Releasing Move leaves Look active');
listeners['look-joystick:pointercancel'](pointer(2,95,55));
assert(vm.runInContext('lookJoystick[0]',context)===0,'Canceled Look stops');
listeners['joystick:pointerdown'](pointer(3,55,15));listeners['look-joystick:pointerdown'](pointer(4,95,55));
element('settings').onclick();
assert(!element('panel').hidden&&vm.runInContext('Math.hypot(...joystick,...lookJoystick)',context)===0,'Opening Studio stops both sticks');
element('settings').onclick();
element('view').value='raw';element('view').onchange();assert(context.window.starryField.state.settings.view==='raw','Top view selector works');
element('view').value='paint';element('view').onchange();
assert(vm.runInContext('collision(0,riverCenter(0))',context),'River cannot be walked into');
assert(!vm.runInContext('collision(6,bridgeZ)',context),'Bridge remains traversable');
vm.runInContext('home();camera.x=6;camera.z=bridgeZ+7;camera.yaw=0;joystick=[0,-1]',context);
for(let i=0;i<75;i++)vm.runInContext('move(.05)',context);
assert(context.window.starryField.state.camera.z<vm.runInContext('bridgeZ-7',context),'Walking crosses bridge and both ramps');
assert(context.window.starryField.state.camera.y>.25+2.3,'Walking stays above river');
assert(vm.runInContext('collision(-29,56)',context),'Lake blocks walking into water');
for(const route of vm.runInContext('paths',context))for(let i=1;i<route.length;i++){
 const a=route[i-1],b=route[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
 for(let step=0;step<=Math.ceil(length*2);step++){
  const t=step/Math.ceil(length*2),x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t;
  assert(!vm.runInContext(`collision(${x},${z})`,context),`Street route remains walkable at ${x},${z}`);
 }
}
vm.runInContext('resetControls();home();camera.yaw=Math.PI;joystick=[0,-1]',context);
for(let i=0;i<130;i++)vm.runInContext('move(.05)',context);
assert(context.window.starryField.state.camera.z>45,'Player can explore behind the starting position');
for(const route of vm.runInContext('[tour]',context))for(let i=1;i<route.length;i++){
 const a=route[i-1],b=route[i],steps=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])*3);
 for(let j=0;j<=steps;j++){
  const x=a[0]+(b[0]-a[0])*j/steps,z=a[1]+(b[1]-a[1])*j/steps;
  assert(!vm.runInContext(`collision(${x},${z})`,context),`Guided tour stays clear at ${x},${z}`);
 }
}
for(const b of vm.runInContext('bridges',context)){
 vm.runInContext(`resetControls();home();camera.x=${b.x};camera.z=${b.z+7};camera.yaw=0;joystick=[0,-1]`,context);
 for(let i=0;i<75;i++)vm.runInContext('move(.05)',context);
 assert(context.window.starryField.state.camera.z<b.z-7,'Each neighborhood bridge can be crossed');
}
vm.runInContext('resetControls();home();camera.x=-42.4;camera.z=53;camera.yaw=Math.PI;joystick=[0,-1]',context);
for(let i=0;i<18;i++)vm.runInContext('move(.05)',context);
assert(context.window.starryField.state.camera.z>56,'Lakeside landing is reachable');
assert(context.window.starryField.state.camera.y>2.909,'Camera stands on the landing deck');
assert(vm.runInContext('collision(-39.3,56)',context),'Water remains blocked just beyond deck');
assert(vm.runInContext('townBuildings>=48 && triangles.length/27<75000',context),'Town breadth has a bounded geometry budget');
// Cross the former boundaries without a camera jump or a field reset.
for(const [x,z,yaw] of [[82.9,40,Math.PI/2],[-82.9,40,-Math.PI/2],[0,-65.9,0],[0,115.9,Math.PI]]){
 vm.runInContext(`resetControls();home();camera.x=${x};camera.z=${z};camera.yaw=${yaw};camera.pitch=.23;joystick=[0,-1];painter.history=true;move(.1)`,context);
 const c=context.window.starryField.state.camera;
 assert(Math.abs(c.x-(x+Math.sin(yaw)*.44))<1e-8&&Math.abs(c.z-(z-Math.cos(yaw)*.44))<1e-8,'Walking remains continuous across tile boundaries');
 assert(Math.abs(c.yaw-yaw)<1e-8&&c.pitch===.23,'Crossing preserves look direction');
 assert(context.window.starryField.state.historyReady,'Crossing preserves brush history');
}
vm.runInContext('resetControls();home();camera.x=82.9;camera.z=115.9;camera.yaw=Math.PI*.75;joystick=[0,-1];move(.1)',context);
assert(context.window.starryField.state.camera.x>83&&context.window.starryField.state.camera.z>116,'Diagonal walking continues into the next tile');
for(let i=0;i<250;i++){
 const x=-83+(i*.61803398875%1)*166,z=-66+(i*.41421356237%1)*182;
 const sample=vm.runInContext(`({a:ground(${x},${z}),b:ground(${x+166},${z-182}),ca:groundColor(${x},${z}),cb:groundColor(${x+166},${z-182}),ha:height(${x},${z}),hb:height(${x+166},${z-182}),hit:collision(${x},${z}),repeat:collision(${x+166},${z-182})})`,context);
 assert(Math.abs(sample.a-sample.b)<1e-9&&Math.abs(sample.ha-sample.hb)<1e-9,'Terrain and walking height repeat exactly');
 assert(sample.ca.every((c,k)=>Math.abs(c-sample.cb[k])<1e-9),'Terrain colors repeat exactly');
 assert(sample.hit===sample.repeat,'Collision repeats with visible scenery');
}
for(const z of [-54,20,40,90]){
 const seam=vm.runInContext(`({a:ground(83-1e-4,${z}),b:ground(83+1e-4,${z}),left:(ground(83,${z})-ground(83-.001,${z}))/.001,right:(ground(83+.001,${z})-ground(83,${z}))/.001})`,context);
 assert(Math.abs(seam.a-seam.b)<.001&&Math.abs(seam.left-seam.right)<.001,'Seam has continuous height and slope');
}
for(const x of [-73,7,70,80]){
 const seam=vm.runInContext(`({a:ground(${x},116-1e-4),b:ground(${x},116+1e-4),left:(ground(${x},116)-ground(${x},116-.001))/.001,right:(ground(${x},116+.001)-ground(${x},116))/.001})`,context);
 assert(Math.abs(seam.a-seam.b)<.001&&Math.abs(seam.left-seam.right)<.001,'North/south seam has continuous height and slope');
}
const trees=vm.runInContext('cypresses',context);
assert(trees.some(t=>t.x===-6&&t.z===22&&t.h===24),'Tall cypress moved to the dry meadow');
assert(vm.runInContext('addedCypresses===36',context),'Additional cypresses fit clear spaces');
for(const t of trees){
 assert(vm.runInContext(`Math.abs(${t.z}-riverCenter(${t.x}))>=2.8+${t.r}+.8&&lakeRadius(${t.x},${t.z})>=1.03+(${t.r}+.6)/10`,context),'Cypress crowns stay off water');
}
// Every route crossing an old boundary remains walkable in the neighboring copy.
for(const [x,z,yaw] of [[82.8,20,Math.PI/2],[-82.8,20,-Math.PI/2],[7,115.8,Math.PI],[7,-65.8,0],[70,115.8,Math.PI],[-73,-65.8,0]]){
 vm.runInContext(`resetControls();home();camera.x=${x};camera.z=${z};camera.yaw=${yaw};joystick=[0,-1]`,context);
 for(let i=0;i<80;i++)vm.runInContext('move(.05)',context);
 const c=context.window.starryField.state.camera;
 assert(Math.hypot(c.x-x,c.z-z)>17.5,'Cross-boundary road can be walked continuously');
}
const batchCheck=vm.runInContext('home();move(0);visibleBatches(camera,basis,1.5)',context);
assert(batchCheck.some(b=>b.x!==0||b.z!==0),'Neighboring scenery is rendered before arriving at its tile');
assert(batchCheck.reduce((n,b)=>n+b.count,0)<vm.runInContext('triangles.length/9*4',context),'Spatial culling avoids drawing nine complete towns');
element('edges').value='0.85';element('edges').oninput();
assert(context.window.starryField.state.settings.edges===.85,'Edge fitting slider is wired');
element('edges').value='.7';element('edges').oninput();
vm.runInContext('resetControls();home();move(0)',context);
fs.writeFileSync('/tmp/starry-field-shaders.json',JSON.stringify(shaders));
if(process.argv.includes('--render')){vm.runInContext('home();move(0)',context);fs.writeFileSync('/tmp/starry-field-render.json',JSON.stringify({shaders,arrays:arrays.map(a=>[...a]),camera:context.window.starryField.state.camera,chunks:vm.runInContext('chunks',context),seamCameras:vm.runInContext('[[83,20,Math.PI/2],[7,116,Math.PI],[83,116,Math.PI*.75]].map(([x,z,yaw])=>[-.04,-.02,0,.02,.04].map(t=>({x:x+Math.sin(yaw)*t,z:z-Math.cos(yaw)*t,y:height(x+Math.sin(yaw)*t,z-Math.cos(yaw)*t)+2.3,yaw,pitch:.03})))',context),worldWidth:166,worldDepth:182,mapBounds:vm.runInContext('mapBounds',context),sceneCameras:vm.runInContext('[{x:6,z:bridgeZ+9,y:height(6,bridgeZ+9)+2.3,yaw:0,pitch:.05},{x:-8,z:-10,y:height(-8,-10)+2.3,yaw:.88,pitch:.06},{x:24,z:-22,y:height(24,-22)+2.3,yaw:.61,pitch:.18},{x:-23,z:-18,y:height(-23,-18)+2.3,yaw:-.8,pitch:.04},{x:0,z:20,y:height(0,20)+2.3,yaw:Math.PI,pitch:.12},{x:-12,z:45,y:height(-12,45)+2.3,yaw:-2.15,pitch:.08},{x:20,z:67,y:height(20,67)+2.3,yaw:2.91,pitch:.22},{x:-47,z:78,y:height(-47,78)+2.3,yaw:-2.68,pitch:.1},{x:36,z:24,y:height(36,24)+2.3,yaw:0,pitch:.05},{x:6,z:13,y:height(6,13)+2.3,yaw:-1.25,pitch:.03},{x:21,z:-9,y:height(21,-9)+2.3,yaw:0,pitch:.07},{x:-42.4,z:57,y:height(-42.4,57)+2.3,yaw:1.65,pitch:.05},{x:80,z:20,y:height(80,20)+2.3,yaw:Math.PI/2,pitch:.03},{x:86,z:20,y:height(86,20)+2.3,yaw:Math.PI/2,pitch:.03},{x:7,z:113,y:height(7,113)+2.3,yaw:Math.PI,pitch:0},{x:7,z:120,y:height(7,120)+2.3,yaw:Math.PI,pitch:0},{x:80,z:113,y:height(80,113)+2.3,yaw:Math.PI*.75,pitch:.03},{x:-32,z:-51,y:height(-32,-51)+2.3,yaw:0,pitch:.03},{x:55,z:102,y:height(55,102)+2.3,yaw:Math.PI,pitch:.07},{x:70,z:74,y:height(70,74)+2.3,yaw:-Math.PI/2,pitch:.06}]',context),prior:textureData[0]}));}
console.log(JSON.stringify({passed:true,world:vm.runInContext('({buildings:townBuildings,paths:paths.length,bridges:bridges.length,cypresses:cypresses.length,addedCypresses,triangles:triangles.length/27,chunks:chunks.length})',context),fieldCells:context.window.starryField.state.fieldCells,shaderStages:shaders.length,meanModelAngleErrorDegrees:total/300*180/Math.PI,checks:['line-angle wrap','damped settling','zero inertia','model seam','model accuracy','finite vertex data','offscreen RGB stage','no surface strokes','movement','stir','settle','home','camera journey','dual joystick multitouch','pointer cancellation','Studio reset','view selector','river collision','bridge crossing','rear path accessibility','lake collision','rear exploration','all street routes','guided tour clearance','all five bridges','accessible landing','town geometry budget','edge fitting slider','continuous edge walking','diagonal edge walking','periodic terrain and color','periodic collision','uninterrupted brush history','dry cypress placement','cross-boundary road clearance','visible neighbor scenery','spatial draw culling']},null,2));
