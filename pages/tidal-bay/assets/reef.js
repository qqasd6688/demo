import { W, H, random, clamp } from './coast.js';
import { texel } from './materials.js';

// Static relief renderer: actual overlapping heights, pore normals and cast
// shadows are resolved once, so the live water pass only samples two atlases.
export function createReef(width = 3072, height = 1920, scans) {
  const total = width * height, z = new Float32Array(total), albedo = new Uint8Array(total * 4), detail = new Uint8Array(total * 4);
  const influence = new Uint8Array(total), kind = new Uint8Array(total), rng = random(9203), scale = width / W;
  const palette = [[112,119,77],[166,118,95],[119,100,137],[112,140,132],[172,153,105],[96,116,76]];
  const rock = [110,118,103];
  const noiseSize = 256, noise = new Float32Array(noiseSize * noiseSize);
  for (let i = 0; i < noise.length; i++) noise[i] = rng();
  function value(x,y) {
    const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
    const at=(a,b)=>noise[((b&255)*256)+(a&255)];
    const a=fx*fx*(3-2*fx),b=fy*fy*(3-2*fy);
    return (at(ix,iy)*(1-a)+at(ix+1,iy)*a)*(1-b)+(at(ix,iy+1)*(1-a)+at(ix+1,iy+1)*a)*b;
  }
  function bounds(x,y,rx,ry,pad=0) {
    return [Math.max(0,Math.floor((x-rx-pad)*scale)),Math.max(0,Math.floor((y-ry-pad)*scale)),Math.min(width-1,Math.ceil((x+rx+pad)*scale)),Math.min(height-1,Math.ceil((y+ry+pad)*scale))];
  }
  function shadePixel(i,h,color,type,grain,textureValue=1) {
    if(h<=z[i])return;
    z[i]=h;kind[i]=type;
    const k=i*4;
    albedo[k]=clamp((color[0]*textureValue+grain)/255)*255;
    albedo[k+1]=clamp((color[1]*textureValue+grain)/255)*255;
    albedo[k+2]=clamp((color[2]*textureValue+grain*.7)/255)*255;albedo[k+3]=255;
  }
  function mound(x,y,rx,ry,elevation,color,type=1,seed=0) {
    const [x0,y0,x1,y1]=bounds(x,y,rx*1.13,ry*1.13,.14);
    for(let py=y0;py<=y1;py++)for(let px=x0;px<=x1;px++){
      const i=py*width+px;influence[i]=1;
      const xx=(px/scale-x)/rx,yy=(py/scale-y)/ry,a=Math.atan2(yy,xx);
      const wobble=1+Math.sin(a*7+seed)*.045+Math.sin(a*13-seed)*.026+Math.sin(a*21+seed)*.012;
      const r=Math.hypot(xx,yy)/wobble;if(r>=1)continue;
      const u=px/scale*1.3+seed,v=py/scale*1.3-seed;
      const t=texel(scans.coral,u,v),htex=texel(scans.coralHeight,u,v);
      const scan=scans.coral.data, luminance=(scan[t]*.26+scan[t+1]*.5+scan[t+2]*.24)/155;
      const grain=(value(px*.8,py*.8)-.5)*8;
      let h=elevation*Math.sqrt(1-r*r), tint=.76+luminance*.28;
      if(type===1)h+=(scans.coralHeight.data[htex]/255-.45)*.06;
      if(type===2){
        // Meandering brain-coral ridges with fine septa, not concentric circles.
        const phase=xx*32+Math.sin(yy*18+Math.sin(xx*9))*2.1+value(xx*10+seed,yy*10)*5;
        const ridge=Math.pow(.5+.5*Math.cos(phase),.65);
        h+=ridge*.028;tint*=.68+ridge*.42;
      }
      if(type===3){
        // Thin overlapping table corals; soft folds, a raised living rim.
        const fold=Math.sin(a*27+Math.sin(a*9)*1.3+r*4);
        h=elevation*(.72+.18*Math.cos(r*2)) + fold*.008*r + Math.exp(-Math.pow((r-.94)*35,2))*.012;
        tint*=.89+fold*.08+Math.exp(-Math.pow((r-.96)*32,2))*.30;
      }
      if(type===4){
        const fx=xx*18,fy=yy*17, row=Math.floor(fy);
        const pore=Math.hypot((fx+(row%2)*.5)%1-.5,fy-Math.floor(fy)-.5);
        const ring=Math.exp(-Math.pow((pore-.30)*12,2));
        h+=ring*.010;tint*=.78+ring*.25;
      }
      shadePixel(i,h,color,type,grain,tint);
    }
  }
  function tube(ax,ay,az,bx,by,bz,radius,color,seed=0){
    const r=radius, [x0,y0,x1,y1]=bounds((ax+bx)/2,(ay+by)/2,Math.abs(bx-ax)/2+r,Math.abs(by-ay)/2+r,.025);
    const vx=bx-ax,vy=by-ay,len2=vx*vx+vy*vy;
    for(let py=y0;py<=y1;py++)for(let px=x0;px<=x1;px++){
      const i=py*width+px;influence[i]=1;
      const xx=px/scale,yy=py/scale,t=clamp(((xx-ax)*vx+(yy-ay)*vy)/Math.max(len2,1e-6));
      const taper=r*(1-t*.42),d=Math.hypot(xx-ax-vx*t,yy-ay-vy*t)/taper;if(d>1)continue;
      const bump=value(px*.45+seed,py*.45)*.005,h=az+(bz-az)*t+Math.sqrt(1-d*d)*taper+bump;
      shadePixel(i,h,color,5,(value(px,py)-.5)*11,.85+value(px*.2,py*.2)*.22+(t>.94?.16:0));
    }
  }
  function branches(x,y,z0,a,len,r,depth,color,seed){
    const endX=x+Math.cos(a)*len,endY=y+Math.sin(a)*len;
    const endZ=z0+len*(.18+rng()*.28);
    tube(x,y,z0,endX,endY,endZ,r,color,seed);
    if(depth>0){
      branches(endX,endY,endZ,a-.35-rng()*.45,len*.66,r*.65,depth-1,color,seed+3);
      branches(endX,endY,endZ,a+.35+rng()*.45,len*.69,r*.65,depth-1,color,seed+7);
      if(depth>2)branches(endX,endY,endZ,a+(rng()-.5)*.25,len*.65,r*.7,depth-1,color,seed+12);
    }
  }
  const islands=[[3.9,5.75,.78],[6.05,7.0,.80],[7.0,3.5,1.02],[10.1,6.65,.89],[11.5,2.6,.75],[3.0,2.65,.60],[13.3,8.5,.62]];
  islands.forEach(([cx,cy,r],index)=>{
    // Discontinuous limestone shelves; shadows tie each colony to the substrate.
    for(let j=0;j<13;j++){
      const a=rng()*Math.PI*2,d=Math.sqrt(rng())*r;
      mound(cx+Math.cos(a)*d,cy+Math.sin(a)*d*.67,r*(.13+rng()*.23),r*(.12+rng()*.16),.08+rng()*.17,rock,1,index+j);
    }
    for(let j=0;j<11;j++){
      const a=j*2.399+index,d=Math.sqrt(j/11)*r*.84,x=cx+Math.cos(a)*d,y=cy+Math.sin(a)*d*.68;
      const radius=r*(.17+rng()*.19),col=palette[(index+j)%palette.length];
      if(j%4===0){
        for(let k=0;k<3;k++)mound(x+(k-1)*radius*.36,y+k*radius*.14,radius*(1-k*.14),radius*(.70-k*.07),.22+k*.055,col,3,index+j+k);
      }else if(j%4===1)mound(x,y,radius,radius*.81,.20+radius*.40,col,2,index+j);
      else if(j%4===2)for(let k=0;k<6;k++)branches(x,y,.18,k*Math.PI/3+.2,radius*.49,.022,4,col,index+j+k);
      else {
        for(let k=0;k<16;k++){const a=k*2.4,d=Math.sqrt(k/16)*radius;mound(x+Math.cos(a)*d,y+Math.sin(a)*d*.8,radius*.24,radius*.20,.16+rng()*.11,col,4,index+j+k);}
      }
    }
    for(let j=0;j<30;j++){
      const a=rng()*Math.PI*2,d=r*(1+rng()*.35),x=cx+Math.cos(a)*d,y=cy+Math.sin(a)*d*.7;
      if(j%5)mound(x,y,.015+rng()*.026,.012+rng()*.022,.012+rng()*.024,[151,151,115],1,j);
      else for(let g=0;g<5;g++)tube(x,y,.005,x+(g-2)*.018,y+.06+rng()*.08,.025,.004,[66,100,67],g);
    }
  });
  for(const [x,y,a] of [[3.2,7,.3],[5.2,4.1,1.2],[9.1,7.5,.6]])for(let k=0;k<5;k++){
    const t=a+k*Math.PI*.4;tube(x,y,.026,x+Math.cos(t)*.14,y+Math.sin(t)*.14,.012,.028,[182,112,70],k);
  }
  const color=new Uint8Array(albedo.length), pixel=1/scale;
  const at=(x,y)=>z[Math.max(0,Math.min(height-1,y))*width+Math.max(0,Math.min(width-1,x))];
  for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
    const i=y*width+x;if(!influence[i])continue;const k=i*4,h=z[i];
    let visibility=1;
    for(const distance of [.035,.075,.13,.21,.32,.47]){
      const qx=Math.round(x-distance*.55*scale),qy=Math.round(y+distance*.64*scale);
      if(at(qx,qy)>h+distance*.95+.018){visibility=.40;break;}
    }
    if(!h){if(visibility<1){color[k]=28;color[k+1]=50;color[k+2]=43;color[k+3]=85;}continue;}
    let nx=-(at(x+1,y)-at(x-1,y))/(2*pixel),ny=-(at(x,y+1)-at(x,y-1))/(2*pixel),nz=1;
    if(kind[i]===1){
      const q=texel(scans.coralNormal,x/scale*1.3,y/scale*1.3);
      nx+=(scans.coralNormal.data[q]/127.5-1)*.42;ny+=(scans.coralNormal.data[q+1]/127.5-1)*.42;
    }
    const len=Math.hypot(nx,ny,nz);nx/=len;ny/=len;nz/=len;
    let occlusion=0;
    for(const [ox,oy] of [[5,0],[-5,0],[0,5],[0,-5],[11,11],[-11,11],[11,-11],[-11,-11]])occlusion+=Math.max(0,at(x+ox,y+oy)-h-.009);
    const ao=Math.exp(-occlusion*2.1);
    const diffuse=Math.max(0,nx*-.43+ny*.52+nz*.74);
    const light=(.34+diffuse*.96*visibility)*(.70+ao*.30);
    color[k]=Math.min(255,albedo[k]*light*1.12);color[k+1]=Math.min(255,albedo[k+1]*light*1.05);color[k+2]=Math.min(255,albedo[k+2]*light*.94);color[k+3]=255;
    detail[k]=(nx*.5+.5)*255;detail[k+1]=(ny*.5+.5)*255;detail[k+2]=Math.min(255,h/1.2*255);detail[k+3]=nz*255;
  }
  return {color,detail,width,height};
}
