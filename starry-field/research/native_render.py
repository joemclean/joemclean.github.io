"""Compile the actual GLSL and render the actual scene using headless Mesa GLES.

Native GPU validation, not browser/UI QA. Run check.mjs --render first.
"""
import ctypes as C
import json
import sys
import numpy as np
from PIL import Image

E=C.CDLL('libEGL.so.1');E.eglGetProcAddress.argtypes=[C.c_char_p];E.eglGetProcAddress.restype=C.c_void_p
def egl(name,ret,args):
    f=getattr(E,name);f.restype=ret;f.argtypes=args;return f
def gl(name,ret,args):return C.CFUNCTYPE(ret,*args)(E.eglGetProcAddress(name.encode()))
I=C.c_int;U=C.c_uint;F=C.c_float;P=C.c_void_p
display_fn=C.CFUNCTYPE(P,U,P,C.POINTER(I))(E.eglGetProcAddress(b'eglGetPlatformDisplayEXT'))
d=display_fn(0x31DD,None,None);major=I();minor=I()
assert egl('eglInitialize',U,[P,C.POINTER(I),C.POINTER(I)])(d,C.byref(major),C.byref(minor))
assert egl('eglBindAPI',U,[U])(0x30A0)
attrs=(I*13)(0x3033,1,0x3040,0x40,0x3024,8,0x3023,8,0x3022,8,0x3025,24,0x3038)
config=P();num=I();assert egl('eglChooseConfig',U,[P,C.POINTER(I),C.POINTER(P),I,C.POINTER(I)])(d,attrs,C.byref(config),1,C.byref(num)) and num.value
w,h=1200,800
surfattrs=(I*5)(0x3057,w,0x3056,h,0x3038)
surf=egl('eglCreatePbufferSurface',P,[P,P,C.POINTER(I)])(d,config,surfattrs)
ctxattrs=(I*3)(0x3098,3,0x3038);ctx=egl('eglCreateContext',P,[P,P,P,C.POINTER(I)])(d,config,None,ctxattrs)
assert egl('eglMakeCurrent',U,[P,P,P,P])(d,surf,surf,ctx)
CreateShader=gl('glCreateShader',U,[U]);ShaderSource=gl('glShaderSource',None,[U,I,C.POINTER(C.c_char_p),C.POINTER(I)]);CompileShader=gl('glCompileShader',None,[U]);GetShaderiv=gl('glGetShaderiv',None,[U,U,C.POINTER(I)]);GetShaderInfoLog=gl('glGetShaderInfoLog',None,[U,I,C.POINTER(I),C.c_char_p]);CreateProgram=gl('glCreateProgram',U,[]);AttachShader=gl('glAttachShader',None,[U,U]);LinkProgram=gl('glLinkProgram',None,[U]);GetProgramiv=gl('glGetProgramiv',None,[U,U,C.POINTER(I)]);GetProgramInfoLog=gl('glGetProgramInfoLog',None,[U,I,C.POINTER(I),C.c_char_p])
data=json.load(open('/tmp/starry-field-render.json'));programs=[]
for i in range(0,len(data['shaders']),2):
    p=CreateProgram()
    for typ,source in zip([0x8B31,0x8B30],data['shaders'][i:i+2]):
        s=CreateShader(typ);src=C.c_char_p(source.encode());ShaderSource(s,1,C.byref(src),None);CompileShader(s);ok=I();GetShaderiv(s,0x8B81,C.byref(ok))
        if not ok.value:
            log=C.create_string_buffer(10000);GetShaderInfoLog(s,10000,None,log);raise RuntimeError(log.value.decode())
        AttachShader(p,s)
    LinkProgram(p);ok=I();GetProgramiv(p,0x8B82,C.byref(ok))
    if not ok.value:
        log=C.create_string_buffer(10000);GetProgramInfoLog(p,10000,None,log);raise RuntimeError(log.value.decode())
    programs.append(p)
GenVertexArrays=gl('glGenVertexArrays',None,[I,C.POINTER(U)]);BindVertexArray=gl('glBindVertexArray',None,[U]);GenBuffers=gl('glGenBuffers',None,[I,C.POINTER(U)]);BindBuffer=gl('glBindBuffer',None,[U,U]);BufferData=gl('glBufferData',None,[U,C.c_ssize_t,P,U]);GetAttribLocation=gl('glGetAttribLocation',I,[U,C.c_char_p]);EnableVertexAttribArray=gl('glEnableVertexAttribArray',None,[U]);VertexAttribPointer=gl('glVertexAttribPointer',None,[U,I,U,U,I,P]);VertexAttribDivisor=gl('glVertexAttribDivisor',None,[U,U]);UseProgram=gl('glUseProgram',None,[U]);GetUniformLocation=gl('glGetUniformLocation',I,[U,C.c_char_p]);Uniform3f=gl('glUniform3f',None,[I,F,F,F]);Uniform1f=gl('glUniform1f',None,[I,F]);Uniform1i=gl('glUniform1i',None,[I,I])
def upload(index):
    a=np.array(data['arrays'][index],dtype=np.float32);b=U();GenBuffers(1,C.byref(b));BindBuffer(0x8892,b);BufferData(0x8892,a.nbytes,a.ctypes.data,0x88E4)
def attribute(p,n,count,stride,offset,divisor=0):
    loc=GetAttribLocation(p,n.encode())
    if loc<0:return
    EnableVertexAttribArray(loc);VertexAttribPointer(loc,count,0x1406,0,stride*4,P(offset*4));VertexAttribDivisor(loc,divisor)
vaos=[]
for i in range(4):
    vao=U();GenVertexArrays(1,C.byref(vao));BindVertexArray(vao);vaos.append(vao.value);p=programs[i]
    if i==0:
        upload(1)
        for n,off in [('position',0),('normal',3),('paint',6)]:attribute(p,n,3,9,off)
    else:upload(0);attribute(p,'position',2,2,0)
camera=data['camera'];yaw=camera['yaw'];pitch=camera['pitch'];cy=np.cos(yaw);sy=np.sin(yaw);cp=np.cos(pitch);sp=np.sin(pitch)
vectors={'eye':[camera['x'],camera['y'],camera['z']],'right':[cy,0,sy],'forward':[sy*cp,sp,-cy*cp],'up':[-sy*sp,cp,cy*sp]}
def uniforms(p):
    UseProgram(p)
    for n,v in vectors.items():Uniform3f(GetUniformLocation(p,n.encode()),*v)
    Uniform1f(GetUniformLocation(p,b'aspect'),w/h);Uniform1f(GetUniformLocation(p,b'focal'),1/np.tan(np.pi/5))
Enable=gl('glEnable',None,[U]);Disable=gl('glDisable',None,[U]);DepthMask=gl('glDepthMask',None,[U]);DepthFunc=gl('glDepthFunc',None,[U]);ClearColor=gl('glClearColor',None,[F,F,F,F]);Clear=gl('glClear',None,[U]);Viewport=gl('glViewport',None,[I,I,I,I]);DrawArrays=gl('glDrawArrays',None,[U,I,I]);DrawArraysInstanced=gl('glDrawArraysInstanced',None,[U,I,I,I]);BlendFunc=gl('glBlendFunc',None,[U,U]);ReadPixels=gl('glReadPixels',None,[I,I,I,I,U,U,P]);GetError=gl('glGetError',U,[])
GenTextures=gl('glGenTextures',None,[I,C.POINTER(U)]);BindTexture=gl('glBindTexture',None,[U,U]);TexParameteri=gl('glTexParameteri',None,[U,U,I]);TexImage2D=gl('glTexImage2D',None,[U,I,I,I,I,I,U,U,P]);GenFramebuffers=gl('glGenFramebuffers',None,[I,C.POINTER(U)]);BindFramebuffer=gl('glBindFramebuffer',None,[U,U]);FramebufferTexture2D=gl('glFramebufferTexture2D',None,[U,U,U,U,I]);CheckFramebufferStatus=gl('glCheckFramebufferStatus',U,[U]);ActiveTexture=gl('glActiveTexture',None,[U]);Uniform2f=gl('glUniform2f',None,[I,F,F])
def texture(tw,th,internal,typ,fmt=0x1908,payload=None):
    t=U();GenTextures(1,C.byref(t));BindTexture(0x0DE1,t)
    for n,v in [(0x2801,0x2600),(0x2800,0x2600),(0x2802,0x812F),(0x2803,0x812F)]:TexParameteri(0x0DE1,n,v)
    TexImage2D(0x0DE1,0,internal,tw,th,0,fmt,typ,None if payload is None else payload.ctypes.data)
    return t.value
def fbo(t,depth=None):
    f=U();GenFramebuffers(1,C.byref(f));BindFramebuffer(0x8D40,f);FramebufferTexture2D(0x8D40,0x8CE0,0x0DE1,t,0)
    if depth:FramebufferTexture2D(0x8D40,0x8D00,0x0DE1,depth,0)
    assert CheckFramebufferStatus(0x8D40)==0x8CD5
    return f.value
image=texture(w,h,0x8058,0x1401);TexParameteri(0x0DE1,0x2801,0x2601);TexParameteri(0x0DE1,0x2800,0x2601);depth=texture(w,h,0x81A6,0x1405,0x1902);source_fbo=fbo(image,depth)
fw,fh=round(w/11),round(h/11)
states=[texture(fw,fh,0x881A,0x140B) for _ in range(2)];state_fbos=[fbo(t) for t in states]
prior=texture(128,128,0x8058,0x1401,payload=np.array(data['prior'],dtype=np.uint8))
def bind(p,n,t,unit):ActiveTexture(0x84C0+unit);BindTexture(0x0DE1,t);Uniform1i(GetUniformLocation(p,n.encode()),unit)
def source_frame():
    BindFramebuffer(0x8D40,source_fbo);Viewport(0,0,w,h);Enable(0x0B71);Disable(0x0BE2);DepthMask(1);DepthFunc(0x0203);ClearColor(.06,.12,.23,1);Clear(0x4000|0x100)
    uniforms(programs[1]);BindVertexArray(vaos[1]);DrawArrays(4,0,3)
    uniforms(programs[0]);BindVertexArray(vaos[0])
    Uniform3f(GetUniformLocation(programs[0],b'eye'),0,0,0)
    cw,cd=data.get('worldWidth',166),data.get('worldDepth',182)
    bounds=data.get('mapBounds',{'minX':-83,'minZ':-66})
    tile_x=int(np.floor((vectors['eye'][0]-bounds['minX'])/cw));tile_z=int(np.floor((vectors['eye'][2]-bounds['minZ'])/cd))
    tan_v=np.tan(np.pi/5);tan_h=tan_v*w/h
    for tz in range(tile_z-1,tile_z+2):
        for tx in range(tile_x-1,tile_x+2):
            Uniform3f(GetUniformLocation(programs[0],b'tileOffset'),tx*cw-vectors['eye'][0],-vectors['eye'][1],tz*cd-vectors['eye'][2])
            for chunk in data.get('chunks',[{'first':0,'count':len(data['arrays'][1])//9,'center':[0,0,25],'radius':300}]):
                delta=np.array(chunk['center'])+np.array([tx*cw,0,tz*cd])-np.array(vectors['eye']);r=chunk['radius'];dz=np.dot(delta,vectors['forward'])
                if dz+r<.1 or dz-r>160 or abs(np.dot(delta,vectors['right']))>dz*tan_h+r*np.hypot(1,tan_h) or abs(np.dot(delta,vectors['up']))>dz*tan_v+r*np.hypot(1,tan_v):continue
                DrawArrays(4,chunk['first'],chunk['count'])
source_frame()
read=0
p=programs[2]
def field_step(history,impulse=0,settle=0,time=0,motion=0,inertia=.7,damping=.65,previous_vectors=None):
    global read
    write=1-read;BindFramebuffer(0x8D40,state_fbos[write]);Viewport(0,0,fw,fh);Disable(0x0B71);Disable(0x0BE2);UseProgram(p);BindVertexArray(vaos[2])
    previous=vectors if previous_vectors is None else previous_vectors
    for n,v in vectors.items():
        Uniform3f(GetUniformLocation(p,n.encode()),*([0,0,0] if n=='eye' else v))
        Uniform3f(GetUniformLocation(p,('previous'+n[0].upper()+n[1:]).encode()),*(np.array(previous[n])-np.array(v) if n=='eye' else previous[n]))
    for n,v in {'aspect':w/h,'focal':1/np.tan(np.pi/5),'dt':1/60,'inertia':inertia,'damping':damping,'impulse':impulse,'velocityZero':.5,'time':time,'motion':motion}.items():Uniform1f(GetUniformLocation(p,n.encode()),v)
    Uniform2f(GetUniformLocation(p,b'sourceSize'),w,h);Uniform2f(GetUniformLocation(p,b'fieldSize'),fw,fh);Uniform1i(GetUniformLocation(p,b'hasHistory'),int(history));Uniform1i(GetUniformLocation(p,b'settle'),settle)
    for unit,(n,t) in enumerate([('sourceImage',image),('sourceDepth',depth),('previousField',states[read]),('prior',prior)]):bind(p,n,t,unit)
    DrawArrays(4,0,3);read=write
    assert GetError()==0,'Field shader GPU error'
def paint(view,path,rotation=0,morph_time=0,brush_size=1.14,length=1.48,width=.71,curvature=1.68,variance=.76,texture_strength=1.7,detail=.65,density=0,edges=0):
    q=programs[3];UseProgram(q);BindFramebuffer(0x8D40,0);Viewport(0,0,w,h);BindVertexArray(vaos[3]);Disable(0x0B71)
    for unit,(n,t) in enumerate([('sourceImage',image),('fieldState',states[read]),('sourceDepth',depth)]):bind(q,n,t,unit)
    Uniform2f(GetUniformLocation(q,b'fieldSize'),fw,fh);Uniform2f(GetUniformLocation(q,b'sourceSize'),w,h);Uniform1f(GetUniformLocation(q,b'brushSize'),brush_size);Uniform1f(GetUniformLocation(q,b'morphTime'),morph_time);Uniform1f(GetUniformLocation(q,b'rotation'),rotation);Uniform1i(GetUniformLocation(q,b'view'),view)
    for name,value in {'brushLength':length,'brushWidth':width,'brushCurvature':curvature,'sizeVariance':variance,'textureStrength':texture_strength,'detailStrength':detail,'densityStrength':density,'edgeStrength':edges}.items():Uniform1f(GetUniformLocation(q,name.encode()),value)
    DrawArrays(4,0,3)
    pixels=np.zeros((h,w,4),dtype=np.uint8);ReadPixels(0,0,w,h,0x1908,0x1401,pixels.ctypes.data);assert GetError()==0,'Painting shader GPU error';Image.fromarray(pixels[::-1]).save(path);assert np.std(pixels[:,:,:3])>15
    return pixels
def read_field():
    BindFramebuffer(0x8D40,state_fbos[read]);pixels=np.zeros((fh,fw,4),dtype=np.float32);ReadPixels(0,0,fw,fh,0x1908,0x1406,pixels.ctypes.data);assert GetError()==0;assert np.isfinite(pixels).all(),'Finite field';return pixels
def set_camera(view):
    global vectors
    yaw=view['yaw'];pitch=view['pitch'];cy=np.cos(yaw);sy=np.sin(yaw);cp=np.cos(pitch);sp=np.sin(pitch)
    vectors={'eye':[view['x'],view['y'],view['z']],'right':[cy,0,sy],'forward':[sy*cp,sp,-cy*cp],'up':[-sy*sp,cp,cy*sp]}
def source_pixels():
    BindFramebuffer(0x8D40,source_fbo);pixels=np.zeros((h,w,4),dtype=np.uint8)
    ReadPixels(0,0,w,h,0x1908,0x1401,pixels.ctypes.data);assert GetError()==0,'Scene shader GPU error'
    return pixels[:,:,:3].astype(float)
def check_seams():
    global vectors
    saved={n:list(v) for n,v in vectors.items()};periodic_errors=[];crossing_changes=[];field_errors=[]
    for route in data['seamCameras']:
        set_camera(route[2]);source_frame();reference=source_pixels()
        for dx,dz in [(166,0),(0,182),(1660000,-1820000)]:
            translated={**route[2],'x':route[2]['x']+dx,'z':route[2]['z']+dz}
            set_camera(translated);source_frame();error=float(np.abs(source_pixels()-reference).mean())
            assert error<.05,'The GPU frame repeats across both seams and after long walks'
            periodic_errors.append(error)
        fields=[]
        for dx,dz in [(0,0),(1660000,-1820000)]:
            previous=None;frames=[]
            for view in route:
                set_camera({**view,'x':view['x']+dx,'z':view['z']+dz});source_frame();frames.append(source_pixels())
                field_step(previous is not None,previous_vectors=previous);read_field()
                previous={n:list(v) for n,v in vectors.items()}
            changes=[float(np.abs(b-a).mean()) for a,b in zip(frames,frames[1:])]
            assert max(changes)<2,'Small camera steps across the seam have small RGB changes'
            crossing_changes.append(changes);fields.append(read_field())
        field_error=float(np.abs(fields[0]-fields[1]).mean())
        assert field_error<.00005,'Brush history transports identically during a distant seam crossing'
        field_errors.append(field_error)
    vectors=saved;source_frame()
    return {'periodic_frame_max_mean_error':max(periodic_errors),'seam_step_max_mean_change':max(map(max,crossing_changes)),'distant_history_max_mean_error':max(field_errors),'seam_routes':len(data['seamCameras'])}
seam_report=check_seams()
if '--seams-only' in sys.argv:
    print(json.dumps({**seam_report,'gpu_errors':0}));sys.exit(0)
if '--scene-only' in sys.argv:
    for index,view_camera in enumerate(data['sceneCameras']):
        set_camera(view_camera)
        source_frame();field_step(False)
        for _ in range(30):field_step(True)
        paint(0,'/tmp/starry-field-scene-'+str(index)+'.png',density=.65,edges=.7)
        paint(1,'/tmp/starry-field-scene-raw-'+str(index)+'.png',density=.65,edges=.7)
    print(json.dumps({'scene_views':len(data['sceneCameras']),**seam_report,'gpu_errors':0}));sys.exit(0)
field_step(False);initial=read_field();a=paint(0,'/tmp/starry-field-native-v4.png');raw=paint(1,'/tmp/starry-field-raw-v4.png');paint(3,'/tmp/starry-field-split-v4.png');assert np.mean(np.abs(a.astype(float)-raw.astype(float)))>1,'Painting actually transforms raw frame'
# Contrast changes allocation of small marks rather than source-image opacity.
no_detail=paint(0,'/tmp/starry-field-adaptive-off.png',detail=0)
full_detail=paint(0,'/tmp/starry-field-adaptive-on.png',detail=1)
adaptive_difference=np.abs(full_detail[:,:,:3].astype(float)-no_detail[:,:,:3].astype(float)).mean(axis=2)
cy,cx=np.mgrid[:h,:w];contrast=initial[(cy*fh//h),(cx*fw//w),3]
high_change=float(adaptive_difference[contrast>.8].mean());quiet_change=float(adaptive_difference[contrast<.1].mean())
assert high_change>quiet_change*1.3,'Detail changes high-contrast regions more than quiet areas'
# Density is independent of stroke-size adaptation, and zero restores baseline.
density_off=paint(0,'/tmp/starry-field-density-off.png',detail=0,density=0)
density_on=paint(0,'/tmp/starry-field-density-on.png',detail=0,density=1)
density_difference=np.abs(density_on[:,:,:3].astype(float)-density_off[:,:,:3].astype(float)).mean(axis=2)
density_high=float(density_difference[contrast>.8].mean());density_quiet=float(density_difference[contrast<.1].mean())
assert density_high>density_quiet*1.3,'Density favors contrast with size adaptation disabled'
density_small=paint(0,'/tmp/starry-field-density-small.png',detail=0,density=.001)
assert np.abs(density_small.astype(float)-density_off.astype(float)).mean()<.05,'Density approaches unchanged baseline continuously'
assert np.array_equal(density_off,paint(0,'/tmp/starry-field-density-zero.png',detail=0,density=0)),'Zero density is deterministic'
# Isolate distance from contrast: near geometry and sky receive no distance boost.
TexSubImage2D=gl('glTexSubImage2D',None,[U,I,I,I,I,I,U,U,P])
probe=initial.copy();probe[:,:,3]=.03
samples=[]
for distance in [10.,150.,300.]:
    probe[:,:,2]=distance/300.
    BindTexture(0x0DE1,states[read]);TexSubImage2D(0x0DE1,0,0,0,fw,fh,0x1908,0x1406,probe.ctypes.data)
    samples.append(paint(0,'/tmp/starry-field-density-depth-'+str(int(distance))+'.png',detail=0,density=1))
distance_change=float(np.abs(samples[1].astype(float)-samples[0].astype(float)).mean())
assert distance_change>.05,'Far geometry receives fine marks independently of contrast'
assert np.array_equal(samples[0],samples[2]),'Sky is excluded from distance-based density'
BindTexture(0x0DE1,states[read]);TexSubImage2D(0x0DE1,0,0,0,fw,fh,0x1908,0x1406,initial.ctypes.data)
paint(0,'/tmp/starry-field-density-default.png',density=.65)
if '--density-only' in sys.argv:
    print(json.dumps({'density_high_contrast_change':density_high,'density_quiet_change':density_quiet,'distance_change':distance_change,'gpu_errors':0}));sys.exit(0)
# Every exposed brush control must affect actual GPU output.
control_differences={}
for name,value in [('length',1.6),('width',.5),('curvature',0),('variance',0),('texture_strength',3)]:
    sample=paint(0,'/tmp/starry-field-brush-'+name+'.png',**{name:value})
    diff=float(np.abs(sample.astype(float)-a.astype(float)).mean())
    assert diff>.05,'Brush control affects rendered output: '+name
    control_differences[name]=diff
paint(0,'/tmp/starry-field-brush-extremes.png',length=1.6,width=1.6,curvature=2,variance=1,texture_strength=3)
paint(4,'/tmp/starry-field-painted-undercoat.png')
# Rotation moves only the painter grid; source/view stays stationary. An
# overscanned grid must continue covering the corners throughout a turn.
rotated=paint(0,'/tmp/starry-field-rotated.png',rotation=.35)
rotation_difference=float(np.abs(rotated.astype(float)-a.astype(float)).mean())
assert rotation_difference>1,'Rotating the mark lattice changes brush presentation'
raw_rotated=paint(1,'/tmp/starry-field-raw-rotated.png',rotation=.35)
assert np.array_equal(raw_rotated,raw),'Game RGB frame remains stationary'
for angle in [np.pi/4,np.pi/2,np.pi]:
    rotated=paint(0,'/tmp/starry-field-rotation-test.png',rotation=angle)
    assert rotated[:,:,3].min()==255,'No transparent rotation corners'
# Hold the source, vector field and rotation fixed to isolate shape/pigment
# morphing. Nearby frames should differ much less than separated phases.
near=paint(0,'/tmp/starry-field-morph-near.png',morph_time=3.03/60)
far=paint(0,'/tmp/starry-field-morph-far.png',morph_time=3.03*2)
near_change=float(np.abs(near.astype(float)-a.astype(float)).mean())
far_change=float(np.abs(far.astype(float)-a.astype(float)).mean())
assert far_change>1,'Shape and pigment morph without input/field/rotation changes'
assert near_change<far_change*.1,'Morphing changes gradually across adjacent frames'
# Compare identical unperturbed/pulsed runs to distinguish propagation from
# normal settling of the authored prior under neighbor coupling.
field_step(True);unperturbed=read_field()
for _ in range(29):field_step(True)
baseline=read_field()
for _ in range(150):field_step(True)
baseline_settled=read_field()
field_step(False);field_step(True,impulse=1);perturbed=read_field()
speed=float(np.abs((perturbed[:,:,1]-.5)*16).max());assert speed>1,'Local GPU impulse'
yy,xx=np.mgrid[:fh,:fw];radius=np.sqrt((xx+.5-.35*fw)**2+(yy+.5-.65*fh)**2)
assert np.abs((perturbed[:,:,1]-unperturbed[:,:,1])*16)[radius>8].max()<.1,'Kick stays local'
for _ in range(29):field_step(True)
propagated=read_field();delta=np.abs((propagated[:,:,1]-baseline[:,:,1])*16)
assert delta[(radius>5)&(radius<9)].max()>.01,'Neighbors outside the kick respond later'
propagation=float(delta[(radius>5)&(radius<9)].max())
for _ in range(150):field_step(True)
settled=read_field();end_speed=float(np.abs((settled[:,:,1]-baseline_settled[:,:,1])*16).max());assert end_speed<speed*.1,'GPU field motion decays'
paint(0,'/tmp/starry-field-native-v4.png')
field_step(True,impulse=1,settle=1);assert np.max(np.abs((read_field()[:,:,1]-.5)*16))<.01,'Settle resets GPU velocity'
# A completely different RGB input must change the painting immediately, with
# no changes to meshes or painting material data.
TexSubImage2D=gl('glTexSubImage2D',None,[U,I,I,I,I,I,U,U,P]);replacement=np.empty((h,w,4),dtype=np.uint8);replacement[:]=[210,65,35,255];BindTexture(0x0DE1,image);TexSubImage2D(0x0DE1,0,0,0,w,h,0x1908,0x1401,replacement.ctypes.data);field_step(True);updated=paint(0,'/tmp/starry-field-input-test.png');assert updated[:,:,0].mean()>updated[:,:,2].mean()*3,'Painter samples current RGB input, independent of scene geometry'
# With no RGB contrast, enabling adaptation should leave broad brushwork alone.
field_step(False)
flat_off=paint(0,'/tmp/starry-field-flat-off.png',detail=0)
flat_on=paint(0,'/tmp/starry-field-flat-on.png',detail=1)
assert np.abs(flat_on.astype(float)-flat_off.astype(float)).mean()<.05,'Flat regions retain their original treatment'
# An all-paint undercoat must cover every pixel without borrowing a raw RGB
# background. Uniform source pigment makes any coverage hole unmistakable.
for size in [.55,1.65]:
    for angle in [0,.45,np.pi/2]:
        base=paint(4,'/tmp/starry-field-undercoat-coverage.png',rotation=angle,brush_size=size)
        assert base[:,:,0].min()>140,'Every pixel has broad-mark coverage'
        assert base[:,:,3].min()==255,'Undercoat is opaque'
# A radial RGB halo should yield tangent brush axes throughout its soft edge.
py,px=np.mgrid[:h,:w];halo=np.exp(-((px-w*.5)**2+(py-h*.5)**2)/(2*85**2))
synthetic=np.empty((h,w,4),dtype=np.uint8)
for c,(base,peak) in enumerate([(20,230),(40,190),(80,70)]):synthetic[:,:,c]=np.clip(base+peak*halo,0,255).astype(np.uint8)
synthetic[:,:,3]=255;BindTexture(0x0DE1,image);TexSubImage2D(0x0DE1,0,0,0,w,h,0x1908,0x1401,synthetic.ctypes.data)
field_step(False);radial=read_field();yy,xx=np.mgrid[:fh,:fw]
dx=(xx+.5)/fw*w-w*.5;dy=(yy+.5)/fh*h-h*.5;rr=np.sqrt(dx*dx+dy*dy)
expected=np.arctan2(dy,dx)+np.pi*.5;actual=(radial[:,:,0]-.5)*2*np.pi
error=np.abs(.5*np.arctan2(np.sin(2*(actual-expected)),np.cos(2*(actual-expected))))*180/np.pi
ring=(rr>35)&(rr<180);radial_error=float(np.percentile(error[ring],90))
assert radial_error<12,'Soft halo strokes follow concentric contours'
# Steady-state neighbor springs must preserve that shape too.
for _ in range(120):field_step(True)
actual=(read_field()[:,:,0]-.5)*2*np.pi
steady_error=np.abs(.5*np.arctan2(np.sin(2*(actual-expected)),np.cos(2*(actual-expected))))*180/np.pi
assert np.percentile(steady_error[ring],90)<15,'Coupling preserves halo tangents'
paint(0,'/tmp/starry-field-halo-v4.png')
# Motion is continuous even with a fixed RGB frame. Calm regions may move,
# while strong halo contours retain their directional anchor.
stationary=read_field().copy()
for frame in range(240):field_step(True,time=(frame+1)/60,motion=.65,inertia=.45,damping=.48)
moving=read_field();difference=(moving[:,:,0]-stationary[:,:,0])*2*np.pi
motion_degrees=np.abs(.5*np.arctan2(np.sin(2*difference),np.cos(2*difference)))*180/np.pi
motion_mean=float(motion_degrees[rr>250].mean());assert motion_mean>2,'Blank-region brushwork keeps moving'
assert np.max(np.abs((moving[:,:,1]-.5)*16))<8.01,'Driven motion remains bounded'
# Exercise the extended Motion maximum with its accelerated clock and bounded
# amplitudes, using the actual default inertia/damping.
for frame in range(240):field_step(True,time=4+(frame+1)*4/60,motion=4,inertia=1,damping=.5)
assert np.max(np.abs((read_field()[:,:,1]-.5)*16))<8.01,'Extended Motion remains bounded'
# A hard RGB step should be reconstructed as a painted transition.
step=np.empty((h,w,4),dtype=np.uint8);step[:,:w//2]=[35,65,135,255];step[:,w//2:]=[180,145,65,255]
BindTexture(0x0DE1,image);TexSubImage2D(0x0DE1,0,0,0,w,h,0x1908,0x1401,step.ctypes.data);field_step(False)
soft=paint(0,'/tmp/starry-field-edge-test.png')
boundary_jump=float(np.abs(soft[h//4:3*h//4,w//2,:3].astype(float)-soft[h//4:3*h//4,w//2-1,:3].astype(float)).mean())
raw_jump=float(np.abs(step[0,w//2,:3].astype(float)-step[0,w//2-1,:3].astype(float)).mean())
assert boundary_jump<raw_jump*.6,'Original hard boundary is softened'
# Corner fitting with a controlled direction field isolates shape from steering.
# Thin bands also catch probes that only compare the two far endpoints.
corner=np.empty((h,w,4),dtype=np.uint8);corner[:]=[25,45,100,255]
corner[h//3:2*h//3,w//3:2*w//3]=[220,175,65,255]
corner[h//2:2*h//3,w//2:2*w//3]=[25,45,100,255]
BindTexture(0x0DE1,image);TexSubImage2D(0x0DE1,0,0,0,w,h,0x1908,0x1401,corner.ctypes.data)
# Sky depth makes this a pure RGB test; fixed horizontal axes cross its corners.
flat_depth=np.ones((h,w),dtype=np.uint32)*np.iinfo(np.uint32).max
BindTexture(0x0DE1,depth);TexSubImage2D(0x0DE1,0,0,0,w,h,0x1902,0x1405,flat_depth.ctypes.data)
field_step(False);axes=read_field();axes[:,:,0]=.5;axes[:,:,3]=.03
BindTexture(0x0DE1,states[read]);TexSubImage2D(0x0DE1,0,0,0,fw,fh,0x1908,0x1406,axes.ctypes.data)
corner_off=paint(0,'/tmp/starry-field-corners-off.png',detail=0,edges=0)
corner_on=paint(0,'/tmp/starry-field-corners-on.png',detail=0,edges=1)
corner_small=paint(0,'/tmp/starry-field-corners-small.png',detail=0,edges=.001)
assert np.abs(corner_off.astype(float)-corner_small.astype(float)).mean()<.05,'Fitting approaches zero continuously'
mask=np.ones((h,w),dtype=bool)
mask[h//3:2*h//3,w//3:2*w//3]=False
mask[h//2:2*h//3,w//2:2*w//3]=True
leak_off=float(corner_off[:,:,:3][mask][:,0].mean())
leak_on=float(corner_on[:,:,:3][mask][:,0].mean())
assert leak_on<leak_off,'Adaptive endpoints and width reduce total warm pigment spilling outside the concave shape'
assert corner_on[:,:,:3][~mask][:,0].mean()>corner_off[:,:,:3][~mask][:,0].mean(),'Fitting also reduces blue contamination inside the warm shape'
assert np.abs(corner_on.astype(float)-corner_off.astype(float)).mean()>.05,'Edge fitting changes actual GPU footprints'
# A flat source must keep the long-stroke treatment, even at maximum fitting.
BindTexture(0x0DE1,image);TexSubImage2D(0x0DE1,0,0,0,w,h,0x1908,0x1401,replacement.ctypes.data)
flat_fit_off=paint(0,'/tmp/starry-field-fitting-flat-off.png',edges=0)
flat_fit_on=paint(0,'/tmp/starry-field-fitting-flat-on.png',edges=1)
assert np.array_equal(flat_fit_off,flat_fit_on),'Fitting leaves color/depth-uniform regions unchanged'
# Same pigment on two different surfaces must still shorten at their depth edge.
near_d=(1.000667-.200067/8.+1.)*.5;far_d=(1.000667-.200067/80.+1.)*.5
split_depth=np.empty((h,w),dtype=np.uint32)
split_depth[:,:w//2]=round(near_d*np.iinfo(np.uint32).max)
split_depth[:,w//2:]=round(far_d*np.iinfo(np.uint32).max)
BindTexture(0x0DE1,depth);TexSubImage2D(0x0DE1,0,0,0,w,h,0x1902,0x1405,split_depth.ctypes.data)
depth_off=paint(0,'/tmp/starry-field-fitting-depth-off.png',detail=0,edges=0)
depth_on=paint(0,'/tmp/starry-field-fitting-depth-on.png',detail=0,edges=1)
depth_fit_change=float(np.abs(depth_on[:,:,:3].astype(float)-depth_off[:,:,:3].astype(float))[:,w//2-60:w//2+60].mean())
assert depth_fit_change>.02,'Fitting detects depth boundaries between identically colored surfaces'
BindTexture(0x0DE1,depth);TexSubImage2D(0x0DE1,0,0,0,w,h,0x1902,0x1405,flat_depth.ctypes.data)

BindTexture(0x0DE1,image);TexSubImage2D(0x0DE1,0,0,0,w,h,0x1908,0x1401,step.ctypes.data)
# Rebuild field textures at the grid-spacing limits while preserving RGB input.
for spacing in [6,24]:
    fw,fh=round(w/spacing),round(h/spacing)
    states=[texture(fw,fh,0x881A,0x140B) for _ in range(2)];state_fbos=[fbo(t) for t in states];read=0
    field_step(False);read_field();paint(0,'/tmp/starry-field-grid-'+str(spacing)+'.png',detail=1)
print(json.dumps({'halo_90th_percentile_angle_error_degrees':radial_error,'motion_mean_degrees_after_four_seconds':motion_mean,'painted_boundary_jump':boundary_jump,'raw_boundary_jump':raw_jump,'morph_adjacent_frame_change':near_change,'morph_two_second_change':far_change,'rotation_pixel_difference':rotation_difference,'brush_control_pixel_differences':control_differences,'density_high_contrast_change':density_high,'density_quiet_region_change':density_quiet,'adaptive_high_contrast_change':high_change,'adaptive_quiet_region_change':quiet_change,'shader_stages':len(data['shaders']),'gpu_errors':0,'corner_spill_red_before':leak_off,'corner_spill_red_after':leak_on,'depth_fitting_boundary_change':depth_fit_change,'mean_painted_vs_raw_pixel_difference':float(np.mean(np.abs(a.astype(float)-raw.astype(float)))),'ripple_peak_angular_speed':speed,'outside_kick_response':propagation,'after_three_seconds_peak_ripple_speed_above_baseline':end_speed,'screenshots':['/tmp/starry-field-native-v4.png','/tmp/starry-field-split-v4.png']},indent=2))
