(function(root){
  'use strict';
  // ---------------------------------------------------------------------------
  // NEON RUSH CITY — CIRCUITO URBANO PREMIUM V3 (anel radial legível em 1 s)
  // Estrutura: META (reta colinear) → curva larga → S suave → reta central
  //            (colinear) → hairpin → curva de retorno → chicane → meta
  // Centro + 16 estações angulares (22.5°) com perfil de raios. Um anel radial
  // é star-shaped: a centerline NUNCA se auto-intersecta nem toca a própria
  // faixa — acabaram os estilhaços do preenchimento.
  // Retas de verdade: pontos médios puxados para r·cos(22.5°) (colinear com os
  // extremos). S e hairpin por ondulação/dip do perfil de raios.
  // API intacta: TRACK_PATH, pointAt, startGrid, parkingPoint, roadMesh,
  // hitboxAudit, runRoadQA, FINISH_EXIT_PATH, centerPoint.
  // ---------------------------------------------------------------------------
  const CX=360,CY=358;
  const clamp=(v,a,b)=>Math.min(Math.max(v,a),b);
  // Estação 0 = TOPO (META). Sentido dos ponteiros. Perfil de raios por estação:
  //  s0 META extremo direito da reta · s8 extremo esquerdo
  const RADII=[
    258, // s0  topo (META)
    246, // s1  saída da meta
    240, // s2  curva larga direita
    246, // s3  S suave — abre
    242, // s4  S suave — fecha
    250, // s5  deslance direito (fluxo)
    240, // s6  desce ao fundo
    246, // s7  fundo-direita
    250, // s8  fundo (reta central)
    242, // s9  fundo-esquerda
    234, // s10 prepara hairpin
    214, // s11 HAIRPIN — dip (curva fechada)
    232, // s12 saída do hairpin
    248, // s13 chicane — abre
    240, // s14 chicane — fecha
    250  // s15 retorno à meta
  ];
  const N_ST=16;
  function stationPoints(){
    const pts=[];
    for(let i=0;i<N_ST;i+=1){
      const a=Math.PI*2*(i/N_ST)-Math.PI/2; // s0 no topo
      pts.push({x:CX+Math.cos(a)*RADII[i],y:CY+Math.sin(a)*RADII[i]});
    }
    return pts;
  }
  function catmullClosed(pts,steps=16){
    // Array circular: índices negativos/ overrun resolvem por módulo —
    // sem ponto fantasma no segmento 0 (era a causa do ramo sobreposto).
    const m=pts.length;
    const at=(k)=>pts[((k%m)+m)%m];
    const out=[];
    for(let i=0;i<m;i+=1){
      const p0=at(i-1),p1=at(i),p2=at(i+1),p3=at(i+2);
      for(let s=0;s<steps;s+=1){
        const u=s/steps,u2=u*u,u3=u2*u;
        // CORREÇÃO CRÍTICA: coeficiente 2*b (não 2*a). Com 2*a o spline ficava
      // deslocado (q(0)=p0 em vez de p1) — causa raiz dos estilhaços/cusps.
      const h=(a,b,c,d)=>0.5*((2*b)+(-a+c)*u+(2*a-5*b+4*c-d)*u2+(-a+3*b-3*c+d)*u3);
        out.push({x:h(p0.x,p1.x,p2.x,p3.x),y:h(p0.y,p1.y,p2.y,p3.y)});
      }
    }
    return out;
  }
  const PTS=catmullClosed(stationPoints(),16); // 256 amostras
  const N=PTS.length;
  function loopIdx(i){return ((i%N)+N)%N;}

  function deriv(i){
    const a=PTS[loopIdx(i-1)],b=PTS[loopIdx(i+1)];
    const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;
    return {tx:dx/len,ty:dy/len,angle:Math.atan2(dy,dx)};
  }
  function curvatureAt(i){
    const p=PTS[i],pA=PTS[loopIdx(i-4)],pB=PTS[loopIdx(i+4)];
    const d1x=p.x-pA.x,d1y=p.y-pA.y,d2x=pB.x-2*p.x+pA.x,d2y=pB.y-2*p.y+pA.y;
    const den=Math.pow(d1x*d1x+d1y*d1y,1.5)||1;
    return Math.abs((d1x*d2y-d1y*d2x)/den);
  }

  const TRACK_PATH=Object.freeze({
    cx:CX,cy:CY,rx:264,ry:222,roadHalfWidth:52,kartHalfWidth:14,kartHalfLength:21,safetyMargin:5,
    sampleCount:256,startProgress:.25,
    layout:'STREET_CIRCUIT_V3_RADIAL'
  });

  function centerPoint(progress){
    const pr=((Number(progress)||0)%1+1)%1;
    const idx=Math.min(N-1,Math.max(0,Math.floor(pr*N)));
    const p=PTS[idx],d=deriv(idx);
    return {x:p.x,y:p.y,tx:d.tx,ty:d.ty,angle:d.angle,curvature:curvatureAt(idx)};
  }
  function maxLaneOffset(idxOrProgress){
    let idx=idxOrProgress;
    if(typeof idx!=='number'||idx<0||idx>=N){
      idx=Math.floor((((Number(idxOrProgress)||0)%1+1)%1)*N);
      idx=Math.min(N-1,Math.max(0,idx));
    }
    const base=TRACK_PATH.roadHalfWidth-TRACK_PATH.kartHalfWidth-TRACK_PATH.safetyMargin;
    const k=curvatureAt(idx);
    const tightness=clamp(k/.014,0,1);
    return base*(1-tightness*.35);
  }
  function loopPoint(idx){
    const p=PTS[loopIdx(idx)],d=deriv(idx);
    return {x:p.x,y:p.y,tx:d.tx,ty:d.ty,angle:d.angle};
  }
  function pointAt(progress,lane=0){
    const pr=((Number(progress)||0)%1+1)%1;
    const idx=Math.min(N-1,Math.max(0,Math.floor(pr*N)));
    const c=loopPoint(idx),spread=maxLaneOffset(idx);
    const slot=clamp(Number(lane)||0,-1,1);
    return {...c,x:c.x+c.ty*slot*spread,y:c.y-c.tx*slot*spread,laneOffset:slot*spread,maxLaneOffset:spread};
  }
  function safeLaneOffset(lane,progress){
    return maxLaneOffset(progress)*clamp(Number(lane)||0,-1,1);
  }
  // lateral = projeção no normal n=(-ty,tx) do centro no mesmo progresso
  function signedLateral(progress,point){
    const c=pointAt(progress,0);
    return (point.x-c.x)*(-c.ty)+(point.y-c.y)*(c.tx);
  }
  function kartCorners(progress,lane=0){
    const p=pointAt(progress,lane),hw=TRACK_PATH.kartHalfWidth,hl=TRACK_PATH.kartHalfLength;
    return [[hl,hw],[hl,-hw],[-hl,hw],[-hl,-hw]].map(([f,s])=>({x:p.x+p.tx*f+p.ty*s,y:p.y+p.ty*f-p.tx*s}));
  }
  function roadClearance(progress,lane=0){
    const p=pointAt(progress,lane);
    const footprint=Math.hypot(TRACK_PATH.kartHalfWidth,TRACK_PATH.kartHalfLength*.28);
    return TRACK_PATH.roadHalfWidth-Math.abs(p.laneOffset)-footprint-TRACK_PATH.safetyMargin;
  }
  function startGrid(count=16){
    return Array.from({length:Math.min(16,Math.max(0,count))},(_,i)=>{
      const row=Math.floor(i/2),side=i%2===0?-.45:.45,progress=-row*.027-.0135;
      return {...pointAt(progress,side),slot:i+1,progress,lane:side};
    });
  }
  function parkingPoint(position){
    const index=Math.max(0,(Number(position)||1)-1),row=Math.floor(index/2),col=index%2;
    const progress=.03+row*.036,lane=col===0?-.48:.48;
    return {...pointAt(progress,lane),lane,progress:((progress%1)+1)%1,position:index+1};
  }
  function hitboxAudit(progress,lane){
    const corners=kartCorners(progress,lane);
    let outward=-Infinity,inward=-Infinity,finite=true;
    for(const corner of corners){
      if(!Number.isFinite(corner.x)||!Number.isFinite(corner.y)){finite=false;continue;}
      const lateral=signedLateral(progress,corner);
      inward=Math.max(inward,lateral);
      outward=Math.max(outward,-lateral);
    }
    return {finite,outward,inward,grassClearance:TRACK_PATH.roadHalfWidth-outward,infieldClearance:TRACK_PATH.roadHalfWidth-inward};
  }
  function finishRoutePoint(position,t){
    const k=clamp(Number(t)||0,0,1),park=parkingPoint(position);
    let progress,lane;
    if(k<.55){const u=k/.55*(FINISH_EXIT_PATH.length-1),i=Math.floor(u),a=FINISH_EXIT_PATH[i],b=FINISH_EXIT_PATH[Math.min(i+1,FINISH_EXIT_PATH.length-1)],m=u-i;progress=a.progress+(b.progress-a.progress)*m;lane=a.lane+(b.lane-a.lane)*m;}
    else{const a=FINISH_EXIT_PATH[FINISH_EXIT_PATH.length-1],m=(k-.55)/.45;progress=a.progress+(park.progress-a.progress)*m;lane=a.lane+(park.lane-a.lane)*m;}
    return {...pointAt(progress,lane),progress,lane};
  }
  function roadMesh(samples=TRACK_PATH.sampleCount){
    const center=[],left=[],right=[];
    for(let i=0;i<samples;i+=1){
      const p=pointAt(i/samples,0);
      center.push({x:p.x,y:p.y});
      left.push({x:p.x+p.ty*TRACK_PATH.roadHalfWidth,y:p.y-p.tx*TRACK_PATH.roadHalfWidth});
      right.push({x:p.x-p.ty*TRACK_PATH.roadHalfWidth,y:p.y+p.tx*TRACK_PATH.roadHalfWidth});
    }
    return {center,left,right};
  }
  function finishLinePoint(){return pointAt(0,0);}
  function boostStartProgress(){return .53;}
  function boostEndProgress(){return .57;}
  function pitEntryProgress(){return .875;}
  function pitExitProgress(){return .99;}
  function runRoadQA({racers=16,laps=5,samplesPerLap=360}={}){
    const report={roadSamples:0,roadViolations:0,grassHits:0,infieldHits:0,boxHits:0,minRoadClearance:Infinity};
    for(let lap=0;lap<laps;lap+=1){
      for(let step=0;step<samplesPerLap;step+=1){
        for(let racer=0;racer<racers;racer+=1){
          const progress=(lap+(step+racer*.37)/samplesPerLap),lane=((racer%3)-1)*.78;
          const audit=hitboxAudit(progress,lane);
          report.roadSamples+=1;
          if(!audit.finite){report.roadViolations+=1;report.boxHits+=1;continue;}
          report.minRoadClearance=Math.min(report.minRoadClearance,Math.min(audit.grassClearance,audit.infieldClearance));
          if(audit.grassClearance<0){report.roadViolations+=1;report.grassHits+=1;}
          if(audit.infieldClearance<0){report.roadViolations+=1;report.infieldHits+=1;}
        }
      }
    }
    const staticCases=[];
    startGrid(16).forEach(s=>staticCases.push([s.progress,s.lane]));
    for(let pos=1;pos<=16;pos+=1){const p=parkingPoint(pos);staticCases.push([p.progress,p.lane]);}
    FINISH_EXIT_PATH.forEach(w=>staticCases.push([w.progress,w.lane]));
    for(let pos=1;pos<=16;pos++)for(let step=0;step<=100;step++){const p=finishRoutePoint(pos,step/100);staticCases.push([p.progress,p.lane]);}
    staticCases.push([pitEntryProgress(),0]);
    staticCases.push([.925,-.75],[.925,-.45],[.925,.45],[.925,.75]);
    staticCases.push([pitExitProgress(),0]);
    for(const [progress,lane] of staticCases){
      const audit=hitboxAudit(progress,lane);
      report.roadSamples+=1;
      if(!audit.finite){report.roadViolations+=1;report.boxHits+=1;continue;}
      report.minRoadClearance=Math.min(report.minRoadClearance,Math.min(audit.grassClearance,audit.infieldClearance));
      if(audit.grassClearance<0){report.roadViolations+=1;report.grassHits+=1;}
      if(audit.infieldClearance<0){report.roadViolations+=1;report.infieldHits+=1;}
    }
    report.minRoadClearance=Number(report.minRoadClearance.toFixed(3));
    return report;
  }
  const FINISH_EXIT_PATH=Object.freeze([
    Object.freeze({progress:.004,lane:0}),Object.freeze({progress:.013,lane:-.42}),Object.freeze({progress:.02,lane:-.78})
  ]);
  root.TrackGeometry=Object.freeze({TRACK_PATH,FINISH_EXIT_PATH,centerPoint,maxLaneOffset,safeLaneOffset,pointAt,kartCorners,roadClearance,signedLateral,hitboxAudit,startGrid,parkingPoint,finishRoutePoint,roadMesh,runRoadQA,finishLinePoint,boostStartProgress,boostEndProgress,pitEntryProgress,pitExitProgress});
})(typeof window!=='undefined'?window:globalThis);
