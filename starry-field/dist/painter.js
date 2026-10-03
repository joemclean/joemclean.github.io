import {authoredSky,predict} from './dynamics.js';

export const fullscreenVertex=`#version 300 es
precision highp float;
in vec2 position;
out vec2 uv;
void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}`;

// State stores angle, angular velocity, linear depth, and smoothed contrast strength.
// The source image supplies every pigment color. Depth/camera data only transport
// the screen-space history; the painting pass never receives mesh attributes.
export const fieldFragment=`#version 300 es
precision highp float;
in vec2 uv;out vec4 result;
uniform sampler2D sourceImage,sourceDepth,previousField,prior;
uniform vec2 sourceSize,fieldSize;
uniform vec3 eye,right,up,forward,previousEye,previousRight,previousUp,previousForward;
uniform float aspect,focal,dt,inertia,damping,impulse,velocityZero,time,motion;
uniform bool hasHistory,settle;
const float PI=3.14159265;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float lum(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
float zFromDepth(float d){return .200067/(1.000667-(d*2.-1.));}
float error(float a,float b){return .5*atan(sin(2.*(a-b)),cos(2.*(a-b)));}
void main(){
 vec2 pixel=1./sourceSize;
 vec3 rgb=texture(sourceImage,uv).rgb;
 vec3 tensor=vec3(0.);
 // Smoothed RGB gradients at several radii sense both silhouettes and halos.
 // Accumulate the structure tensor before rotating its principal axis 90 deg.
 for(int level=0;level<3;level++){
  float radius=level==0?3.:level==1?12.:32.;
  vec2 dx=vec2(pixel.x*radius,0.),dy=vec2(0.,pixel.y*radius);
  vec3 gx=(texture(sourceImage,uv+dx).rgb-texture(sourceImage,uv-dx).rgb)*.5;
  gx+=(texture(sourceImage,uv+dx+dy).rgb+texture(sourceImage,uv+dx-dy).rgb-texture(sourceImage,uv-dx+dy).rgb-texture(sourceImage,uv-dx-dy).rgb)*.125;
  vec3 gy=(texture(sourceImage,uv+dy).rgb-texture(sourceImage,uv-dy).rgb)*.5;
  gy+=(texture(sourceImage,uv+dy+dx).rgb+texture(sourceImage,uv+dy-dx).rgb-texture(sourceImage,uv-dy+dx).rgb-texture(sourceImage,uv-dy-dx).rgb)*.125;
  // Fine edges dominate where present; coarse gradients extend soft contours.
  float weight=level==0?1.:level==1?.6:.3;
  tensor+=vec3(dot(gx,gx),dot(gx,gy),dot(gy,gy))*weight;
 }
 float energy=tensor.x+tensor.z;
 float anisotropy=length(vec2(tensor.x-tensor.z,2.*tensor.y))/max(energy,1e-8);
 float contour=energy>1e-10?.5*atan(2.*tensor.y,tensor.x-tensor.z)+PI*.5:0.;
 // Normalize confidence: the old squared-gradient threshold missed soft halos.
 float confidence=anisotropy*smoothstep(.00008,.003,energy);
 vec2 preferred=texture(prior,uv).rg*2.-1.;
 float blue=clamp((rgb.b-rgb.r)*5.,0.,1.);
 vec2 direction=mix(vec2(1.,.06),preferred,.25+blue*.75);
 direction=mix(direction,vec2(cos(2.*contour),sin(2.*contour)),confidence);
 float target=dot(direction,direction)>1e-10?.5*atan(direction.y,direction.x):0.;
 // Slowly varying spatial forcing keeps neighboring marks moving together.
 // Strong contours remain the anchor; blank regions have more freedom.
 vec2 flowPosition=uv*fieldSize;
 float drift=sin(time*.65)*sin(dot(flowPosition,vec2(.12,.09))+time*.25);
 drift+=.4*sin(time*.95)*cos(dot(flowPosition,vec2(.06,-.10))-time*.22);
 target+=min(motion,1.)*(.38*(1.-confidence)+.035)*drift;
 float depth=texture(sourceDepth,uv).r,z=zFromDepth(depth);
 vec3 ray=normalize(forward+right*(uv.x*2.-1.)*aspect/focal+up*(uv.y*2.-1.)/focal);
 vec3 world=eye+ray*z/max(.01,dot(ray,forward));
 bool isSky=depth>.999999;
 vec3 previousDelta=isSky?ray:world-previousEye;
 float pz=dot(previousDelta,previousForward);
 vec2 oldUV=vec2(dot(previousDelta,previousRight)*focal/aspect,dot(previousDelta,previousUp)*focal)/max(pz,.001)*.5+.5;
 bool valid=hasHistory&&pz>0.&&all(greaterThanEqual(oldUV,vec2(0.)))&&all(lessThanEqual(oldUV,vec2(1.)));
 vec4 old=texture(previousField,clamp(oldUV,vec2(0.),vec2(1.)));
 valid=valid&&old.a>0.;
 if(isSky)valid=valid&&old.b>.99;
 else valid=valid&&abs(old.b*300.-pz)<max(.65,pz*.055);
 float angle=target,velocity=0.,contrastTag=.03+.96*smoothstep(.00008,.003,energy);
 if(valid){
  float oldAngle=(old.r-.5)*2.*PI;
  vec3 transported=previousRight*cos(oldAngle)+previousUp*sin(oldAngle);
  angle=atan(dot(transported,up),dot(transported,right));
  velocity=(old.g-velocityZero)*16.;contrastTag=mix(old.a,contrastTag,1.-exp(-dt*8.));
 }
 // Neighbor springs operate on transported orientations, with depth rejection.
 // Double-angle vectors couple brush axes without a discontinuity at +/- PI.
 vec2 neighbors=vec2(0.);float neighborWeight=0.;
 if(valid)for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){
  if(i==0&&j==0)continue;
  vec2 nUV=oldUV+vec2(float(i),float(j))/fieldSize;
  if(any(lessThan(nUV,vec2(0.)))||any(greaterThan(nUV,vec2(1.))))continue;
  vec4 n=texture(previousField,nUV);
  float weight=isSky?(n.b>.99?1.:0.):1.-smoothstep(max(.65,pz*.025),max(1.2,pz*.055),abs(n.b*300.-pz));
  if(n.a<=0.)weight=0.;
  if(i!=0&&j!=0)weight*=.5;
  float na=(n.r-.5)*2.*PI;
  vec3 nd=previousRight*cos(na)+previousUp*sin(na);
  na=atan(dot(nd,up),dot(nd,right));
  neighbors+=vec2(cos(2.*na),sin(2.*na))*weight;neighborWeight+=weight;
 }
 if(neighborWeight>0.)neighbors/=neighborWeight;
 // A compact kick: surrounding cells respond through their springs next frame.
 float radius=length((uv-vec2(.35,.65))*fieldSize);
 if(impulse>0.)velocity+=6.*exp(-radius*radius/5.)*impulse;
 if(inertia<.025||settle){angle=target;velocity=0.;}
 else{
  float mass=.12+inertia*2.8,drag=1.+damping*17.;
  int steps=int(clamp(ceil(dt*120.),1.,6.));float h=dt/float(steps);
  for(int i=0;i<6;i++){if(i>=steps)break;float coupling=40.*(1.-.8*confidence)*(neighbors.y*cos(2.*angle)-neighbors.x*sin(2.*angle));velocity+=((12.+40.*confidence)*error(target,angle)+coupling-drag*velocity)/mass*h;velocity=clamp(velocity,-8.,8.);angle+=velocity*h;}
 }
 angle=atan(sin(angle),cos(angle));
 result=vec4(angle/(2.*PI)+.5,velocity/16.+velocityZero,isSky?1.:min(z/300.,.989),contrastTag);
}`;

export const paintingFragment=`#version 300 es
precision highp float;
in vec2 uv;out vec4 result;
uniform sampler2D sourceImage,fieldState,sourceDepth;
uniform vec2 fieldSize,sourceSize;
uniform float brushSize,time,motion,rotation,morphTime;
uniform float brushLength,brushWidth,brushCurvature,sizeVariance,textureStrength,detailStrength,densityStrength,edgeStrength;
uniform int view;
const float PI=3.14159265;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float zFromDepth(float d){return .200067/(1.000667-(d*2.-1.));}
vec3 source(vec2 p){return texture(sourceImage,clamp(p,vec2(0.),vec2(1.))).rgb;}
// Fit each end to the color region it actually paints. Probes follow the
// curved centerline, starting at the pigment anchor rather than the grid cell.
// Cumulative disagreement stops a stroke at its first boundary, including
// a dark-to-light-to-dark feature whose far endpoint has the original color.
float regionRisk(vec2 p,vec3 pigment,float anchorDepth){
 vec3 delta=source(p)-pigment;
 float colorRisk=smoothstep(.09,.32,sqrt(dot(delta,delta)/3.));
 float d=texture(sourceDepth,clamp(p,vec2(0.),vec2(1.))).r;
 bool sky=d>.999999,anchorSky=anchorDepth>.999999;
 float z=zFromDepth(anchorDepth);
 float depthRisk=sky!=anchorSky?1.:anchorSky?0.:smoothstep(max(.45,z*.035),max(1.4,z*.12),abs(zFromDepth(d)-z));
 return max(colorRisk,depthRisk);
}
float fittedLength(vec2 anchor,vec2 along,vec2 across,float curve,float nominal,float side,vec3 pigment,float depth,float scale){
 float safe=nominal,risk=0.;
 for(int i=1;i<=6;i++){
  float t=float(i)/6.,x=nominal*t*side;
  vec2 offset=along*x+across*clamp(curve*x*x,-.65/brushSize,.65/brushSize);
  vec2 p=anchor+offset*brushSize*scale/fieldSize;
  risk=max(risk,regionRisk(p,pigment,depth));
  // Begin pulling back before a categorical cutoff; retain a small dab.
  safe=min(safe,mix(nominal,max(nominal*.12,nominal*(t-1./6.)),risk));
  if(risk>.999)break;
 }
 return mix(nominal,safe,edgeStrength);
}
// Interpolate unoriented axes, not wrapped angles, to avoid jumps as a mark
// travels between cells. The same samples provide a smooth curvature derivative.
float fieldAngle(vec2 p,out vec2 gradient,out float contrast,out float linearDepth){
 vec2 cell=p*fieldSize-.5,base=floor(cell),f=fract(cell);
 vec4 s0=texture(fieldState,(base+.5)/fieldSize),s1=texture(fieldState,(base+vec2(1.5,.5))/fieldSize),s2=texture(fieldState,(base+vec2(.5,1.5))/fieldSize),s3=texture(fieldState,(base+1.5)/fieldSize);
 linearDepth=mix(mix(s0.b,s1.b,f.x),mix(s2.b,s3.b,f.x),f.y);
 contrast=clamp((mix(mix(s0.a,s1.a,f.x),mix(s2.a,s3.a,f.x),f.y)-.03)/.96,0.,1.);
 vec4 samples=vec4(s0.r,s1.r,s2.r,s3.r);
 samples=(samples-.5)*4.*PI;
 vec2 a=vec2(cos(samples.x),sin(samples.x)),b=vec2(cos(samples.y),sin(samples.y)),c=vec2(cos(samples.z),sin(samples.z)),d=vec2(cos(samples.w),sin(samples.w));
 vec2 axis=mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
 vec2 dx=mix(b-a,d-c,f.y),dy=mix(c-a,d-b,f.x);
 float norm=max(dot(axis,axis),.1);
 gradient=.5*vec2(axis.x*dx.y-axis.y*dx.x,axis.x*dy.y-axis.y*dy.x)/norm;
 return dot(axis,axis)>1e-8?.5*atan(axis.y,axis.x):0.;
}
// Opaque undercoat reconstructed exclusively from overlapping broad marks.
// Center jitter <= .18 and minimum ellipse radius > 1 guarantee coverage by
// the nearest cell, including screen corners of the overscanned rotating grid.
vec3 undercoat(mat2 spin,mat2 unspin){
 float scale=2.8*brushSize;
 vec2 grid=fieldSize/scale,position=unspin*((uv-.5)*fieldSize)/scale+grid*.5,cell=floor(position);
 vec3 pigmentSum=vec3(0.);float weightSum=0.;
 for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
  vec2 index=cell+vec2(float(x),float(y));float seed=hash(index+271.);
  vec2 center=index+.5+vec2(sin(seed*41.),cos(seed*63.))*.12;
  center+=.06*vec2(sin(morphTime*.25+seed*29.),cos(morphTime*.21+seed*47.));
  vec2 sampleUV=.5+spin*((center-grid*.5)*scale)/fieldSize;
  vec2 gradient;float ignoredContrast,ignoredDepth;float angle=fieldAngle(sampleUV,gradient,ignoredContrast,ignoredDepth)-rotation;
  vec2 along=vec2(cos(angle),sin(angle)),across=vec2(-along.y,along.x),q=position-center;
  float sx=dot(q,along),sy=dot(q,across);
  float length=1.5+.12*sin(seed*31.+morphTime*.2),width=1.25+.05*cos(seed*57.+morphTime*.23);
  float edge=sqrt(pow(sx/length,2.)+pow(sy/width,2.));
  float coverage=1.-smoothstep(.7,1.,edge);
  vec2 sampleAlong=spin*(along*.12*scale)/fieldSize;
  vec3 pigment=source(sampleUV)*.6+(source(sampleUV+sampleAlong)+source(sampleUV-sampleAlong))*.2;
  pigment*=1.+.08*sin(seed*113.+morphTime*.18);
  pigment+=vec3(.012,.006,-.009)*sin(seed*179.+morphTime*.16);
  pigment*=1.+textureStrength*.018*sin(sy*35.+seed*17.);
  pigmentSum+=clamp(pigment,0.,1.)*coverage;weightSum+=coverage;
 }
 // No source-frame fallback: even gaps in the detail layers reveal paint.
 return pigmentSum/max(weightSum,1e-6);
}
void main(){
 if(view==1||(view==3&&uv.x<.5)){result=vec4(source(uv),1.);return;}
 mat2 spin=mat2(cos(rotation),sin(rotation),-sin(rotation),cos(rotation));
 mat2 unspin=transpose(spin);
 vec3 color=undercoat(spin,unspin);
 if(view==4){result=vec4(color,1.);return;}
 float currentDepth=texture(sourceDepth,uv).r,currentZ=zFromDepth(currentDepth);
 if(view==2)color*=.24;
 // Stable nested lattices allow local density changes without moving grid boundaries.
 vec2 ignoredGradient;float pixelContrast,pixelDepth;fieldAngle(uv,ignoredGradient,pixelContrast,pixelDepth);
 for(int layer=0;layer<4;layer++){
 float scale=layer==0?4.6:layer==1?1.85:layer==2?1.:.68;
 if(layer==2&&(view==2||detailStrength*pixelContrast<.01))continue;
 if(layer==3&&(view==2||densityStrength<=0.))continue;
 if(view==2&&layer==0)continue;
 vec2 grid=fieldSize/scale,position=unspin*((uv-.5)*fieldSize)/scale+grid*.5,cell=floor(position);
 // Expand the candidate neighborhood only when shape controls enlarge it.
 int reach=layer==2?2:(brushLength<=1.01&&brushWidth<=1.01&&brushCurvature<=1.01)?1:3;
 for(int y=-3;y<=3;y++)for(int x=-3;x<=3;x++){
  if(abs(x)>reach||abs(y)>reach)continue;
  vec2 index=cell+vec2(float(x),float(y));
  float seed=hash(index+float(layer)*83.);
  if(layer==0&&seed<.32)continue;
  float shapePhase=morphTime*.55+seed*37.;
  float strokeLength=min(mix(1.1,.48+pow(fract(seed*13.7),.65),sizeVariance),1.35/brushSize)*brushLength;
  float width=mix(.37,.15+.43*pow(fract(seed*29.3),1.2),sizeVariance)*brushWidth;
  strokeLength*=.90+.10*sin(shapePhase);width*=1.+.24*sin(shapePhase*.83+1.7);
  width=min(width,1.25/brushSize);
  vec2 center=index+.5+vec2(sin(seed*55.),cos(seed*71.))*.36;
  center+=min(motion,1.)*.18*vec2(sin(time*.7+dot(index,vec2(.31,.21))),cos(time*.6+dot(index,vec2(.19,-.23))));
  vec2 q=position-center;
  float extent=sqrt(pow(strokeLength*brushSize,2.)+pow(width*brushSize+.65,2.));
  if(view!=2&&dot(q,q)>extent*extent)continue;
  vec2 sampleUV=.5+spin*((index+.5-grid*.5)*scale)/fieldSize;
  vec2 angleGradient;
  float markContrast,markLinearDepth;float angle=fieldAngle(sampleUV,angleGradient,markContrast,markLinearDepth)-rotation;
  float adaptation=detailStrength*markContrast;
  // Reprojected, smoothed field contrast and linear depth steer stroke density.
  // Sky has no distance boost. Fixed thresholds let marks fade in, never reseed.
  float distanceDetail=markLinearDepth<.99?smoothstep(12.,100.,markLinearDepth*300.):0.;
  float density=densityStrength*clamp(.8*markContrast+.2*distanceDetail,0.,1.);
  float emergence=smoothstep(seed*.8,seed*.8+.2,density);
  if(layer==3&&emergence<=0.)continue;
  if(layer==2&&adaptation<.01)continue;
  float sizeFactor=(1.-.45*adaptation)*(layer>=2?.8:1.);
  strokeLength*=sizeFactor;width*=sizeFactor;
  vec2 along=vec2(cos(angle),sin(angle)),across=vec2(-along.y,along.x);
  float sx=dot(q,along)/brushSize,sy=dot(q,across)/brushSize;
  // Curve broad marks with the actual surrounding orientation, not random arcs.
  float curve=clamp(.5*dot(angleGradient,spin*along)*scale,-.38,.38)*brushSize;
  curve+=.055*sin(shapePhase*.77+seed*11.);
  curve*=brushCurvature;
  if(view==2){strokeLength=.42;width=.035;curve=0.;}
  sy-=clamp(curve*sx*sx,-.65/brushSize,.65/brushSize);
  // Reject empty footprint pixels before doing the bounded region probes.
  if(view!=2&&(abs(sx)>strokeLength||abs(sy)>width*1.3))continue;
  vec2 pigmentUV=.5+spin*((center-grid*.5)*scale)/fieldSize;
  vec3 pigment=source(pigmentUV);
  float positiveLength=strokeLength,negativeLength=strokeLength;
  if(view!=2&&edgeStrength>0.){
   vec2 screenAlong=spin*along,screenAcross=spin*across;
   float anchorDepth=texture(sourceDepth,clamp(pigmentUV,vec2(0.),vec2(1.))).r;
   positiveLength=fittedLength(pigmentUV,screenAlong,screenAcross,curve,strokeLength,1.,pigment,anchorDepth,scale);
   negativeLength=fittedLength(pigmentUV,screenAlong,screenAcross,curve,strokeLength,-1.,pigment,anchorDepth,scale);
   // Width matters too: long strokes can follow a slender feature safely.
   vec2 span=screenAcross*width*brushSize*scale/fieldSize;
   float sideRisk=max(regionRisk(pigmentUV+span,pigment,anchorDepth),regionRisk(pigmentUV-span,pigment,anchorDepth));
   width*=1.-.72*edgeStrength*sideRisk;
  }
  float fitted=sx>=0.?positiveLength:negativeLength;
  if(view!=2&&(abs(sx)>fitted||abs(sy)>width*1.3))continue;
  float taper=pow(max(0.,1.-pow(abs(sx)/fitted,2.)),.5+.12*sin(shapePhase*.67));
  float edge=abs(sy)/(width*max(.1,taper));
  float fiber=textureStrength*(.035*sin(sy*44.+seed*8.)+.025*sin(sx*17.+seed*22.));
  float coverage=(1.-smoothstep(.75,1.08,edge+fiber))*(1.-smoothstep(fitted*.85,fitted,abs(sx)));
  float markDepth=texture(sourceDepth,sampleUV).r,markZ=zFromDepth(markDepth);
  // Depth limits overlap between distant surfaces; a small edge fringe below
  // lets the painted silhouette depart from the exact game geometry.
  float compatible=(currentDepth>.999999&&markDepth>.999999)?1.:1.-smoothstep(max(.8,currentZ*.035),max(2.,currentZ*.11),abs(markZ-currentZ));
  // Permit a narrow band of paint to cross a silhouette instead of clipping
  // every overlapping mark to the exact game depth boundary.
  float fringe=(1.-smoothstep(5.,18.*brushSize,distance(uv*sourceSize,sampleUV*sourceSize)))*.7;
  coverage*=max(compatible,fringe);
  if(layer==0)coverage*=1.-.75*adaptation;
  if(layer==2)coverage*=adaptation;
  if(layer==3)coverage*=emergence;
  float variation=1.+(layer==0?.20:.16)*sin(seed*123.+morphTime*.32);
  float grain=hash(floor(vec2(sx,sy)*32.)+seed*91.)-.5;
  float ridges=1.+textureStrength*(.025*sin(sy*40.+seed*19.)+.018*cos(sy*71.+sx*5.)+.035*grain);
  // Pigment offsets belong to each mark: warm/cool and light/dark departures
  // from the source color, rather than fresh per-frame pixel noise.
  vec3 offset=vec3(.038,.012,-.032)*sin(seed*199.+morphTime*.27)+vec3(-.015,.028,.016)*sin(seed*317.-morphTime*.21);
  offset+=vec3(.018*sin(seed*241.+morphTime*.34));
  pigment=clamp(pigment*variation*ridges+offset,0.,1.);
  if(view==2)pigment=vec3(.94,.76,.4);
  color=mix(color,pigment,coverage*(layer==0?.65:.9));
 }
 }
 // Subtle fixed canvas tooth, without binary hatch stripes.
 if(view!=2)color*=1.+textureStrength*(-.007+.007*sin(gl_FragCoord.x*2.4)*sin(gl_FragCoord.y*2.1));
 if(view==3&&abs(uv.x-.5)<1.5/sourceSize.x)color=vec3(.95,.79,.46);
 result=vec4(color,1.);
}`;

export class FramePainter{
 constructor(gl,makeProgram){
  this.gl=gl;this.time=0;this.rotation=0;this.morphTime=0;this.density=0;this.width=0;this.height=0;this.history=false;this.previous=null;this.pendingImpulse=0;this.pendingSettle=false;this.read=0;
  this.fieldProgram=makeProgram(fullscreenVertex,fieldFragment);this.paintProgram=makeProgram(fullscreenVertex,paintingFragment);
  this.floatState=!!gl.getExtension('EXT_color_buffer_float');
  this.vao=gl.createVertexArray();gl.bindVertexArray(this.vao);const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
  for(const p of [this.fieldProgram,this.paintProgram]){const a=gl.getAttribLocation(p,'position');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);}gl.bindVertexArray(null);
  this.rulesPrior=this.makePrior(null);this.learnedPrior=null;
 }
 texture(w,h,internal,type,format=this.gl.RGBA,data=null){const g=this.gl,t=g.createTexture();g.bindTexture(g.TEXTURE_2D,t);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.NEAREST);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,g.NEAREST);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.CLAMP_TO_EDGE);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE);g.texImage2D(g.TEXTURE_2D,0,internal,w,h,0,format,type,data);return t;}
 makePrior(model){const g=this.gl,w=128,h=128,a=new Uint8Array(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const u=.34+.32*(x+.5)/w,v=.45+.5*(y+.5)/h,angle=model?predict(model,u,v):authoredSky(u,v),i=(y*w+x)*4;a[i]=Math.round((Math.cos(angle*2)*.5+.5)*255);a[i+1]=Math.round((Math.sin(angle*2)*.5+.5)*255);a[i+3]=255;}const t=this.texture(w,h,g.RGBA8,g.UNSIGNED_BYTE,g.RGBA,a);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,g.LINEAR);return t;}
 setModel(m){if(this.learnedPrior)this.gl.deleteTexture(this.learnedPrior);this.learnedPrior=this.makePrior(m);}
 framebuffer(color,depth=null){const g=this.gl,f=g.createFramebuffer();g.bindFramebuffer(g.FRAMEBUFFER,f);g.framebufferTexture2D(g.FRAMEBUFFER,g.COLOR_ATTACHMENT0,g.TEXTURE_2D,color,0);if(depth)g.framebufferTexture2D(g.FRAMEBUFFER,g.DEPTH_ATTACHMENT,g.TEXTURE_2D,depth,0);if(g.checkFramebufferStatus(g.FRAMEBUFFER)!==g.FRAMEBUFFER_COMPLETE)throw Error('Painting framebuffer is unavailable');return f;}
 resize(w,h,spacing=11){
  const cols=Math.max(16,Math.round(w/spacing)),rows=Math.max(16,Math.round(h/spacing));
  if(w===this.width&&h===this.height&&cols===this.cols&&rows===this.rows)return;
  const g=this.gl;
  if(w!==this.width||h!==this.height){
   for(const t of [this.image,this.depth])if(t)g.deleteTexture(t);
   if(this.sourceFBO)g.deleteFramebuffer(this.sourceFBO);
   this.width=w;this.height=h;
   this.image=this.texture(w,h,g.RGBA8,g.UNSIGNED_BYTE);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,g.LINEAR);
   this.depth=this.texture(w,h,g.DEPTH_COMPONENT24,g.UNSIGNED_INT,g.DEPTH_COMPONENT);this.sourceFBO=this.framebuffer(this.image,this.depth);
  }
  for(const t of this.states||[])g.deleteTexture(t);
  for(const f of this.stateFBOs||[])g.deleteFramebuffer(f);
  this.cols=cols;this.rows=rows;
  this.states=[0,1].map(()=>this.texture(cols,rows,this.floatState?g.RGBA16F:g.RGBA8,this.floatState?g.HALF_FLOAT:g.UNSIGNED_BYTE));this.stateFBOs=this.states.map(t=>this.framebuffer(t));this.reset();g.bindFramebuffer(g.FRAMEBUFFER,null);
 }

 reset(){this.history=false;this.previous=null;this.read=0;}
 beginSource(){const g=this.gl;g.bindFramebuffer(g.FRAMEBUFFER,this.sourceFBO);g.viewport(0,0,this.width,this.height);}
 bind(p,name,t,unit){const g=this.gl;g.activeTexture(g.TEXTURE0+unit);g.bindTexture(g.TEXTURE_2D,t);g.uniform1i(g.getUniformLocation(p,name),unit);}
 finish(camera,basis,settings,dt){const elapsed=Math.max(0,Math.min(dt,.05));this.density+=((settings.density??0)-this.density)*(1-Math.exp(-elapsed*6));if(settings.density===0&&this.density<.001)this.density=0;this.time+=elapsed*Math.max(1,settings.motion??.65);this.morphTime+=elapsed*(settings.motion??.65);this.rotation=(this.rotation+elapsed*.014*(settings.motion??.65))%(Math.PI*2);const g=this.gl,current={eye:[camera.x,camera.y,camera.z],...basis},previous=this.previous||current,p=this.fieldProgram,write=1-this.read;
  g.disable(g.DEPTH_TEST);g.disable(g.BLEND);g.useProgram(p);g.bindVertexArray(this.vao);g.bindFramebuffer(g.FRAMEBUFFER,this.stateFBOs[write]);g.viewport(0,0,this.cols,this.rows);
  this.bind(p,'sourceImage',this.image,0);this.bind(p,'sourceDepth',this.depth,1);this.bind(p,'previousField',this.states[this.read],2);this.bind(p,'prior',settings.controller==='learned'&&this.learnedPrior?this.learnedPrior:this.rulesPrior,3);
  // Reproject relative to the current eye; subtract global positions in JS
  // before GPU float conversion so long walks retain subpixel precision.
  for(const n of ['eye','right','up','forward']){g.uniform3fv(g.getUniformLocation(p,n),n==='eye'?[0,0,0]:current[n]);g.uniform3fv(g.getUniformLocation(p,'previous'+n[0].toUpperCase()+n.slice(1)),n==='eye'?previous.eye.map((v,i)=>v-current.eye[i]):previous[n]);}
  for(const [n,v] of Object.entries({aspect:this.width/this.height,focal:1/Math.tan(Math.PI/5),dt:Math.max(1/240,Math.min(dt,.05)),inertia:settings.inertia,damping:settings.damping,time:this.time,motion:settings.motion??.65,impulse:this.pendingImpulse,velocityZero:this.floatState?.5:128/255}))g.uniform1f(g.getUniformLocation(p,n),v);
  g.uniform2f(g.getUniformLocation(p,'sourceSize'),this.width,this.height);g.uniform2f(g.getUniformLocation(p,'fieldSize'),this.cols,this.rows);g.uniform1i(g.getUniformLocation(p,'hasHistory'),this.history?1:0);g.uniform1i(g.getUniformLocation(p,'settle'),this.pendingSettle?1:0);g.drawArrays(g.TRIANGLES,0,3);
  this.read=write;this.history=true;this.previous=current;this.pendingImpulse=0;this.pendingSettle=false;
  const q=this.paintProgram;g.useProgram(q);g.bindFramebuffer(g.FRAMEBUFFER,null);g.viewport(0,0,this.width,this.height);this.bind(q,'sourceImage',this.image,0);this.bind(q,'fieldState',this.states[this.read],1);this.bind(q,'sourceDepth',this.depth,2);g.uniform2f(g.getUniformLocation(q,'fieldSize'),this.cols,this.rows);g.uniform2f(g.getUniformLocation(q,'sourceSize'),this.width,this.height);g.uniform1f(g.getUniformLocation(q,'brushSize'),settings.size);g.uniform1f(g.getUniformLocation(q,'time'),this.time);g.uniform1f(g.getUniformLocation(q,'rotation'),this.rotation);g.uniform1f(g.getUniformLocation(q,'morphTime'),this.morphTime);g.uniform1f(g.getUniformLocation(q,'motion'),settings.motion??.65);for(const [name,value] of Object.entries({brushLength:settings.length??1,brushWidth:settings.width??1,brushCurvature:settings.curvature??1,sizeVariance:settings.variance??1,textureStrength:settings.texture??1,detailStrength:settings.detail??.65,densityStrength:this.density,edgeStrength:settings.edges??.7}))g.uniform1f(g.getUniformLocation(q,name),value);g.uniform1i(g.getUniformLocation(q,'view'),({paint:0,raw:1,field:2,split:3,undercoat:4})[settings.view]??0);g.drawArrays(g.TRIANGLES,0,3);g.bindVertexArray(null);
 }
}
