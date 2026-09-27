(function(root){
  'use strict';
  // ---------------------------------------------------------------------------
  // NEON RUSH CITY — CIRCUITO URBANO (uma única malha fechada)
  // Catmull-Rom fechado sobre pontos de controlo desenhados para ocupar toda a
  // largura do bloco central (canvas 720x720): reta de meta, sweepers, secção S,
  // hairpin, chicane e secção rápida. Substitui a elipse antiga mantendo a
  // MESMA API (TRACK_PATH, pointAt, startGrid, parkingPoint, roadMesh,
  // hitboxAudit, runRoadQA, FINISH_EXIT_PATH, centerPoint) para app.js e testes.
  // ---------------------------------------------------------------------------
  const RAW_PTS=[
    // Reta de META/partida (topo, correndo para a esquerda) + sweepers e S
    {x:525,y:96},{x:428,y:74},{x:312,y:78},{x:201,y:112},{x:143,y:184},
    // Sweeper esquerdo desce, S-entry, cotovelo, fast section, sweep direito
    {x:181,y:258},{x:255,y:287},{x:339,y:296},{x:421,y:315},{x:465,y:380},
    {x:444,y:449},{x:384,y:476},{x:326,y:492},{x:286,y:538},{x:304,y:594},
    // Secção rápida direita, cotovelo, sweep superior, hairpin, chicane, retorno
    {x:388,y:624},{x:501,y:621},{x:607,y:565},{x:634,y:487},{x:609,y:419},
    {x:641,y:347},{x:633,y:274},{x:560,y:228},{x:507,y:170},{x:509,y:127}
  ];
  const CLOSED=[...RAW_PTS,RAW_PTS[0]]; // Catmull-Rom fechado: repete o 1.º P
  const clamp=(v,a,b)=>Math.min(Math.max(v,a),b);

  function sampleSpline(pts,t){
    const n=pts.length-1;
    const i=Math.min(n-1,Math.max(0,Math.floor(t*n)));
    const u=t*n-i;
    const p0=pts[Math.max(0,i-1)],p1=pts[i],p2=pts[i+1],p3=pts[Math.min(n,i+2)];
    const u2=u*u,u3=u2*u;
    const h=(a,b,c,d)=>0.5*((2*a)+(-a+c)*u+(2*a-5*b+4*c-d)*u2+(-a+3*b-3*c+d)*u3);
    return {x:h(p0.x,p1.x,p2.x,p3.x),y:h(p0.y,p1.y,p2.y,p3.y)};
  }
  // Resample uniforme (por comprimento de arco) para progresso temporal justo:
  // o passeio do kart é estável, sem acelerar nas curvas apertadas.
  function resample(pts,N){
    const n=pts.length-1,dense=[],steps=14;
    for(let i=0;i<n;i+=1){
      for(let s=0;s<steps;s+=1)dense.push(sampleSpline(pts,(i+s/steps)/n));
    }
    const lens=[0];
    for(let i=1;i<dense.length;i+=1){
      lens.push(lens[i-1]+Math.hypot(dense[i].x-dense[i-1].x,dense[i].y-dense[i-1].y));
    }
    const total=lens[lens.length-1];
    const out=[];
    let j=0;
    for(let k=0;k<N;k+=1){
      const target=total*k/N;
      while(j<lens.length-1&&lens[j+1]<target)j+=1;
      const seg=lens[j+1]-lens[j]||1e-6,f=(target-lens[j])/seg;
      const a=dense[j],b=dense[j+1];
      out.push({x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f});
    }
    return out;
  }
  const PTS=resample(CLOSED,720);
  const N=PTS.length;
  function loopIdx(i){return ((i%N)+N)%N;}

  // Derivadas cartesianas (diferenças centrais) — robustas em qualquer sítio.
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
    cx:360,cy:369,rx:264,ry:222,roadHalfWidth:52,kartHalfWidth:10,kartHalfLength:15,safetyMargin:5,
    sampleCount:256,startProgress:.25,
    layout:'STREET_CIRCUIT_V1'
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
    // no aperto (k≈.014+): ~24px; em reto: 37px — sempre > kart (10px) + margem
  }
  function pointAt(progress,lane=0){
    const pr=((Number(progress)||0)%1+1)%1;
    const idx=Math.min(N-1,Math.max(0,Math.floor(pr*N)));
    const c=loopPoint(idx),spread=maxLaneOffset(idx);
    const slot=clamp(Number(lane)||0,-1,1);
    return {...c,x:c.x+c.ty*slot*spread,y:c.y-c.tx*slot*spread,laneOffset:slot*spread,maxLaneOffset:spread};
  }
  function loopPoint(idx){
    const p=PTS[loopIdx(idx)],d=deriv(idx);
    return {x:p.x,y:p.y,tx:d.tx,ty:d.ty,angle:d.angle};
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
    const index=Math.max(0,(Number(position)||1)-1),row=Math.floor(index/4),col=index%4;
    const progress=.02+row*.014,lane=-.78+col*.52;
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
  // Marcações especiais (frações de progresso) — usadas pelo renderizador.
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
    // Secção de pit: centro e limites das duas faixas
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
  root.TrackGeometry=Object.freeze({TRACK_PATH,FINISH_EXIT_PATH,centerPoint,maxLaneOffset,safeLaneOffset,pointAt,kartCorners,roadClearance,signedLateral,hitboxAudit,startGrid,parkingPoint,roadMesh,runRoadQA,finishLinePoint,boostStartProgress,boostEndProgress,pitEntryProgress,pitExitProgress});
})(typeof window!=='undefined'?window:globalThis);
