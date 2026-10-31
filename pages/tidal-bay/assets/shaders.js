import { underwaterLighting } from './lighting.js';

export const surfaceVertex = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPosition;
uniform float uDepth;
uniform vec4 uView;
out vec2 vUv;
void main(){vUv=aPosition;gl_Position=vec4((aPosition*vec2(16.,10.)-uView.xy)/uView.zw*2.-1.,uDepth,1.);}`;

const finish = `
vec3 finish(vec3 c,vec2 uv){
  vec2 q=(uv-.5)*vec2(1.,.86);
  c=max(vec3(0.),c-vec3(.008,.007,.006));
  c=c*1.12/(1.+c*.10);
  return c*(1.-.16*dot(q,q));
}`;

export const terrainFragment = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uColor;
out vec4 outColor;
${finish}
void main(){outColor=vec4(finish(texture(uColor,vUv).rgb,vUv),1.);}`;

export const waterFragment = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uColor, uField, uWaves, uFish, uReef, uReefDetail;
uniform float uTime, uStorm;
uniform vec4 uView, uSettings;
uniform vec4 uRipples[4];
uniform int uRippleCount;
out vec4 outColor;
${finish}
${underwaterLighting}
void main(){
  vec4 field=texture(uField,vUv);
  float shore=field.r, depth=max(0.,-field.g);
  vec2 p=vUv*vec2(16.,10.);
  vec2 drift=vec2(uTime*.007,-uTime*.0045);
  vec4 wave=texture(uWaves,p*.24+drift);
  vec4 detail=texture(uWaves,p*.83-drift*.73+(wave.rg-.5)*.055);
  vec2 normal=((wave.rg-.5)*.29+(detail.rg-.5)*.065)*(.35+uSettings.y*.8+uStorm*.8);
  for(int i=0;i<4;i++){
    if(i>=uRippleCount)break;
    vec2 delta=p-uRipples[i].xy;
    float age=uTime-uRipples[i].z, radius=age*1.15;
    float distanceToCenter=length(delta), ring=distanceToCenter-radius;
    float envelope=exp(-ring*ring*32.)*exp(-age*.85)*smoothstep(0.,.15,age);
    normal+=delta/max(distanceToCenter,.001)*sin(ring*39.)*envelope*.19*uRipples[i].w;
  }
  // Ripples perturb ONLY normals/refraction. Shore distance and optical depth stay baked.
  vec2 bend=normal*.006*min(depth,1.6);
  vec3 color=texture(uColor,clamp(vUv+bend,0.,1.)).rgb;
  vec4 reef=texture(uReef,clamp(vUv+bend*.65,0.,1.));
  vec4 relief=texture(uReefDetail,clamp(vUv+bend*.65,0.,1.));
  float reefDepth=max(.1,depth-relief.b*1.2);
  vec3 transmission=exp(-vec3(.22,.065,.04)*reefDepth);
  vec3 reefColor=mix(reef.rgb*transmission+color*(1.-transmission)*.65,color,.10+min(depth*.025,.13));
  color=mix(color,reefColor,reef.a*uSettings.w);
  float caustic=refractedLight(p,mix(depth,reefDepth,reef.a));
  float causticAmount=exp(-depth*.42)*smoothstep(0.,.15,shore)*uSettings.z;
  color*=1.+(caustic-1.)*.17*causticAmount;
  color+=vec3(.037,.039,.028)*max(0.,caustic-1.)*causticAmount;
  vec2 screenUv=(p-uView.xy)/uView.zw;
  vec4 fish=texture(uFish,clamp(screenUv+bend*vec2(16.,10.)/uView.zw*.6,0.,1.));
  color=color*(1.-fish.a)+fish.rgb;
  // A coherent sun reflection, soft sky fill and fine glints on wave facets.
  vec3 surfaceNormal=normalize(vec3(-normal*3.2,1.));
  float sun=exp(-dot((p-vec2(7.1,8.8))*vec2(.28,.25),(p-vec2(7.1,8.8))*vec2(.28,.25)));
  vec3 halfway=normalize(vec3(-.12,.14,1.));
  float nh=max(0.,dot(surfaceNormal,halfway)),rough=.11+detail.a*.045;
  float a2=pow(rough,4.),denom=nh*nh*(a2-1.)+1.;
  float glint=min(1.6,a2/(3.14159*denom*denom)*.0045);
  float fresnel=.0204+.9796*pow(1.-surfaceNormal.z,5.);
  color=mix(color,vec3(.49,.69,.74),fresnel*(.55+wave.a*.30)*uSettings.x);
  color+=vec3(1.,.96,.82)*glint*(.018+sun*.46)*uSettings.x;
  color+=vec3(.025,.065,.075)*dot(normal,vec2(-.5,.7));
  // A broken advancing front plus the receding wash: shoreline geometry never moves.
  float swell=.12+.13*sin(uTime*.64+p.y*.34)+.025*sin(p.y*5.+uTime*.43);
  float front=shore-swell;
  float foam=exp(-front*front*600.)*smoothstep(.23,.62,detail.a+wave.b*.2);
  float lace=exp(-pow((shore-swell-.11)*11.,2.))*smoothstep(1.3,3.5,caustic)*.22;
  float wash=exp(-pow((shore-swell+.06)*10.,2.))*.10;
  foam=(foam*.68+lace+wash)*smoothstep(-.12,.015,shore);
  color=mix(color,vec3(.92,.97,.87),clamp(foam,0.,.82));
  color=mix(color,color*vec3(.64,.77,.85),uStorm*.65);
  outColor=vec4(finish(color,screenUv),1.);
}`;

export const fishVertex = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPosition;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec2 aUv;
layout(location=3) in vec2 aMaterial;
layout(location=4) in vec3 aColor;
layout(location=5) in vec4 iPose;
layout(location=6) in vec4 iMotion;
uniform float uTime, uAspect;
uniform vec4 uView;
out vec2 vUv;
out vec3 vNormal, vColor, vTangent;
out vec2 vWorld;
out float vMaterial, vWaterDepth;
void main(){
  vec3 p=aPosition,n=aNormal;
  float tail=pow(max(0.,.3-p.x),2.);
  float wiggle=sin(uTime*iMotion.z+iMotion.x-p.x*4.);
  p.y+=wiggle*tail*.20;
  n.x+=cos(uTime*iMotion.z+iMotion.x-p.x*4.)*tail*.1;
  if(abs(aMaterial.y)>.5){
    p.z+=sin(uTime*iMotion.z*1.25+iMotion.x)*abs(p.y)*.38;
    p.x+=cos(uTime*iMotion.z+iMotion.x)*abs(p.y)*.15;
  }
  float roll=-.23+sin(uTime*.45+iMotion.x)*.16;
  mat2 bank=mat2(cos(roll),sin(roll),-sin(roll),cos(roll));
  p.yz=bank*p.yz;n.yz=bank*n.yz;
  mat2 turn=mat2(cos(iPose.z),sin(iPose.z),-sin(iPose.z),cos(iPose.z));
  vec2 local=turn*vec2(p.x,p.y+p.z*.42)*iPose.w;
  vec2 xy=iPose.xy+local;
  vNormal=vec3(turn*n.xy,n.z);
  vTangent=vec3(turn*vec2(1.,0.),0.);
  vWorld=xy;
  vUv=aUv;vColor=aColor;vMaterial=aMaterial.x;vWaterDepth=iMotion.y;
  gl_Position=vec4((xy-uView.xy)/uView.zw*2.-1.,.1-p.z*.12+iMotion.y*.015,1.);
}`;

export const fishFragment = `#version 300 es
precision highp float;
in vec2 vUv;
in vec3 vNormal,vColor,vTangent;
in vec2 vWorld;
in float vMaterial,vWaterDepth;
uniform sampler2D uSkin,uSkinNormal,uWaves;
uniform float uTime;
out vec4 outColor;
${underwaterLighting}
void main(){
  vec3 n=normalize(vNormal);
  vec4 skin=vec4(vColor,.32);
  float alpha=1.;
  bool fin=vMaterial>.5&&vMaterial<1.5;
  if(vMaterial<.5){
    skin=texture(uSkin,vUv);
    vec2 micro=(texture(uSkinNormal,vUv).rg*2.-1.)*.80;
    vec3 tangent=normalize(vTangent-n*dot(n,vTangent)+vec3(.0001));
    n=normalize(n+tangent*micro.x+cross(n,tangent)*micro.y);
  }
  if(fin){
    // Fine fin rays dissolve at subpixel scale instead of becoming thick stripes.
    float ray=abs(fract(vUv.x*38.)-.5);
    float line=1.-smoothstep(.025,.025+max(.05,fwidth(vUv.x*38.)),ray);
    skin.rgb*=.93+line*.07;
    alpha=mix(.82,.16,smoothstep(.12,1.,vUv.y))+line*.07;
    n=faceforward(n,vec3(0.,0.,-1.),n);
  }
  float caustic=refractedLight(vWorld,vWaterDepth);
  float roughness=vMaterial>1.5?.30:mix(.38,.70,skin.a);
  vec3 col=submergedMaterial(skin.rgb,n,roughness,vWaterDepth,caustic);
  float scaleSheen=pow(max(0.,dot(n,normalize(vec3(-.32,.48,.84)))),18.);
  col+=vec3(.065,.10,.115)*scaleSheen*(1.-step(.5,vMaterial))*(.55+skin.a);
  // Silver schools catch broad sunlight as they bank; detail is already baked.
  float silver=step(6./7.,vUv.y)*(1.-step(.5,vMaterial));
  col+=vec3(.17,.21,.22)*silver*pow(max(n.z,0.),3.);
  outColor=vec4(col,clamp(alpha,0.,1.));
}`;

export const shadowVertex = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPosition;
layout(location=5) in vec4 iPose;
layout(location=6) in vec4 iMotion;
uniform float uAspect;
uniform vec4 uView;
out vec2 vLocal;
void main(){
  vLocal=aPosition;
  mat2 turn=mat2(cos(iPose.z),sin(iPose.z),-sin(iPose.z),cos(iPose.z));
  vec2 local=turn*(aPosition*vec2(.65,iMotion.w>=10.?.48:.23))*iPose.w;
  vec2 pos=iPose.xy+local+vec2(.14,-.13)*(.4+iMotion.y);
  gl_Position=vec4((pos-uView.xy)/uView.zw*2.-1.,.8,1.);
}`;
export const shadowFragment = `#version 300 es
precision highp float;
in vec2 vLocal;
out vec4 outColor;
void main(){float opacity=exp(-dot(vLocal,vLocal)*3.8)*.21;outColor=vec4(.03,.30,.31,opacity);}`;

export const palmVertex = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPosition;
layout(location=1) in vec3 aNormal;
layout(location=3) in vec2 aMaterial;
layout(location=4) in vec3 aColor;
uniform float uTime;
uniform vec4 uView;
out vec3 vColor;
out vec2 vUv;
void main(){
  vec3 p=aPosition;
  p.x+=sin(uTime*.68+p.y*1.7)*.025*aMaterial.y;
  p.y+=sin(uTime*.82+p.x*1.5)*.018*aMaterial.y;
  vec2 xy=vec2(p.x,p.y+p.z*.28);
  float light=.67+.5*abs(dot(normalize(aNormal),normalize(vec3(-.5,.4,1.))));
  vColor=aColor*light;vUv=xy/vec2(16.,10.);
  gl_Position=vec4((xy-uView.xy)/uView.zw*2.-1.,-.4-p.z*.06,1.);
}`;
export const palmFragment = `#version 300 es
precision highp float;
in vec3 vColor;
in vec2 vUv;
out vec4 outColor;
${finish}
void main(){outColor=vec4(finish(vColor,vUv),1.);}`;
