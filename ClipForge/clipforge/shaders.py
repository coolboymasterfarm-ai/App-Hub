"""WebGL shader transitions, rendered by HyperFrames.

The GLSL is from the HyperFrames registry's shader-transition blocks
(https://github.com/heygen-com/hyperframes, Apache-2.0). Each shader mixes two
textures - u_from (the shot before the cut) and u_to (the shot after) - by
u_progress 0..1.

In a clip they replace chosen jump cuts: the frames either side of the cut
are pulled from the edited video, a HyperFrames composition runs the shader
over them, and the result is laid back over the cut.
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import List, Optional, Tuple

from . import hyperframes, media

NAMES = {
    'cinematic-zoom': 'Zoom blur',
    'whip-pan': 'Whip pan',
    'light-leak': 'Light leak',
    'flash-through-white': 'Flash',
    'glitch': 'Glitch',
    'chromatic-radial-split': 'Chromatic split',
    'swirl-vortex': 'Swirl',
    'ripple-waves': 'Ripple',
    'domain-warp-dissolve': 'Warp dissolve',
    'gravitational-lens': 'Lens',
    'cross-warp-morph': 'Warp morph',
    'ridged-burn': 'Burn',
    'thermal-distortion': 'Heat haze',
    'sdf-iris': 'Iris',
}

SUBTLE = ["cinematic-zoom", "whip-pan", "light-leak", "flash-through-white"]


FPS = 30


def frame_count(dur: float) -> int:
    """Frames in one transition: even, so it splits into before/after halves."""
    n = int(round(dur * FPS))
    return n + n % 2


def pick(joins: List[float], total: float, *, mode: str, style: str = "auto",
         avoid: Tuple[Tuple[float, float], ...] = ()) -> List[Tuple[float, str]]:
    """Which cuts get a transition, and which shader each gets. Sparing on
    purpose: a transition on every cut looks like a template, one every
    several seconds looks edited."""
    if mode == "off" or not joins:
        return []
    gap, most = (8.0, 3) if mode == "subtle" else (5.0, 6)
    pool = SUBTLE if mode == "subtle" else list(NAMES)
    out: List[Tuple[float, str]] = []
    last = -99.0
    for j in sorted(joins):
        if j < 3.4 or j > total - 2.8 or j - last < gap:
            continue                                  # not over the hook or the end card
        if any(a - .3 <= j <= b + .3 for a, b in avoid):
            continue
        name = style if style in GLSL else pool[len(out) % len(pool)]
        out.append((round(j, 3), name))
        last = j
        if len(out) >= most:
            break
    return out


_HEAD = ("precision mediump float;varying vec2 v_uv;uniform sampler2D u_from,u_to;"
         "uniform float u_progress;uniform vec2 u_resolution;\n")


def composition(items: List[Tuple[int, str]], dur: float, frames: int,
                w: int = 1080, h: int = 1920) -> str:
    """One composition that plays every transition back to back: transition k
    occupies [k*dur, (k+1)*dur). Its frames are t{k}_{i}.jpg; the first half
    are the shot before the cut, the second half the shot after - each side
    holds its edge frame while the other side plays."""
    half = frames // 2
    names = sorted({n for _, n in items})
    imgs = "".join(f'<img id="f{k}_{i}" src="t{k}_{i:02d}.jpg">'
                   for k, _ in enumerate(items) for i in range(frames))
    total = dur * len(items)
    progs = ",".join(f"{json.dumps(n)}:mk({json.dumps(_HEAD + GLSL[n])})" for n in names)
    order = json.dumps([n for _, n in items])
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><style>
*{{margin:0;padding:0}} html,body{{width:{w}px;height:{h}px;overflow:hidden;background:#000}}
#root{{position:relative;width:{w}px;height:{h}px;overflow:hidden;background:#000}}
#gl{{position:absolute;left:0;top:0;width:{w}px;height:{h}px}}
#src{{display:none}}
</style></head><body>
<div id="root" data-composition-id="cf" data-width="{w}" data-height="{h}" data-start="0"
  data-duration="{total:.3f}" data-fps="{FPS}">
<canvas id="gl" width="{w}" height="{h}"></canvas>
<div id="src">{imgs}</div>
<div id="driver" class="clip" data-start="0" data-duration="{total:.3f}" data-track-index="0"
  style="position:absolute;width:1px;height:1px;opacity:0"></div>
</div>
<script src="gsap.min.js"></script>
<script>
window.__timelines = window.__timelines || {{}};
const D={dur}, F={frames}, HALF={half}, K={len(items)}, ORDER={order};
const gl=document.getElementById("gl").getContext("webgl",{{preserveDrawingBuffer:true}});
const tl=gsap.timeline({{paused:true}});
if(gl){{
  gl.viewport(0,0,{w},{h});
  const V="attribute vec2 a_pos;varying vec2 v_uv;void main(){{v_uv=a_pos*0.5+0.5;v_uv.y=1.0-v_uv.y;gl_Position=vec4(a_pos,0,1);}}";
  function sh(src,t){{const s=gl.createShader(t);gl.shaderSource(s,src);gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))console.error(gl.getShaderInfoLog(s));return s;}}
  function mk(f){{const p=gl.createProgram();gl.attachShader(p,sh(V,gl.VERTEX_SHADER));
    gl.attachShader(p,sh(f,gl.FRAGMENT_SHADER));gl.linkProgram(p);return p;}}
  const P={{{progs}}};
  const buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
  function tex(){{const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);
    [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T].forEach(k=>gl.texParameteri(gl.TEXTURE_2D,k,gl.CLAMP_TO_EDGE));
    [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER].forEach(k=>gl.texParameteri(gl.TEXTURE_2D,k,gl.LINEAR));return t;}}
  const TA=tex(),TB=tex();
  const ease=p=>p<.5?2*p*p:1-Math.pow(-2*p+2,2)/2;
  function draw(t){{
    const k=Math.min(K-1,Math.floor(t/D+1e-6));
    const i=Math.max(0,Math.min(F-1,Math.floor((t-k*D)*{FPS}+1e-3)));
    const a=document.getElementById("f"+k+"_"+Math.min(i,HALF-1));
    const b=document.getElementById("f"+k+"_"+Math.max(i,HALF));
    const prog=P[ORDER[k]];gl.useProgram(prog);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,TA);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,a);
    gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,TB);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,b);
    gl.uniform1i(gl.getUniformLocation(prog,"u_from"),0);
    gl.uniform1i(gl.getUniformLocation(prog,"u_to"),1);
    gl.uniform1f(gl.getUniformLocation(prog,"u_progress"),ease((i+0.5)/F));
    gl.uniform2f(gl.getUniformLocation(prog,"u_resolution"),{w},{h});
    const pos=gl.getAttribLocation(prog,"a_pos");gl.bindBuffer(gl.ARRAY_BUFFER,buf);
    gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
    gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
  }}
  tl.eventCallback("onUpdate",()=>draw(tl.time()));
}}
tl.to({{v:0}},{{v:1,duration:{total:.3f},ease:"none"}},0);
window.__timelines["cf"]=tl;
</script></body></html>
"""


def render_strip(base: Path, picks: List[Tuple[float, str]], work: Path, out: Path,
                 dur: float = 0.4) -> Optional[str]:
    """Pull the frames around each chosen cut out of `base`, run the shaders
    in HyperFrames, write one mp4 with all the transitions back to back."""
    frames = frame_count(dur)
    tmp = work / "tr_frames"
    shutil.rmtree(tmp, ignore_errors=True)
    tmp.mkdir(parents=True)
    for k, (j, _) in enumerate(picks):
        t0 = max(0.0, j - frames / 2 / FPS)
        try:
            media.run(["-ss", f"{t0:.4f}", "-i", str(base.resolve()), "-frames:v", str(frames),
                       "-q:v", "2", "-start_number", "0", str(tmp / f"t{k}_%02d.jpg")])
        except media.FFmpegError as exc:
            return f"could not read frames for transition {k + 1}: {exc}"
        if len(list(tmp.glob(f"t{k}_*.jpg"))) < frames:
            return "not enough frames around a cut"
    html = composition([(k, n) for k, (_, n) in enumerate(picks)], frames / FPS, frames)
    frames_in = {f.name: f for f in sorted(tmp.glob("*.jpg"))}
    return hyperframes.render(hyperframes.project(work / "hf_tr", html, frames_in), out,
                              frames / FPS * len(picks), "mp4")


# ---------------------------------------------------------------- the shaders (from the registry)

GLSL = {
    'cinematic-zoom': "void main(){vec2 d=v_uv-vec2(.5);float fromS=u_progress*.08;float toS=(1.-u_progress)*.06;float fr=0.,fg=0.,fb=0.;for(int i=0;i<12;i++){float f=float(i)/12.;fr+=texture2D(u_from,v_uv-d*(fromS*1.06)*f).r;fg+=texture2D(u_from,v_uv-d*fromS*f).g;fb+=texture2D(u_from,v_uv-d*(fromS*.94)*f).b;}vec3 fromBl=vec3(fr,fg,fb)/12.;float tr=0.,tg=0.,tb=0.;for(int i=0;i<12;i++){float f=float(i)/12.;tr+=texture2D(u_to,v_uv+d*(toS*1.06)*f).r;tg+=texture2D(u_to,v_uv+d*toS*f).g;tb+=texture2D(u_to,v_uv+d*(toS*.94)*f).b;}vec3 toBl=vec3(tr,tg,tb)/12.;gl_FragColor=vec4(mix(fromBl,toBl,u_progress),1.);}",
    'whip-pan': "void main(){float fromOff=u_progress*1.5;vec3 fromC=vec3(0.);for(int i=0;i<10;i++){float f=float(i)/10.;vec2 fuv=vec2(v_uv.x+fromOff+u_progress*.08*f,v_uv.y);fromC+=texture2D(u_from,clamp(fuv,0.,1.)).rgb;}fromC/=10.;float toOff=(1.-u_progress)*1.5;vec3 toC=vec3(0.);for(int i=0;i<10;i++){float f=float(i)/10.;vec2 tuv=vec2(v_uv.x-toOff-(1.-u_progress)*.08*f,v_uv.y);toC+=texture2D(u_to,clamp(tuv,0.,1.)).rgb;}toC/=10.;gl_FragColor=vec4(mix(fromC,toC,u_progress),1.);}",
    'light-leak': "vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}void main(){vec4 A=texture2D(u_from,v_uv),B=texture2D(u_to,v_uv);vec2 lp=vec2(1.3,-.2);float dist=length(v_uv-lp);float leak=clamp(exp(-dist*1.8)*u_progress*4.,0.,1.);vec3 warmColor=mix(vec3(1.,.5,.15),vec3(1.,.9,.75),dist*.7);float flare=exp(-abs(v_uv.y-(-.2+v_uv.x*.3))*15.)*leak*.3;vec3 overexposed=A.rgb+warmColor*leak*3.+vec3(1.,.8,.5)*flare;overexposed=aces(overexposed);gl_FragColor=vec4(mix(overexposed,B.rgb,smoothstep(.15,.85,u_progress)),1.);}",
    'flash-through-white': "void main(){vec4 A=texture2D(u_from,v_uv),B=texture2D(u_to,v_uv);float toWhite=smoothstep(0.,.45,u_progress);vec3 fromC=mix(A.rgb,vec3(1.),toWhite);float fromWhite=1.-smoothstep(.5,1.,u_progress);vec3 toC=mix(B.rgb,vec3(1.),fromWhite);gl_FragColor=vec4(mix(fromC,toC,smoothstep(.35,.65,u_progress)),1.);}",
    'glitch': "float rand(vec2 co){return fract(sin(dot(co,vec2(12.9898,78.233)))*43758.5453);}void main(){float inten=u_progress*(1.-u_progress)*4.;float lineY=floor(v_uv.y*60.)/60.;float lineDisp=(rand(vec2(lineY,floor(u_progress*17.)))-.5)*.18*inten;vec2 block=floor(v_uv*vec2(12.,8.));float br=rand(block+vec2(floor(u_progress*11.)));float ba=step(.83,br)*inten;vec2 bd=(vec2(rand(block*2.1),rand(block*3.7))-.5)*.35*ba;vec2 uv=clamp(v_uv+vec2(lineDisp,0.)+bd,0.,1.);float shift=inten*.035;float r=texture2D(u_from,uv+vec2(shift,0.)).r;float g=texture2D(u_from,uv).g;float b=texture2D(u_from,uv-vec2(shift,0.)).b;vec3 col=vec3(r,g,b);col-=step(.5,fract(v_uv.y*u_resolution.y*.5))*.05*inten;col*=1.+(rand(vec2(floor(u_progress*23.)))-.5)*.3*inten;float levels=mix(256.,8.,inten*.5);col=floor(col*levels)/levels;gl_FragColor=mix(vec4(col,1.),texture2D(u_to,v_uv),u_progress);}",
    'chromatic-radial-split': "void main(){vec2 c=v_uv-.5;float fromShift=u_progress*.06;float fr=texture2D(u_from,clamp(v_uv+c*fromShift,0.,1.)).r;float fg=texture2D(u_from,v_uv).g;float fb=texture2D(u_from,clamp(v_uv-c*fromShift,0.,1.)).b;vec3 fromSplit=vec3(fr,fg,fb);float toShift=(1.-u_progress)*.06;float tr=texture2D(u_to,clamp(v_uv-c*toShift,0.,1.)).r;float tg=texture2D(u_to,v_uv).g;float tb=texture2D(u_to,clamp(v_uv+c*toShift,0.,1.)).b;vec3 toSplit=vec3(tr,tg,tb);gl_FragColor=vec4(mix(fromSplit,toSplit,u_progress),1.);}",
    'swirl-vortex': "void main(){vec2 uv=v_uv-.5;float dist=length(uv);float warp=fbm(v_uv*4.)*.5;float fromAng=u_progress*(1.-dist)*10.+warp*u_progress*3.;float fs=sin(fromAng),fc=cos(fromAng);vec2 fromUv=clamp(vec2(uv.x*fc-uv.y*fs,uv.x*fs+uv.y*fc)+.5,0.,1.);float toAng=-(1.-u_progress)*(1.-dist)*10.-warp*(1.-u_progress)*3.;float ts=sin(toAng),tc=cos(toAng);vec2 toUv=clamp(vec2(uv.x*tc-uv.y*ts,uv.x*ts+uv.y*tc)+.5,0.,1.);vec4 A=texture2D(u_from,fromUv);vec4 B=texture2D(u_to,toUv);gl_FragColor=mix(A,B,u_progress);}",
    'ripple-waves': "void main(){vec2 uv=v_uv-.5;float dist=length(uv);vec2 dir=normalize(uv+.001);float fromAmp=u_progress*.04;float fw1=exp(sin(dist*25.-u_progress*12.)-1.);float fw2=exp(sin(dist*50.-u_progress*18.)-1.)*.5;vec2 fromUv=clamp(v_uv+dir*(fw1+fw2)*fromAmp,0.,1.);float toAmp=(1.-u_progress)*.04;float tw1=exp(sin(dist*25.+u_progress*12.)-1.);float tw2=exp(sin(dist*50.+u_progress*18.)-1.)*.5;vec2 toUv=clamp(v_uv-dir*(tw1+tw2)*toAmp,0.,1.);vec4 A=texture2D(u_from,fromUv);vec4 B=texture2D(u_to,toUv);float peak=fw1*u_progress;vec3 tint=vec3(.9,.95,1.)*peak*.1;gl_FragColor=vec4(mix(A.rgb+tint,B.rgb,u_progress),1.);}",
    'domain-warp-dissolve': "void main(){vec2 q=vec2(fbm(v_uv*3.),fbm(v_uv*3.+vec2(5.2,1.3)));vec2 r=vec2(fbm(v_uv*3.+q*4.+vec2(1.7,9.2)),fbm(v_uv*3.+q*4.+vec2(8.3,2.8)));float n=fbm(v_uv*3.+r*2.);vec2 warpDir=(q-.5)*.4;vec4 A=texture2D(u_from,clamp(v_uv+warpDir*u_progress,0.,1.));vec4 B=texture2D(u_to,clamp(v_uv-warpDir*(1.-u_progress),0.,1.));float e=smoothstep(u_progress-.08,u_progress+.08,n);float ed=abs(n-u_progress);float em=smoothstep(.1,0.,ed)*(1.-step(1.,u_progress));vec3 ec=palette(ed*8.,vec3(.5),vec3(.5),vec3(1.),vec3(0.,.33,.67));gl_FragColor=vec4(mix(B,A,e).rgb+ec*em*2.,1.);}",
    'gravitational-lens': "void main(){vec4 B=texture2D(u_to,v_uv);vec2 uv=v_uv-.5;float dist=length(uv);float pull=u_progress*2.;float warpStr=pull*.3/(dist+.1);vec2 warped=clamp(v_uv-uv*warpStr,0.,1.);vec4 A=texture2D(u_from,warped);float horizon=smoothstep(0.,.3,dist/(1.-u_progress*.85+.001));float shift=pull*.02/(dist+.2);float r=texture2D(u_from,clamp(v_uv-uv*(warpStr+shift),0.,1.)).r;float b=texture2D(u_from,clamp(v_uv-uv*(warpStr-shift),0.,1.)).b;vec3 lensed=vec3(r,A.g,b)*horizon;gl_FragColor=vec4(mix(lensed,B.rgb,smoothstep(.3,.9,u_progress)),1.);}",
    'cross-warp-morph': "void main(){vec2 disp=vec2(fbm(v_uv*3.),fbm(v_uv*3.+vec2(7.3,3.7)))-.5;vec2 fromUv=clamp(v_uv+disp*u_progress*.5,0.,1.);vec2 toUv=clamp(v_uv-disp*(1.-u_progress)*.5,0.,1.);vec4 A=texture2D(u_from,fromUv);vec4 B=texture2D(u_to,toUv);float n=fbm(v_uv*4.+vec2(3.1,1.7));float blend=smoothstep(.4,.6,n+u_progress*1.2-.6);gl_FragColor=mix(A,B,blend);}",
    'ridged-burn': "float ridged(vec2 p){float v=0.,a=.5;mat2 R=mat2(.8,.6,-.6,.8);for(int i=0;i<5;i++){v+=a*abs(vnoise(p)*2.-1.);p=R*p*2.02;a*=.5;}return v;}void main(){vec4 A=texture2D(u_from,v_uv),B=texture2D(u_to,v_uv);float n=ridged(v_uv*4.);float e=smoothstep(u_progress-.04,u_progress+.04,n);float heat=smoothstep(.12,0.,abs(n-u_progress))*(1.-step(1.,u_progress));vec3 burn=mix(vec3(.4,0,0),vec3(1,.4,0),smoothstep(0.,.25,heat));burn=mix(burn,vec3(1,.85,.3),smoothstep(.25,.5,heat));burn=mix(burn,vec3(1),smoothstep(.5,1.,heat));float sparks=step(.92,vnoise(v_uv*80.))*heat*3.;gl_FragColor=vec4(mix(B,A,e).rgb+burn*heat*3.5+vec3(1.,.7,.3)*sparks,1.);}",
    'thermal-distortion': "void main(){float heat=u_progress*1.5;float yFade=smoothstep(1.,0.,v_uv.y);float shimmer=sin(v_uv.y*40.+fbm(v_uv*6.)*8.)*fbm(v_uv*3.+vec2(0.,u_progress*2.));float dispX=shimmer*heat*.03*yFade;vec2 fromUv=clamp(v_uv+vec2(dispX,0.),0.,1.);vec4 A=texture2D(u_from,fromUv);float invShimmer=sin(v_uv.y*40.+fbm(v_uv*6.+3.)*8.)*fbm(v_uv*3.+vec2(3.,u_progress*2.));float dispX2=invShimmer*(1.-u_progress)*.03*yFade;vec2 toUv=clamp(v_uv+vec2(dispX2,0.),0.,1.);vec4 B=texture2D(u_to,toUv);float haze=heat*yFade*.15*(1.-u_progress);gl_FragColor=vec4(mix(A.rgb,B.rgb,u_progress)+vec3(1.,.9,.7)*haze,1.);}",
    'sdf-iris': "void main(){vec4 A=texture2D(u_from,v_uv),B=texture2D(u_to,v_uv);vec2 uv=(v_uv-.5)*vec2(u_resolution.x/u_resolution.y,1.);float d=length(uv);float radius=u_progress*1.2;float fw=.003;float edge=smoothstep(radius+fw,radius-fw,d);float ring1=exp(-abs(d-radius)*25.);float ring2=exp(-abs(d-radius+.04)*20.)*.5;float ring3=exp(-abs(d-radius+.08)*15.)*.25;float glow=(ring1+ring2+ring3)*u_progress*(1.-u_progress)*4.;gl_FragColor=vec4(mix(A,B,edge).rgb+vec3(1.,.85,.6)*glow*.6,1.);}",
}
