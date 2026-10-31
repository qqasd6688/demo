import { random, clamp } from './coast.js';

// Albedo/roughness + tangent normal atlas. Nine tiles include turtle dermis;
// all pores, scutes, pigmentation and growth bands are resolved at startup.
export function createMarineAtlas() {
  const size=512,width=size*4,height=size*3,data=new Uint8Array(width*height*4),detail=new Uint8Array(data.length);
  const relief=new Float32Array(size*size),rng=random(603),field=new Float32Array(256*256);
  for(let i=0;i<field.length;i++)field[i]=rng();
  const noise=(x,y)=>{
    const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,a=fx*fx*(3-2*fx),b=fy*fy*(3-2*fy);
    const at=(x,y)=>field[(y&255)*256+(x&255)];
    return (at(ix,iy)*(1-a)+at(ix+1,iy)*a)*(1-b)+(at(ix,iy+1)*(1-a)+at(ix+1,iy+1)*a)*b;
  };
  const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
  const shellSeeds=[[.11,.5],[.29,.5],[.49,.5],[.69,.5],[.89,.5],[.23,.24],[.48,.20],[.74,.24],[.23,.76],[.48,.8],[.74,.76]];
  for(let kind=0;kind<9;kind++){
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const u=x/(size-1),v=y/(size-1),n=noise(u*13+kind*11,v*13+kind*7),fine=noise(x*.65,y*.65),micro=noise(x*2.7,y*2.7);
      let r=50,g=68,b=70,h=(fine-.5)*.0012,rough=.62;
      if(kind<3){
        const mottle=.72+n*.38+noise(u*45,v*45)*.12;
        [r,g,b]=kind===0?[34,43,45]:kind===1?[34,45,46]:[121,113,71];
        r*=mottle;g*=mottle;b*=mottle;
        if(kind===0){
          const side=Math.abs(v-.5),shoulder=Math.exp(-Math.pow((u-.76+side*.28)/.12,4)-Math.pow((side-.22)/.075,2));
          const pigment=shoulder*(.24+n*.18)*(.75+fine*.25);
          r=r*(1-pigment)+147*pigment;g=g*(1-pigment)+159*pigment;b=b*(1-pigment)+151*pigment;
        }else{
          const frequency=kind===1?34:11,xx=u*frequency,yy=v*frequency*.92,cx=Math.floor(xx),cy=Math.floor(yy);
          const sx=.20+noise(cx*7,cy*11)*.6,sy=.2+noise(cx*13+4,cy*5)*.6;
          const radius=kind===1?.09+noise(cx+41,cy+17)*.11:.14+noise(cx+17,cy+7)*.10;
          const d=Math.hypot(xx-cx-sx,yy-cy-sy),mask=(1-smooth(radius*.65,radius,d))*(noise(cx+19,cy+33)>.23?1:0);
          const color=kind===1?[176,183,157]:[69,140,158];
          r=r*(1-mask)+color[0]*mask;g=g*(1-mask)+color[1]*mask;b=b*(1-mask)+color[2]*mask;
        }
        h+=(micro-.5)*.0008;rough=.64+fine*.18;
      }else if(kind===3){
        let first=9,second=9,nearest=0;
        const uu=u+(noise(u*12,v*12)-.5)*.013,vv=v+(noise(u*12+73,v*12+34)-.5)*.009;
        for(let i=0;i<shellSeeds.length;i++){
          const [sx,sy]=shellSeeds[i],d=Math.hypot((uu-sx)*1.16,vv-sy);
          if(d<first){second=first;first=d;nearest=i;}else if(d<second)second=d;
        }
        const edge=second-first,groove=1-smooth(.001,.008,edge),rim=Math.exp(-Math.pow((edge-.012)*220,2));
        const [sx,sy]=shellSeeds[nearest],radial=Math.atan2(v-sy,u-sx);
        const streak=Math.sin(radial*31+noise(u*17,v*17)*3)*.5+.5;
        const band=.5+.5*Math.sin(first*195+noise(u*23,v*23)*3),marble=noise(u*42+nearest*3,v*38)*.32+n*.38+streak*.30;
        const amber=smooth(.30,.76,marble),dark=.84+noise(u*5+31,v*7)*.14;
        r=(87+amber*44+band*7)*dark;g=(87+amber*27+band*6)*dark;b=(44+amber*10+band*4)*dark;
        r=r*(1-groove*.65)+rim*18;g=g*(1-groove*.65)+rim*16;b=b*(1-groove*.60)+rim*10;
        h=(1-groove)*.008+rim*.001+band*.0007+streak*.0004+(fine-.5)*.0005;
        rough=.43+fine*.16+groove*.12;
      }else if(kind===4||kind===5){
        const xx=(u-.5)*2,yy=(v-.5)*2,d=Math.hypot(xx,yy),angle=Math.atan2(yy,xx);
        const rim=Math.exp(-Math.pow((d-.94)*40,2)),vein=Math.pow(.5+.5*Math.cos(angle*64+Math.sin(d*7)*.4),24)*smooth(.3,.9,d)*.10;
        const gold=kind===5;[r,g,b]=gold?[175,148,84]:[167,193,198];
        let organs=0;
        for(let i=0;i<4;i++){const a=i*Math.PI*.5,cx=Math.cos(a)*.19,cy=Math.sin(a)*.19;const d=Math.hypot((xx-cx)*1.15,yy-cy);organs+=Math.exp(-Math.pow((d-.11)*65,2));}
        r+=rim*48+vein*25+organs*(gold?16:27);g+=rim*48+vein*25+organs*(gold?6:6);b+=rim*45+vein*20+organs*(gold?-8:23);
        h=vein*.002+(fine-.5)*.0002;
        // For translucent bells the alpha channel carries optical density.
        rough=(gold?.18:.07)+rim*.20+vein*.45+organs*.25;
      }else if(kind<8){
        const dorsal=Math.max(0,Math.sin(v*Math.PI*2)),belly=smooth(.05,.7,-Math.sin(v*Math.PI*2));
        [r,g,b]=kind===6?[106,128,129]:[99,132,138];
        r*=1-dorsal*.38;g*=1-dorsal*.30;b*=1-dorsal*.26;
        r=r*(1-belly)+207*belly;g=g*(1-belly)+211*belly;b=b*(1-belly)+195*belly;
        const side=smooth(.65,1,Math.abs(Math.cos(v*Math.PI*2)));
        let gills=0;for(let j=0;j<5;j++)gills+=Math.exp(-Math.pow((u-.71-j*.014+Math.sin(v*Math.PI*2)*.007)*540,2))*side;
        r-=gills*28;g-=gills*29;b-=gills*26;h-=gills*.0015;rough=.44+fine*.15;
      }else{
        const xx=u*11,yy=v*13,cx=Math.floor(xx),cy=Math.floor(yy);
        let first=9,second=9,id=0;
        for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){
          const a=cx+ox,b=cy+oy,dx=a+.22+noise(a*7,b*11)*.56-xx,dy=b+.22+noise(a*11+33,b*5)*.56-yy,d=dx*dx+dy*dy;
          if(d<first){second=first;first=d;id=noise(a+91,b+31);}else if(d<second)second=d;
        }
        const border=1-smooth(.015,.09,Math.sqrt(second)-Math.sqrt(first)),tone=.65+id*.50+n*.15;
        r=69*tone+border*66;g=79*tone+border*65;b=48*tone+border*43;
        h=(1-border)*.003+(fine-.5)*.0007;rough=.68;
      }
      const k=((Math.floor(kind/4)*size+y)*width+(kind%4)*size+x)*4;
      const grain=(micro-.5)*(kind===4||kind===5?1.5:4);
      data[k]=clamp((r+grain)/255)*255;data[k+1]=clamp((g+grain)/255)*255;data[k+2]=clamp((b+grain)/255)*255;data[k+3]=rough*255;
      relief[y*size+x]=h;
    }
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const at=(xx,yy)=>relief[Math.max(0,Math.min(size-1,yy))*size+Math.max(0,Math.min(size-1,xx))];
      const nx=-(at(x+1,y)-at(x-1,y))*size*.45,ny=-(at(x,y+1)-at(x,y-1))*size*.45,len=Math.hypot(nx,ny,1);
      const k=((Math.floor(kind/4)*size+y)*width+(kind%4)*size+x)*4;
      detail[k]=(nx/len*.5+.5)*255;detail[k+1]=(ny/len*.5+.5)*255;detail[k+2]=(1/len*.5+.5)*255;detail[k+3]=255;
    }
  }
  return {data,detail,width,height};
}
