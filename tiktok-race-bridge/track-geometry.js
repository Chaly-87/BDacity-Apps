(function(root){
  'use strict';
  const TRACK_PATH=Object.freeze({
    cx:360,cy:369,rx:264,ry:222,roadHalfWidth:52,kartHalfWidth:11,kartHalfLength:17,safetyMargin:5,
    sampleCount:256,startProgress:.25
  });
  const FINISH_EXIT_PATH=Object.freeze([
    Object.freeze({progress:.25,lane:0}),Object.freeze({progress:.265,lane:-18}),Object.freeze({progress:.285,lane:-29})
  ]);
  const clamp=(v,a,b)=>Math.min(Math.max(v,a),b);
  const wrap=v=>((Number(v)||0)%1+1)%1;
  function rawPoint(progress){
    const p=wrap(progress+TRACK_PATH.startProgress),a=p*Math.PI*2;
    return {x:TRACK_PATH.cx+Math.cos(a)*TRACK_PATH.rx,y:TRACK_PATH.cy+Math.sin(a)*TRACK_PATH.ry,a};
  }
  function centerPoint(progress){
    const p=rawPoint(progress),tx=-TRACK_PATH.rx*Math.sin(p.a),ty=TRACK_PATH.ry*Math.cos(p.a);
    const len=Math.hypot(tx,ty)||1,nx=-ty/len,ny=tx/len;
    const denom=Math.pow(TRACK_PATH.rx*TRACK_PATH.rx*Math.sin(p.a)**2+TRACK_PATH.ry*TRACK_PATH.ry*Math.cos(p.a)**2,1.5)||1;
    const curvature=TRACK_PATH.rx*TRACK_PATH.ry/denom;
    return {x:p.x,y:p.y,tx:tx/len,ty:ty/len,nx,ny,angle:Math.atan2(ty,tx),curvature};
  }
  function maxLaneOffset(progress){
    const base=TRACK_PATH.roadHalfWidth-TRACK_PATH.kartHalfWidth-TRACK_PATH.safetyMargin;
    const c=centerPoint(progress).curvature;
    const tightness=clamp((c-.0034)/.0019,0,1);
    return base*(1-tightness*.22);
  }
  function safeLaneOffset(lane,progress){
    const spread=maxLaneOffset(progress),slot=clamp(Number(lane)||0,-1,1);
    return slot*spread;
  }
  function pointAt(progress,lane=0){
    const c=centerPoint(progress),offset=safeLaneOffset(lane,progress);
    return {...c,x:c.x+c.nx*offset,y:c.y+c.ny*offset,laneOffset:offset,maxLaneOffset:maxLaneOffset(progress)};
  }
  function kartCorners(progress,lane=0){
    const p=pointAt(progress,lane),hw=TRACK_PATH.kartHalfWidth,hl=TRACK_PATH.kartHalfLength;
    return [[hl,hw],[hl,-hw],[-hl,hw],[-hl,-hw]].map(([f,s])=>({x:p.x+p.tx*f+p.nx*s,y:p.y+p.ty*f+p.ny*s}));
  }
  function roadClearance(progress,lane=0){
    const p=pointAt(progress,lane);
    const footprint=Math.hypot(TRACK_PATH.kartHalfWidth,TRACK_PATH.kartHalfLength*.28);
    return TRACK_PATH.roadHalfWidth-Math.abs(p.laneOffset)-footprint-TRACK_PATH.safetyMargin;
  }
  function startGrid(count=16){
    return Array.from({length:Math.min(16,Math.max(0,count))},(_,i)=>{
      const row=Math.floor(i/2),side=i%2===0?-.42:.42,progress=-row*.019;
      return {...pointAt(progress,side),slot:i+1,progress:wrap(progress),lane:side};
    });
  }
  function parkingPoint(position){
    const index=Math.max(0,(Number(position)||1)-1),row=Math.floor(index/4),col=index%4;
    const progress=.276+row*.012,lane=-.78+col*.52;
    return {...pointAt(progress,lane),position:index+1};
  }
  function roadMesh(samples=TRACK_PATH.sampleCount){
    const center=[],left=[],right=[];
    for(let i=0;i<=samples;i+=1){
      const p=centerPoint(i/samples);
      center.push({x:p.x,y:p.y});
      left.push({x:p.x+p.nx*TRACK_PATH.roadHalfWidth,y:p.y+p.ny*TRACK_PATH.roadHalfWidth});
      right.push({x:p.x-p.nx*TRACK_PATH.roadHalfWidth,y:p.y-p.ny*TRACK_PATH.roadHalfWidth});
    }
    return {center,left,right};
  }
  function runRoadQA({racers=16,laps=5,samplesPerLap=360}={}){
    const report={roadSamples:0,roadViolations:0,grassHits:0,infieldHits:0,boxHits:0,minRoadClearance:Infinity};
    for(let lap=0;lap<laps;lap+=1){
      for(let step=0;step<samplesPerLap;step+=1){
        for(let racer=0;racer<racers;racer+=1){
          const progress=(lap+(step+racer*.37)/samplesPerLap),lane=((racer%3)-1)*.78;
          const clearance=roadClearance(progress,lane);
          report.roadSamples+=1;report.minRoadClearance=Math.min(report.minRoadClearance,clearance);
          if(clearance<0){report.roadViolations+=1;report.grassHits+=1;}
          const corners=kartCorners(progress,lane);
          if(corners.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y))){report.roadViolations+=1;report.boxHits+=1;}
        }
      }
    }
    report.minRoadClearance=Number(report.minRoadClearance.toFixed(3));
    return report;
  }
  root.TrackGeometry=Object.freeze({TRACK_PATH,FINISH_EXIT_PATH,centerPoint,maxLaneOffset,safeLaneOffset,pointAt,kartCorners,roadClearance,startGrid,parkingPoint,roadMesh,runRoadQA});
})(typeof window!=='undefined'?window:globalThis);
