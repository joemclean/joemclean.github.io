export const TAU=Math.PI*2;
export function wrapAngle(x){return Math.atan2(Math.sin(x),Math.cos(x));}
// Brushes are unoriented lines: angles separated by pi represent the same mark.
export function lineError(target,current){return .5*wrapAngle(2*(target-current));}
export function advance(angle,velocity,target,dt,inertia,damping){
 if(inertia<.025)return [angle+lineError(target,angle),0];
 const mass=.12+inertia*2.8,k=12,drag=1+damping*17;
 velocity+=(k*lineError(target,angle)-drag*velocity)/mass*dt;
 velocity=Math.max(-8,Math.min(8,velocity));
 return [wrapAngle(angle+velocity*dt),velocity];
}
export function authoredSky(u,v){
 let x=1,y=.28*Math.sin(u*TAU*3+v*5);
 for(const [cx,cy,strength,scale] of [[.49,.64,1.8,.11],[.65,.70,-1.2,.08],[.35,.77,.9,.06]]){
  let dx=u-cx;dx-=Math.round(dx);const dy=v-cy;
  const weight=strength*Math.exp(-(dx*dx+dy*dy)/(scale*scale));
  x+=-dy/scale*weight*3;y+=dx/scale*weight*3;
 }
 return Math.atan2(y,x);
}
export function features(u,v){return [v*2-1,Math.sin(TAU*u),Math.cos(TAU*u),Math.sin(2*TAU*u),Math.cos(2*TAU*u),Math.sin(3*TAU*u),Math.cos(3*TAU*u),Math.sin(Math.PI*v),Math.cos(Math.PI*v)];}
export function predict(model,u,v){
 let a=features(u,v);
 for(let l=0;l<model.layers.length;l++){
  const layer=model.layers[l],out=new Array(layer.b.length);
  for(let j=0;j<out.length;j++){let s=layer.b[j];for(let i=0;i<a.length;i++)s+=a[i]*layer.w[i][j];out[j]=l<model.layers.length-1?Math.tanh(s):s;}
  a=out;
 }
 return .5*Math.atan2(a[1],a[0]);
}
