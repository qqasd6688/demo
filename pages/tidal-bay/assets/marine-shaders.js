import { underwaterLighting } from './lighting.js';

export const vertex = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPosition;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec2 aUv;
layout(location=3) in vec2 aMaterial;
layout(location=4) in vec3 aColor;
layout(location=5) in vec4 iPose;
layout(location=6) in vec4 iMotion;
uniform float uTime;
uniform vec4 uView;
out vec2 vUv,vWorld;
out vec3 vNormal,vColor,vPosition;
out float vMaterial,vDepth,vKind;
void main(){
  vec3 p=aPosition,n=aNormal;
  float kind=iMotion.w, phase=uTime*iMotion.z+iMotion.x;
  if(kind<2.5){
    float flap=sin(phase-p.x*2.2)*.42;
    float wing=smoothstep(.12,.85,abs(p.y));
    p.z+=flap*wing*abs(p.y);p.y*=1.-abs(flap)*wing*.20;
    n.y-=flap*sign(p.y)*wing;
    if(aMaterial.y>1.5)p.y+=sin(phase-p.x*3.)*max(0.,-p.x-.5)*.07;
  }else if(kind<3.5&&aMaterial.y>.5){
    p.z+=sin(phase)*abs(p.y)*.18;p.x+=cos(phase)*abs(p.y)*.09;
  }else if(kind<5.5&&kind>3.5){
    float pulse=1.+sin(phase)*.055;
    p.xy*=pulse;p.z*=2.-pulse;
    if(aMaterial.y>1.5){p.y+=sin(phase+p.x*8.+p.y*4.)*.035;p.x+=cos(phase+p.y*6.)*.025;}
  }else if(kind>5.5){
    p.y+=sin(phase-p.x*4.)*pow(max(0.,.25-p.x),2.)*.10;
    if(kind>6.5){float jump=max(0.,-iMotion.y);p.z+=jump;p.x+=jump*.2;}
  }
  mat2 turn=mat2(cos(iPose.z),sin(iPose.z),-sin(iPose.z),cos(iPose.z));
  vec2 xy=iPose.xy+turn*vec2(p.x,p.y+p.z*.28)*iPose.w;
  vNormal=normalize(vec3(turn*n.xy,n.z));vColor=aColor;vMaterial=aMaterial.x;
  float tile=aMaterial.x>5.5?8.:kind;
  vec2 cell=vec2(mod(tile,4.),floor(tile/4.));vUv=(cell+clamp(aUv,.006,.994))/vec2(4.,3.);
  vPosition=vec3(xy,p.z*iPose.w);
  vWorld=xy;vDepth=max(.02,iMotion.y);vKind=kind;
  gl_Position=vec4((xy-uView.xy)/uView.zw*2.-1.,.05-p.z*.12+iMotion.y*.015,1.);
}`;

export const fragment = `#version 300 es
precision highp float;
in vec2 vUv,vWorld;
in vec3 vNormal,vColor,vPosition;
in float vMaterial,vDepth,vKind;
uniform sampler2D uAtlas,uNormal,uWaves;
uniform float uTime;
out vec4 outColor;
${underwaterLighting}
void main(){
  vec3 n=normalize(vNormal);if(n.z<0.)n=-n;
  bool textured=(vMaterial>2.5&&vMaterial<4.5)||vMaterial>5.5;
  vec4 skin=textured?texture(uAtlas,vUv):vec4(vColor,.56);
  if(textured){
    vec3 qx=dFdx(vPosition),qy=dFdy(vPosition);vec2 tx=dFdx(vUv),ty=dFdy(vUv);
    vec3 tangent=normalize(qx*ty.y-qy*tx.y+vec3(.00001));
    vec3 bitangent=normalize(-qx*ty.x+qy*tx.x+vec3(.00001));
    vec3 bump=texture(uNormal,vUv).xyz*2.-1.;
    n=normalize(n*max(.2,bump.z)+tangent*bump.x+bitangent*bump.y);
  }
  bool bell=vMaterial>3.5&&vMaterial<4.5;
  float caustic=bell?1.:refractedLight(vWorld,vDepth);
  vec3 col=submergedMaterial(skin.rgb,n,bell?.18:skin.a,vDepth,caustic);
  float alpha=1.;
  if(vMaterial>3.5&&vMaterial<4.5){
    float fresnel=pow(1.-abs(n.z),1.7);
    vec2 local=fract(vUv*vec2(4.,3.));float edge=smoothstep(.85,.99,length(local-.5)*2.);
    alpha=skin.a+fresnel*.32+edge*.12;
    col+=vec3(.22,.29,.30)*fresnel;
  }else if(vMaterial>4.5&&vMaterial<5.5){alpha=.22;}
  outColor=vec4(col,alpha);
}`;
