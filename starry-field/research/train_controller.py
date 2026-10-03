"""Distill an authored periodic sky line field into a tiny MLP, using only NumPy.

This is an interface experiment, NOT training on Starry Night or image style loss.
The browser applies the predicted preferred angles through persistent dynamics.
Run: OPENBLAS_NUM_THREADS=1 python research/train_controller.py
"""
import json
from pathlib import Path
import numpy as np

TAU=2*np.pi
def features(u,v):
    return np.stack([2*v-1,np.sin(TAU*u),np.cos(TAU*u),np.sin(2*TAU*u),np.cos(2*TAU*u),np.sin(3*TAU*u),np.cos(3*TAU*u),np.sin(np.pi*v),np.cos(np.pi*v)],axis=-1)
def field(u,v):
    x=np.ones_like(u);y=.28*np.sin(u*TAU*3+v*5)
    for cx,cy,strength,scale in [(.49,.64,1.8,.11),(.65,.70,-1.2,.08),(.35,.77,.9,.06)]:
        dx=u-cx;dx-=np.round(dx);dy=v-cy
        w=strength*np.exp(-(dx*dx+dy*dy)/(scale*scale))
        x+=-dy/scale*w*3;y+=dx/scale*w*3
    return np.arctan2(y,x)
def main():
    rng=np.random.default_rng(19)
    u=rng.random(12000);v=rng.uniform(.45,.98,12000)
    x=features(u,v).astype(np.float32);theta=field(u,v)
    y=np.stack([np.cos(2*theta),np.sin(2*theta)],axis=-1).astype(np.float32)
    dims=[9,32,32,2]
    weights=[(rng.standard_normal((a,b))*np.sqrt(1/a)).astype(np.float32) for a,b in zip(dims[:-1],dims[1:])]
    biases=[np.zeros(b,dtype=np.float32) for b in dims[1:]]
    params=weights+biases;m=[np.zeros_like(p) for p in params];s=[np.zeros_like(p) for p in params]
    for step in range(1,7001):
        ids=rng.integers(0,len(x),512);a=[x[ids]]
        for i,(w,b) in enumerate(zip(weights,biases)):
            z=a[-1]@w+b;a.append(np.tanh(z) if i<2 else z)
        d=2*(a[-1]-y[ids])/len(ids);gw=[None]*3;gb=[None]*3
        for i in range(2,-1,-1):
            if i<2:d*=1-a[i+1]**2
            gw[i]=a[i].T@d;gb[i]=d.sum(axis=0);d=d@weights[i].T
        lr=.003 if step<5000 else .0007
        for p,g,mi,si in zip(params,gw+gb,m,s):
            mi*=.9;mi+=.1*g;si*=.999;si+=.001*g*g
            p-=lr*(mi/(1-.9**step))/(np.sqrt(si/(1-.999**step))+1e-8)
    tu=rng.random(4000);tv=rng.uniform(.45,.98,4000);a=features(tu,tv)
    for i,(w,b) in enumerate(zip(weights,biases)):
        a=a@w+b
        if i<2:a=np.tanh(a)
    pred=.5*np.arctan2(a[:,1],a[:,0]);delta=pred-field(tu,tv)
    errors=np.abs(.5*np.arctan2(np.sin(2*delta),np.cos(2*delta)))*180/np.pi
    report={'seed':19,'training_samples':12000,'held_out_samples':4000,'steps':7000,'parameters':sum(p.size for p in params),'median_angle_error_degrees':float(np.median(errors)),'p90_angle_error_degrees':float(np.percentile(errors,90)),'mean_angle_error_degrees':float(np.mean(errors)),'training_source':'synthetic authored sky line field; no painting images','architecture':dims,'domain':'periodic sky longitude u in [0,1], latitude coordinate v in [0.45,0.98]'}
    root=Path(__file__).resolve().parents[1]
    (root/'dist/controller.json').write_text(json.dumps({'layers':[{'w':w.tolist(),'b':b.tolist()} for w,b in zip(weights,biases)],'report':report},separators=(',',':')))
    (root/'research/training-report.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))
if __name__=='__main__':main()
