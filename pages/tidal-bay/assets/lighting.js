export const underwaterLighting = `
float refractedLight(vec2 world,float depth){
  vec2 uv=(world+vec2(.18,-.14)*depth)*.43;
  vec2 flow=vec2(uTime*.007,-uTime*.0045);
  float a=texture(uWaves,uv+flow).b;
  float b=texture(uWaves,mat2(.92,.38,-.38,.92)*uv*1.17-flow*.61).b;
  return 1.+(min(4.5,(a*a+b*b)*4.)-1.)*.68;
}
vec3 submergedMaterial(vec3 albedo,vec3 n,float roughness,float depth,float caustic){
  vec3 l=normalize(vec3(-.43,.52,.74)),v=vec3(0.,0.,1.),h=normalize(l+v);
  float nl=max(0.,dot(n,l)),nv=max(.06,n.z),nh=max(0.,dot(n,h));
  float a=roughness*roughness,a2=a*a,d=nh*nh*(a2-1.)+1.;
  float D=a2/(3.141593*d*d),k=(roughness+1.)*(roughness+1.)*.125;
  float G=(nl/(nl*(1.-k)+k))*(nv/(nv*(1.-k)+k));
  float spec=min(.65,D*G*.028/max(.02,4.*nl*nv));
  vec3 base=pow(max(albedo,vec3(.001)),vec3(2.2));
  vec3 illumination=vec3(.15,.22,.24)*(.68+.32*nv)+vec3(1.18,1.10,.93)*nl*(.72+.28*caustic);
  vec3 linear=base*illumination+vec3(.91,.98,.94)*spec*nl*(.82+.18*caustic);
  vec3 transmission=exp(-vec3(.25,.075,.045)*depth*.75);
  linear=linear*transmission+vec3(.012,.105,.13)*(1.-transmission);
  return pow(max(linear,vec3(0.)),vec3(1./2.2));
}
`;
