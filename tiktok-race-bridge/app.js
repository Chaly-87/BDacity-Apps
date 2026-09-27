(function(){
  'use strict';
  const RL=window.RaceLogic,TG=window.TrackGeometry;
  if(!RL||!TG)throw new Error('Race modules unavailable');
  const TOTAL_LAPS=RL.TOTAL_LAPS,RACE_TIME=360,MAX_RACERS=16;
  const TEAM_DEFS=[
    {id:0,key:'red',name:'EQUIPA RED',color:'#ff315f',rgb:[255,49,95]},
    {id:1,key:'blue',name:'EQUIPA BLUE',color:'#24a4ff',rgb:[36,164,255]},
    {id:2,key:'green',name:'EQUIPA GREEN',color:'#30ef82',rgb:[48,239,130]},
    {id:3,key:'purple',name:'EQUIPA PURPLE',color:'#b64dff',rgb:[182,77,255]}
  ];
  const ICONS={rose:'✦',bomb:'◆',emp:'ϟ',galaxy:'◉'};
  const EFFECT_LABELS={turbo:'TURBO',slow:'OBSTÁCULO',boost:'BOOST',hazard:'OBSTÁCULO',shock:'SHOCK',galaxy:'GALACTIC CHAOS'};
  const BAR_ITEMS=[
    {id:'rose',icon:'🌹',title:'ROSA',tagline:'VELOCIDADE',color:'#ff4e98'},
    {id:'bomb',icon:'🚀',title:'FOGUETE',tagline:'SOLTA OBSTÁCULOS',color:'#ff8b2c'},
    {id:'emp',icon:'⚡',title:'TROVÃO',tagline:'ATORDOA RIVAIS',color:'#ffe14d'},
    {id:'galaxy',icon:'🌌',title:'GALÁXIA',tagline:'EFEITO ALEATÓRIO',color:'#bd5cff'}
  ];
  const MUSIC_LEVELS={waiting:.6,race:.85,results:.3};
  const KART_SCALE=.8;
  const MUSIC_SRC='/assets/official-track.mp3';
  // LIVE DATA ONLY: sem viewers fake. O contador só aparece com número real
  // enviado pela ponte (evento roomUser/stats). Sem dados → oculto.
  function setViewerCount(n){const v=el('viewers');if(!v)return;const num=Math.max(0,Math.floor(Number(n)));if(Number.isFinite(num)&&num>0){v.hidden=false;v.textContent='◉ '+num.toLocaleString('pt-PT');}else{v.hidden=true;}}
  const canvas=document.getElementById('race-canvas'),ctx=canvas.getContext('2d',{alpha:true});
  const shell=document.getElementById('shell'),music=document.getElementById('music'),hostVideo=document.getElementById('host-video');
  const goSound=(()=>{const a=new Audio('/assets/countdown-go.mp3');a.preload='auto';a.volume=.9;return a;})();
  function playCountdownGo(){if(!state.audio)return;try{goSound.currentTime=0;setMusicLevel(Math.min(music.volume,.25));const p=goSound.play();if(p&&p.catch)p.catch(()=>{});window.setTimeout(()=>setMusicLevel(phaseLevel()),1600);}catch{}}
  const state={phase:'waiting',racers:[],queue:new Map(),likesByUser:{},giftCooldowns:{},raceStartedAt:0,firstFinishAt:null,finishCount:0,lastNow:performance.now(),remaining:RACE_TIME,mode:RL.MODES.LIVE_COMPLIANT,eventUntil:0,eventType:'',errors:[],fpsSamples:[],frameCount:0,lastFpsAt:performance.now(),fps:60,ws:null,wsRetry:null,audio:false,ttsBusy:false,lastGift:null,ttsLast:null};
  const seededNames=['@LUNA','@MIGUEL','@SOFIA','@TIAGO','@INES','@DIOGO','@MARTA','@RAFA','@BEA','@NUNO','@RITA','@LUIS','@ANA','@PEDRO','@CARLA','@HUGO'];

  window.addEventListener('error',e=>state.errors.push(String(e.message||'page error')));
  window.addEventListener('unhandledrejection',e=>state.errors.push(String(e.reason?.message||e.reason||'unhandled rejection')));

  function hexToRgba(hex,a){const n=parseInt(hex.slice(1),16);return `rgba(${n>>16},${n>>8&255},${n&255},${a})`;}
  function teamFor(value){if(typeof value==='number')return TEAM_DEFS[Math.abs(value)%4];const s=String(value||'').toLowerCase();const idx=TEAM_DEFS.findIndex(t=>s.includes(t.key));return TEAM_DEFS[idx<0?0:idx];}
  function el(id){return document.getElementById(id);}
  function makeRacer(index,name=seededNames[index%seededNames.length],teamId=index%4,identity=null){
    // identidade: userId do server quando existe; senão chave canónica do nome.
    const canon=RL.racerKey(identity&&typeof identity==='object'?identity:(identity??name));
    const r=RL.makeRacerState({userId:canon,username:name,team:TEAM_DEFS[teamId].key,currentLap:1,completedLaps:0,trackProgress:0,status:'ready'});
    r.avatar=RL.avatarDisplay(r.avatar,name);
    return Object.assign(r,{teamId,lane:((index%3)-1)*.78,baseSpeed:.026+(index%7)*.00125,boostUntil:0,shockUntil:0,displayProgress:0,finishRoute:0,gridIndex:index});
  }
  function seed(count){state.racers=Array.from({length:Math.min(MAX_RACERS,count)},(_,i)=>makeRacer(i));state.finishCount=0;state.firstFinishAt=null;state.remaining=RACE_TIME;renderHud();}
  function prepareGrid(count=state.racers.length||8){seed(count);state.phase='grid';state.raceStartedAt=0;setMusicLevel(.6);state.racers.forEach((r,i)=>{const p=TG.startGrid(count)[i];r.trackProgress=p.progress;r.lane=p.lane;r.displayProgress=p.progress;});setRaceCopy('GRELHA DE PARTIDA','16 SLOTS • GEOMETRIA DA PISTA');}
  function startRace(count=8){prepareGrid(count);window.setTimeout(()=>{if(state.phase!=='grid')return;state.phase='race';state.raceStartedAt=performance.now();setMusicLevel(MUSIC_LEVELS.race);state.racers.forEach(r=>{r.displayProgress=r.trackProgress;r.status='racing';});setRaceCopy('CORRIDA EM CURSO','CADA PILOTO TEM A SUA VOLTA');playCountdownGo();},900);}
  function setRaceCopy(title,sub){el('race-state').textContent=title;el('race-detail').textContent=sub;el('race-banner').querySelector('strong').textContent=title;el('race-subtitle').textContent=sub;el('bottom-callout').innerHTML=`${title.split(' ').slice(0,-1).join(' ')||'NEON RUSH'}<br><b>${title.split(' ').slice(-1)}</b>`;}
  function showEvent(user,gift,effect,type='gift',duration=3000,causeText,effectText){el('event-cause').textContent=causeText||`${user} ENVIOU ${gift}`;el('event-effect').textContent=effectText||`${effect} ATIVADO!`;el('event-avatar').textContent=String(user).replace(/^@/,'').charAt(0).toUpperCase()||'?';const w=el('world-event');w.textContent=`${gift} → ${effect}`;w.classList.add('active');state.eventUntil=performance.now()+duration;state.eventType=type;shell.classList.toggle('galaxy',type==='galaxy');}
  function clearEvent(now){if(state.eventUntil&&now>=state.eventUntil){state.eventUntil=0;el('world-event').classList.remove('active');shell.classList.remove('galaxy');}}
  function buildGiftBar(){
    el('gift-actions').innerHTML=BAR_ITEMS.map(item=>{
      const rule=RL.GIFT_RULES[item.id];
      return `<div class="gift-card" data-gift="${item.id}" style="--gift:${item.color}"><span class="gift-icon">${item.icon}</span><span class="gift-body"><strong>${item.title}</strong><b>= ${EFFECT_LABELS[rule.effect]}</b><small>${item.tagline}</small><em class="gift-who"></em></span></div>`;
    }).join('');
  }
  const giftTimers=new Map();
  let stingCtx=null;
  const STING_KIND={turbo:'up',boost:'up',galaxy:'swirl',hazard:'down',slow:'down',shock:'zap'};
  function playGiftSting(id,rule){
    if(!state.audio)return;
    const kind=STING_KIND[rule.effect]||'up';
    try{
      if(!stingCtx)stingCtx=new (window.AudioContext||window.webkitAudioContext)();
      if(stingCtx.state==='suspended')stingCtx.resume().catch(()=>{});
      const ctxA=stingCtx,t0=ctxA.currentTime+0.02,master=ctxA.createGain();
      master.gain.value=0.16;master.connect(ctxA.destination);
      const beep=(freq,at,dur,type='sine',gain=.9)=>{const o=ctxA.createOscillator(),g=ctxA.createGain();o.type=type;o.frequency.setValueAtTime(freq,at);g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(gain,at+0.012);g.gain.exponentialRampToValueAtTime(0.0008,at+dur);o.connect(g);g.connect(master);o.start(at);o.stop(at+dur+.03);return o;};
      const sweep=(from,to,at,dur,type='sawtooth')=>{const o=ctxA.createOscillator(),g=ctxA.createGain();o.type=type;o.frequency.setValueAtTime(from,at);o.frequency.exponentialRampToValueAtTime(Math.max(40,to),at+dur);g.gain.setValueAtTime(0.001,at);g.gain.exponentialRampToValueAtTime(.8,at+0.02);g.gain.exponentialRampToValueAtTime(0.0008,at+dur);o.connect(g);g.connect(master);o.start(at);o.stop(at+dur+.03);};
      if(kind==='up'){beep(660,t0,.16,'square');beep(880,t0+.09,.22,'square');beep(1320,t0+.18,.3,'triangle');}
      else if(kind==='down'){sweep(420,90,t0,.42,'sawtooth');beep(160,t0+.3,.3,'square',.5);}
      else if(kind==='zap'){for(let i=0;i<5;i++)beep(1400-i*180,t0+i*.05,.09,'square',.7);sweep(900,120,t0+.26,.4,'sawtooth');}
      else{for(let i=0;i<6;i++){const f=[523,659,784,1046,1318,1568][i];sweep(f,f*.5,t0+i*.075,.42,'triangle');}}
    }catch{ /* áudio sintetizado é opcional: nunca bloqueia o gift */ }
  }
  function highlightGift(id,user,consequence,duration=2600){
    const card=document.querySelector(`.gift-card[data-gift="${id}"]`);
    if(!card)return;
    document.querySelectorAll('.gift-card.active').forEach(c=>{c.classList.remove('active');const w=c.querySelector('.gift-who');if(w)w.textContent='';});
    const who=card.querySelector('.gift-who');
    card.classList.add('active');
    if(who)who.textContent=`${user} → ${consequence}`;
    clearTimeout(giftTimers.get(id));
    giftTimers.set(id,window.setTimeout(()=>{card.classList.remove('active');if(who)who.textContent='';},duration));
  }
  function giftBarState(){
    return [...document.querySelectorAll('.gift-card')].map(c=>({
      id:c.dataset.gift,
      title:(c.querySelector('strong')?.textContent||'').trim(),
      effect:(c.querySelector('b')?.textContent||'').trim(),
      source:(c.querySelector('small')?.textContent||'').trim(),
      active:c.classList.contains('active'),
      who:(c.querySelector('.gift-who')?.textContent||'').trim(),
      visible:!!(c.offsetWidth||c.offsetHeight)
    }));
  }
  function buildTeams(){el('team-dock').innerHTML=TEAM_DEFS.map(t=>`<div class="team-card" style="--team:${t.color}"><img class="team-kart" src="/assets/kart-team-${t.id}.png" alt=""><strong>${t.name}</strong><small id="team-count-${t.id}">0 PILOTOS</small><span class="energy"><i id="team-energy-${t.id}" style="--energy:12%"></i></span><span class="team-flame" aria-hidden="true">🔥</span></div>`).join('');}
  function renderHud(){
    const ranked=RL.rankRacers(state.racers);const leader=ranked[0];
    el('leader-lap').textContent=String(Math.min(TOTAL_LAPS,(leader?.completedLaps||0)+1)).padStart(2,'0')+'/'+TOTAL_LAPS;
    const secs=Math.max(0,Math.ceil(state.remaining));el('race-time').textContent=String(Math.floor(secs/60)).padStart(2,'0')+':'+String(secs%60).padStart(2,'0');
    el('top3').innerHTML=ranked.slice(0,3).map((r,i)=>`<li style="--team:${TEAM_DEFS[r.teamId].color}">P${i+1} · ${r.username.slice(0,12)}</li>`).join('');
    el('top10').innerHTML=ranked.slice(0,10).map((r,i)=>`<li style="--team:${TEAM_DEFS[r.teamId].color}"><i></i><span>${i+1}. ${r.username.slice(0,10)}</span><em>${r.finished?'FIN':`${Math.min(10,r.completedLaps+1)}/10`}</em></li>`).join('');
    TEAM_DEFS.forEach(t=>{const count=state.racers.filter(r=>r.teamId===t.id&&!r.finished).length;el(`team-count-${t.id}`).textContent=`${count} PILOTO${count===1?'':'S'}`;el(`team-energy-${t.id}`).style.setProperty('--energy',`${Math.min(100,12+count*14)}%`);});
  }
  function finishRacer(r,now){if(r.finished)return;state.finishCount+=1;RL.finishRacer(r,state.finishCount,now-state.raceStartedAt);r.finishRoute=0;if(state.firstFinishAt==null)state.firstFinishAt=now;showEvent(r.username,'META',`P${r.finishPosition}`,'finish',2200,`${r.username} CHEGOU À META`,`P${r.finishPosition} · META`);}
  function tickRace(dt,now){
    if(state.phase!=='race')return;
    state.remaining-=dt;const active=state.racers.filter(r=>!r.finished);
    active.forEach((r,i)=>{const mult=now<r.boostUntil?1.55:now<r.shockUntil?0.45:1;const before=r.trackProgress;r.trackProgress+=r.baseSpeed*mult*dt;if(r.trackProgress>=1){r.trackProgress-=1;r.completedLaps+=1;r.currentLap=Math.min(TOTAL_LAPS,r.completedLaps+1);if(r.completedLaps>=TOTAL_LAPS)finishRacer(r,now);}r.totalProgress=r.completedLaps*RL.TRACK_LENGTH+r.trackProgress*RL.TRACK_LENGTH;r.displayProgress=r.trackProgress;if(before>.85&&r.trackProgress<.15&&r.completedLaps===TOTAL_LAPS-1){shell.classList.add('sprint');setMusicLevel(MUSIC_LEVELS.race);setRaceCopy('FINAL SPRINT','O LÍDER ENTROU NA ÚLTIMA VOLTA');}});
    state.racers.filter(r=>r.finished&&r.finishRoute<1).forEach(r=>{r.finishRoute=Math.min(1,r.finishRoute+dt*.52);});
    if(RL.raceShouldEnd(state.racers,state.firstFinishAt,now)||state.remaining<=0)showResults();
  }
  function tracePath(pts){ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));}
  function drawKerbs(pts){
    ctx.lineWidth=7;
    for(let i=0;i<pts.length-1;i+=1){ctx.strokeStyle=(i%2)?'#ff2f5e':'#f2f7ff';ctx.beginPath();ctx.moveTo(pts[i].x,pts[i].y);ctx.lineTo(pts[i+1].x,pts[i+1].y);ctx.stroke();}
    ctx.lineWidth=1;
  }
  function drawChevrons(){
    ctx.save();ctx.lineWidth=5;ctx.lineCap='round';ctx.lineJoin='round';
    ctx.strokeStyle='rgba(64,231,255,.55)';
    const s=TG.boostStartProgress(),e=TG.boostEndProgress(),steps=6;
    for(let i=0;i<steps;i+=1){
      for(const lane of [-.45,.45]){
        const p=TG.pointAt(s+(e-s)*(i/steps),lane);
        ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);
        for(const off of [-11,1]){ctx.beginPath();ctx.moveTo(off-7,-9);ctx.lineTo(off+3,0);ctx.lineTo(off-7,9);ctx.stroke();}
        ctx.restore();
      }
    }
    ctx.restore();
  }
  function offsetOutward(edge,center,out){
    return edge.map((p,i)=>{const c=center[i%center.length];const dx=p.x-c.x,dy=p.y-c.y,l=Math.hypot(dx,dy)||1;return {x:p.x+dx/l*out,y:p.y+dy/l*out};});
  }
  function drawBarrier(pts){
    ctx.save();ctx.shadowColor='rgba(32,231,255,.85)';ctx.shadowBlur=10;
    ctx.strokeStyle='rgba(96,240,255,.8)';ctx.lineWidth=3;
    ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.stroke();
    ctx.restore();
  }
  function drawPitBoxes(){
    ctx.save();ctx.strokeStyle='rgba(255,216,77,.85)';ctx.lineWidth=1.6;ctx.setLineDash([5,4]);
    ctx.font='700 9px Arial';ctx.textAlign='center';
    for(let pos=1;pos<=7;pos+=1){
      const p=TG.parkingPoint(pos);
      if(!p)continue;
      ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);
      ctx.strokeRect(-20,-10,40,20);
      ctx.fillStyle='rgba(255,216,77,.9)';ctx.fillText('P'+pos,0,3);
      ctx.restore();
    }
    ctx.restore();
  }
  function drawTrackGeometry(now){
    const mesh=TG.roadMesh(240),left=mesh.left,right=mesh.right,HW=TG.TRACK_PATH.roadHalfWidth;
    ctx.save();ctx.lineJoin='round';ctx.lineCap='round';
    // FUNDO: transparente → o cenário da cidade neon (neon-world.jpg) vê-se
    // através do canvas. Asfalto só onde a estrada existe.
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.beginPath();
    left.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();
    right.slice().reverse().forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();
    const asphalt=ctx.createLinearGradient(0,0,0,canvas.height);
    asphalt.addColorStop(0,'rgba(44,52,80,.96)');asphalt.addColorStop(1,'rgba(35,42,68,.96)');
    ctx.shadowColor='rgba(10,20,60,.95)';ctx.shadowBlur=22;
    ctx.fillStyle=asphalt;ctx.fill('evenodd');
    ctx.shadowBlur=0;
    drawKerbs(left);drawKerbs(right);
    drawBarrier(offsetOutward(left,mesh.center,7));
    drawBarrier(offsetOutward(right,mesh.center,7));
    ctx.setLineDash([14,16]);ctx.strokeStyle='rgba(255,255,255,.4)';ctx.lineWidth=3;tracePath(mesh.center);ctx.stroke();ctx.setLineDash([]);
    drawChevrons();
    drawPitBoxes();
    const f=TG.pointAt(0,0);ctx.save();ctx.translate(f.x,f.y);ctx.rotate(f.angle);
    for(let x=-10;x<10;x+=5)for(let y=-HW;y<HW;y+=13){ctx.fillStyle=((x/5+y/13)&1)?'#fff':'#0b0e17';ctx.fillRect(x,y,5,13);}
    ctx.restore();
    ctx.restore();
  }
  // Drones holográficos a orbitar o INFIELD (raio 118-152, bem dentro da
  // curva interna ~190) — atmosfera viva sem tocar na pista.
  function drawDrones(now){
    const specs=[{r:120,sp:.00042,ph:0,c:'#40e8ff',s:2.6},{r:138,sp:-.00031,ph:2.1,c:'#ff5ec4',s:2.2},{r:152,sp:.00024,ph:4.2,c:'#ffd84d',s:2.0}];
    ctx.save();
    for(const d of specs){
      const a=now*d.sp+d.ph,x=TG.TRACK_PATH.cx+Math.cos(a)*d.r,y=TG.TRACK_PATH.cy+Math.sin(a)*d.r*.86;
      ctx.shadowColor=d.c;ctx.shadowBlur=12;
      ctx.fillStyle=d.c;ctx.beginPath();ctx.arc(x,y,d.s,0,Math.PI*2);ctx.fill();
      ctx.globalAlpha=.28;ctx.beginPath();ctx.arc(x,y,d.s+2.6,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
    }
    ctx.restore();
  }
  function drawGrid(){
    const slots=TG.startGrid(state.racers.length||16),live=state.phase==='grid';
    ctx.save();ctx.font='700 10px Arial';ctx.textAlign='center';ctx.globalAlpha=live?1:.34;
    slots.forEach(s=>{
      ctx.save();ctx.translate(s.x,s.y);ctx.rotate(s.angle);
      ctx.strokeStyle=live?'rgba(255,255,255,.9)':'rgba(255,255,255,.55)';ctx.lineWidth=2;ctx.strokeRect(-16,-11,32,22);
      if(live){ctx.fillStyle='#fff';ctx.fillText(String(s.slot),0,4);}
      ctx.restore();
    });
    ctx.restore();ctx.globalAlpha=1;
  }
  function finishRoutePoint(r){
    const path=TG.FINISH_EXIT_PATH,t=Number(r.finishRoute)||0;
    if(t>=1)return TG.parkingPoint(r.finishPosition||1);
    const u=Math.min(1,t/.55)*(path.length-1),i=Math.floor(u),m=u-i,a=path[i],b=path[Math.min(path.length-1,i+1)];
    const ap=TG.pointAt(a.progress,a.lane),bp=TG.pointAt(b.progress,b.lane);
    const base={x:ap.x+(bp.x-ap.x)*m,y:ap.y+(bp.y-ap.y)*m,angle:ap.angle+(bp.angle-ap.angle)*m};
    if(t<.55)return base;
    const k=(t-.55)/.45,park=TG.parkingPoint(r.finishPosition||1);
    return {x:base.x+(park.x-base.x)*k,y:base.y+(park.y-base.y)*k,angle:base.angle+(park.angle-base.angle)*k};
  }
  function drawKart(r,rank,now){
    let p;if(r.finished)p=finishRoutePoint(r);else if(state.phase==='grid')p=TG.startGrid(state.racers.length||16)[r.gridIndex];else p=TG.pointAt(r.displayProgress,r.lane);
    if(!p)return;
    const t=TEAM_DEFS[r.teamId],boost=now<r.boostUntil,shocked=now<r.shockUntil;
    const speed=Math.hypot(p.tx,p.ty)||1;
    ctx.save();
    // rasto neon (so em corrida): fita da posição anterior até à atual
    if(state.phase==='race'&&!r.finished){
      const prev=TG.pointAt(((r.displayProgress-0.012)%1+1)%1,r.lane);
      ctx.strokeStyle=hexToRgba(t.color,.4);ctx.lineWidth=7;ctx.lineCap='round';
      ctx.beginPath();ctx.moveTo(prev.x,prev.y);ctx.lineTo(p.x,p.y);ctx.stroke();
    }
    ctx.translate(p.x,p.y);ctx.rotate(p.angle);ctx.scale(KART_SCALE,KART_SCALE);
    // brilho/aura da equipa
    ctx.shadowColor=t.color;ctx.shadowBlur=boost?20:10;
    ctx.fillStyle=hexToRgba(t.color,.3);ctx.beginPath();ctx.ellipse(0,0,24,12,0,0,Math.PI*2);ctx.fill();
    ctx.shadowBlur=0;
    if(boost){ctx.fillStyle='#7effff';ctx.beginPath();ctx.moveTo(-18,-5);ctx.lineTo(-38,0);ctx.lineTo(-18,5);ctx.fill();}
    if(shocked){ctx.strokeStyle='rgba(255,240,120,.9)';ctx.lineWidth=1.4;ctx.beginPath();ctx.arc(0,0,20,0,Math.PI*2);ctx.stroke();}
    // rodas F1 (pretas com hub da cor da equipa)
    ctx.fillStyle='#0a0c14';
    [[-11,-13,9,5.5],[-11,7.5,9,5.5],[11,-13,8.5,5.5],[11,7.5,8.5,5.5]].forEach(([x,y,w,h])=>{ctx.fillRect(x,y,w,h);});
    ctx.fillStyle=t.color;
    [[-11,-13,9,5.5],[-11,7.5,9,5.5],[11,-13,8.5,5.5],[11,7.5,8.5,5.5]].forEach(([x,y,w,h])=>{ctx.fillRect(x+2.5,y+1.4,w-5,h-2.8);});
    // asa dianteira
    ctx.fillStyle=t.color;ctx.fillRect(14,-11,4,22);
    ctx.fillStyle='rgba(255,255,255,.85)';ctx.fillRect(17.4,-11,1.4,22);
    // corpo em seta
    ctx.beginPath();ctx.moveTo(13,-3);ctx.lineTo(4,-6.5);ctx.lineTo(-10,-5);ctx.lineTo(-15,0);ctx.lineTo(-10,5);ctx.lineTo(4,6.5);ctx.lineTo(13,3);ctx.closePath();ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,.92)';ctx.lineWidth=1.5;ctx.stroke();
    // cockpit + halo
    ctx.fillStyle='#111b2b';ctx.beginPath();ctx.arc(-1,0,4.6,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#dff9ff';ctx.lineWidth=1.2;ctx.stroke();
    // asa traseira
    ctx.fillStyle=t.color;ctx.fillRect(-18,-9,4,18);
    ctx.fillStyle='rgba(255,255,255,.85)';ctx.fillRect(-18,-9,1.4,18);
    ctx.restore();
    // badge de número/posição (como na mestre)
    ctx.save();ctx.translate(p.x,p.y);
    ctx.fillStyle='rgba(4,8,22,.92)';ctx.strokeStyle=t.color;ctx.lineWidth=1.6;
    ctx.beginPath();ctx.roundRect(-11,-30,22,13,3);ctx.fill();ctx.stroke();
    ctx.fillStyle='#fff';ctx.font='900 10px Arial';ctx.textAlign='center';ctx.fillText(String(rank),0,-20.5);
    ctx.restore();
  }
  function draw(now){ctx.clearRect(0,0,canvas.width,canvas.height);drawTrackGeometry(now);drawDrones(now);drawGrid();const ranked=RL.rankRacers(state.racers);ranked.forEach((r,i)=>drawKart(r,i+1,now));}
  function frame(now){const dt=Math.min(.05,(now-state.lastNow)/1000);state.lastNow=now;tickRace(dt,now);clearEvent(now);draw(now);state.frameCount+=1;if(now-state.lastFpsAt>=1000){state.fps=state.frameCount*1000/(now-state.lastFpsAt);state.fpsSamples.push(state.fps);if(state.fpsSamples.length>30)state.fpsSamples.shift();state.frameCount=0;state.lastFpsAt=now;renderHud();}requestAnimationFrame(frame);}
  function gift(id,user='@HUGO',source='demo',identity=null){
    const rule=RL.GIFT_RULES[id];if(!rule)return null;
    const ranked=RL.rankRacers(state.racers);const sender=RL.findRacerForUser(state.racers,identity||user)||ranked[ranked.length-1]||state.racers[0];
    const now=performance.now();
    const applied=RL.applyGiftEffect({mode:source==='demo'?RL.MODES.FULL_INTERACTION_DEMO:state.mode,gift:rule,source:'gift',target:sender?.userId,now,cooldownMap:state.giftCooldowns});
    const effectLabel=applied.blocked?'EFEITO VISUAL':EFFECT_LABELS[rule.effect];
    state.lastGift={id,user,source,mode:source==='demo'?RL.MODES.FULL_INTERACTION_DEMO:state.mode,blocked:!!applied.blocked,effected:!!applied.blocked?null:rule.effect,label:effectLabel,at:now};
    const galaxyEvent=!applied.blocked&&id==='galaxy';
    showEvent(user,rule.name,effectLabel,galaxyEvent?'galaxy':'gift',rule.duration,`${user} ENVIOU ${rule.name}`,`${effectLabel} ${applied.blocked?'EM ESPERA':'ATIVADO'}!`);
    highlightGift(id,`@${String(user).replace(/^@+/,'')}`,applied.blocked?'EM ESPERA (COOLDOWN)':effectLabel);
    playGiftSting(id,rule);
    if(applied.blocked||!sender)return applied;
    if(rule.effect==='turbo'||rule.effect==='boost'||rule.effect==='galaxy')sender.boostUntil=now+rule.duration;
    if(rule.effect==='shock'||rule.effect==='hazard'||rule.effect==='slow'){ranked.filter(r=>r!==sender&&!r.finished).slice(0,5).forEach(r=>r.shockUntil=now+rule.duration);}
    if(rule.effect==='galaxy')ranked.filter(r=>r!==sender&&!r.finished).forEach(r=>r.shockUntil=now+rule.duration);
    return applied;
  }    function onLike(user,count){const display=typeof user==='string'?user:String(user?.username||user?.uniqueId||'@viewer'),id=RL.racerKey(user),previous=Number(state.likesByUser[id]||0),total=RL.recordLike({likesByUser:state.likesByUser,userId:id,amount:count}),milestones=RL.crossedLikeMilestones(previous,count,1000);if(milestones.includes(1000)){const outcome=RL.admitRacer({racers:state.racers,queue:state.queue,user,team:1,maxRacers:MAX_RACERS,makeRacer});if(outcome.admitted){showEvent(display,'1000 LIKES',outcome.queued?'PILOTO NA FILA':'NOVO PILOTO','likes');}}else if(milestones.length){const racer=RL.findRacerForUser(state.racers,user);if(racer)racer.boostUntil=performance.now()+1800;showEvent(display,`${total} LIKES`,'BOOST','likes');}}
  function showResults(){if(state.phase==='results')return;state.phase='results';shell.classList.remove('sprint','galaxy');setMusicLevel(MUSIC_LEVELS.results);const ranked=RL.rankRacers(state.racers);const box=el('results');box.hidden=false;box.innerHTML=`<h2>RESULTADOS</h2><div class="podium">${ranked.slice(0,3).map((r,i)=>`<div style="--team:${TEAM_DEFS[r.teamId].color}">P${i+1}<br>${r.username}<br><small>${TEAM_DEFS[r.teamId].key.toUpperCase()}</small></div>`).join('')}</div><p>PRÓXIMA CORRIDA EM BREVE</p>`;setRaceCopy('RESULTADOS FINAIS','TOP 10 CONFIRMADO');}
  function resetFromResults(){el('results').hidden=true;shell.classList.remove('sprint','galaxy');if(DEMO_MODE){startRace(8);return;}state.racers=[];state.queue.clear();state.finishCount=0;state.firstFinishAt=null;state.remaining=RACE_TIME;state.phase='waiting';setMusicLevel(MUSIC_LEVELS.waiting);setWaitingState();}
  function finishLeader(){const r=RL.rankRacers(state.racers).find(x=>!x.finished);if(!r)return;if(state.phase!=='race'){state.phase='race';state.raceStartedAt=performance.now();}r.completedLaps=TOTAL_LAPS-1;r.trackProgress=.995;r.totalProgress=(TOTAL_LAPS-1)*RL.TRACK_LENGTH+995;r.baseSpeed=.2;}
  function differentLaps(){state.phase='race';state.raceStartedAt=performance.now();state.racers.forEach((r,i)=>{r.completedLaps=i%9;r.currentLap=r.completedLaps+1;r.trackProgress=(i*.137)%1;r.totalProgress=r.completedLaps*RL.TRACK_LENGTH+r.trackProgress*RL.TRACK_LENGTH;r.displayProgress=r.trackProgress;});}
  // PRODUÇÃO: espera ativa sem karts falsos. A corrida arranca só com pilotos reais.
  function setWaitingState(){setRaceCopy('A AGUARDAR PILOTOS','COMENTA 1 / 2 / 3 / 4 PARA ENTRAR');}
  function beginRealRace(){
    if(!state.racers.length||state.phase!=='waiting')return;
    state.phase='grid';state.raceStartedAt=0;setMusicLevel(.6);
    const slots=TG.startGrid(state.racers.length);
    state.racers.forEach((r,i)=>{const p=slots[i%slots.length];r.trackProgress=p.progress;r.lane=p.lane;r.displayProgress=p.progress;r.gridIndex=i;r.status='ready';});
    setRaceCopy('GRELHA DE PARTIDA',`${state.racers.length} PILOTO${state.racers.length===1?'':'S'} REAIS`);
    window.setTimeout(()=>{if(state.phase!=='grid')return;state.phase='race';state.raceStartedAt=performance.now();setMusicLevel(MUSIC_LEVELS.race);state.racers.forEach(r=>{r.displayProgress=r.trackProgress;r.status='racing';});setRaceCopy('CORRIDA EM CURSO','CADA PILOTO TEM A SUA VOLTA');playCountdownGo();},900);
  }
  function maybeStartRealRace(){if(!DEMO_MODE&&state.phase==='waiting'&&state.racers.length>=2)beginRealRace();}
  function browserPtPtWelcome(name){return new Promise(resolve=>{const voices=window.speechSynthesis?.getVoices?.()||[],voice=voices.find(v=>String(v.lang).toLowerCase().startsWith('pt-pt'));if(!voice){resolve(false);return;}const utter=new SpeechSynthesisUtterance(`Bem-vindo, ${String(name).replace(/^@/,'')}.`);utter.lang='pt-PT';utter.voice=voice;utter.onend=()=>resolve(true);utter.onerror=()=>resolve(false);window.speechSynthesis.speak(utter);});}
  async function speakWelcome(name){if(!state.audio||state.ttsBusy)return;state.ttsBusy=true;let spoken=false;state.ttsLast={source:'silence',lang:null};setMusicLevel(.22);try{const res=await fetch(`/tts/welcome?name=${encodeURIComponent(String(name).replace(/^@/,''))}`);if(res.ok){const blob=await res.blob(),url=URL.createObjectURL(blob),audio=new Audio(url);await audio.play();await new Promise(resolve=>{audio.onended=resolve;audio.onerror=resolve;});URL.revokeObjectURL(url);spoken=true;state.ttsLast={source:'server',lang:res.headers.get('X-TTS-Language')||'pt-PT'};}if(!spoken){const ok=await browserPtPtWelcome(name);state.ttsLast=ok?{source:'browser',lang:'pt-PT'}:{source:'silence',lang:null};}}catch{const ok=await browserPtPtWelcome(name);state.ttsLast=ok?{source:'browser',lang:'pt-PT'}:{source:'silence',lang:null};}finally{setMusicLevel(phaseLevel());state.ttsBusy=false;}}
  function onLiveEvent(ev){const type=String(ev?.type||'');const user=String(ev?.username||'@VIEWER').slice(0,24);if(type==='comment'){const map={1:0,red:0,2:1,blue:1,3:2,green:2,4:3,purple:3};const key=String(ev.comment||'').trim().toLowerCase();if(Object.hasOwn(map,key)){const outcome=RL.admitRacer({racers:state.racers,queue:state.queue,user:{userId:ev?.userId??null,uniqueId:ev?.uniqueId??null,username:user},team:map[key],maxRacers:MAX_RACERS,makeRacer});if(outcome.admitted){const joined=!outcome.queued;showEvent(user,'COMENTÁRIO',joined?'PILOTO INSCRITO':'PILOTO NA FILA','join',2600,`${user} COMENTOU ${String(ev.comment||'').toUpperCase()}`,joined?'NA CORRIDA':'NA FILA');maybeStartRealRace();}}}else if(type==='like')onLike({userId:ev?.userId??null,uniqueId:ev?.uniqueId??null,username:user},Number(ev.count)||1);else if(type==='gift'){const key=String(ev.giftName||'rose').toLowerCase();const id=Object.hasOwn(RL.GIFT_RULES,key)?key:RL.giftFor(Number(ev.totalDiamonds)||1).id;gift(id,user,'live',{userId:ev?.userId??null,uniqueId:ev?.uniqueId??null,username:user});}else if(type==='join'){showEvent(user,'ENTROU','BEM-VINDO','join',1600);void speakWelcome(user);}else if(type==='viewers'){setViewerCount(ev.count);}}
  function connectBridge(){if(location.protocol==='file:')return;const proto=location.protocol==='https:'?'wss':'ws';try{const ws=new WebSocket(`${proto}://${location.host}/ws`);state.ws=ws;ws.onopen=()=>{el('bridge-status').textContent='LIVE LIGADA';};ws.onmessage=e=>{try{onLiveEvent(JSON.parse(e.data));}catch{}};ws.onclose=()=>{el('bridge-status').textContent='MODO LOCAL';state.wsRetry=window.setTimeout(connectBridge,3500);};ws.onerror=()=>{};}catch{el('bridge-status').textContent='MODO LOCAL';}}
  function phaseLevel(){return state.phase==='race'?MUSIC_LEVELS.race:state.phase==='results'?MUSIC_LEVELS.results:MUSIC_LEVELS.waiting;}
  function setMusicLevel(v){music.volume=Math.max(0,Math.min(1,Number(v)||0));}
  async function toggleAudio(){state.audio=!state.audio;const btn=el('audio-toggle');btn.setAttribute('aria-pressed',String(state.audio));btn.textContent=state.audio?'SOM ON':'SOM OFF';if(state.audio){hostVideo.muted=true;if(music.src){try{setMusicLevel(phaseLevel());await music.play();}catch{}}}else{music.pause();}}
  function setupMedia(){hostVideo.src='/assets/host-avatar.mp4';hostVideo.play().catch(()=>{});music.preload='auto';music.src=MUSIC_SRC;music.load();setMusicLevel(MUSIC_LEVELS.waiting);el('audio-toggle').addEventListener('click',toggleAudio);}
  function qaAction(action){if(action!=='results'&&state.phase==='results'){el('results').hidden=true;}if(action==='grid')prepareGrid(16);else if(action==='race8')startRace(8);else if(action==='race16'){startRace(16);window.setTimeout(differentLaps,1100);}else if(action==='rose')gift('rose');else if(action==='premium')gift('emp');else if(action==='galaxy')gift('galaxy');else if(action==='likes')onLike('@NOVO_PILOTO',1000);else if(action==='finish')finishLeader();else if(action==='results')showResults();}
  document.querySelectorAll('[data-qa]').forEach(b=>b.addEventListener('click',()=>qaAction(b.dataset.qa)));
  if(new URLSearchParams(location.search).has('qa'))document.body.classList.add('qa');
  // DEMO_MODE: apenas via URL (?qa / ?demo). Produção = sem karts falsos.
  const DEMO_MODE=new URLSearchParams(location.search).has('qa')||new URLSearchParams(location.search).has('demo');
  window.NeonRushQA={action:qaAction,report:()=>{const laps=new Set(state.racers.map(r=>r.completedLaps));const avg=state.fpsSamples.length?state.fpsSamples.reduce((a,b)=>a+b,0)/state.fpsSamples.length:state.fps;const musicEl=document.getElementById('music');return {phase:state.phase,racers:state.racers.length,queued:state.queue.size,queueKeys:[...state.queue.keys()],racerKeys:state.racers.map(r=>r.userId),duplicateRacers:RL.countDuplicateRacers(state.racers),active:state.racers.filter(r=>!r.finished).length,finished:state.racers.filter(r=>r.finished).length,differentLaps:laps.size>1,lapList:[...laps].sort((a,b)=>a-b),pageErrors:state.errors.slice(),consoleErrors:0,fps:Number(avg.toFixed(1)),music:{src:String(musicEl.currentSrc||musicEl.src||'').split('/').pop(),readyState:musicEl.readyState,loaded:musicEl.readyState>=2,paused:musicEl.paused,time:Number(musicEl.currentTime.toFixed(2)),volume:musicEl.volume,muted:musicEl.muted},tts:{mode:RL.MODES.LIVE_COMPLIANT===state.mode?'LIVE_COMPLIANT':state.mode,last:state.ttsLast||null},roadQA:TG.runRoadQA()};},
    welcome:(name)=>speakWelcome(name||'@ANA'),
    reset:resetFromResults,
    setMode:(m)=>{state.mode=RL.MODES[m]||m;return state.mode;},
    mode:()=>state.mode,
    enableAudio:()=>{if(!state.audio)return toggleAudio();return state.audio;},
    audioState:()=>({audio:state.audio,readyState:music.readyState,paused:music.paused,time:Number(music.currentTime.toFixed(3)),volume:music.volume,src:String(music.currentSrc||music.src||'').split('/').pop()}),
    snapshot:()=>({phase:state.phase,now:performance.now(),firstFinishAt:state.firstFinishAt,finishCount:state.finishCount,mode:state.mode,lastGift:state.lastGift?{...state.lastGift}:null,event:{type:state.eventType,until:state.eventUntil},shell:[...shell.classList],cooldowns:Object.fromEntries(Object.entries(state.giftCooldowns)),racers:state.racers.map(r=>({u:r.username,id:r.userId,lap:r.completedLaps,prog:Number(r.trackProgress.toFixed(4)),base:Number(r.baseSpeed.toFixed(5)),boost:Math.round(r.boostUntil),shock:Math.round(r.shockUntil),fin:!!r.finished,pos:r.finishPosition||0,route:Number(r.finishRoute.toFixed(2)),avatar:r.avatar,team:r.teamId}))}),
    progress:(user)=>{const r=state.racers.find(x=>x.username===user||x.userId===String(user||'').toLowerCase());return r?Number(r.trackProgress.toFixed(5)):null;},
    giftBar:giftBarState,
    gift:(id,user,source)=>gift(id,user,source||'live'),
    likes:(user,amount)=>onLike(user,Number(amount)||1000),
    comment:(user,text)=>onLiveEvent({type:'comment',username:user,comment:text}),
    live:(ev)=>onLiveEvent(ev),
    startRace:()=>startRace(16),
    grid:()=>prepareGrid(16),
    sprint:()=>{state.phase='race';const leader=RL.rankRacers(state.racers).filter(r=>!r.finished)[0];if(!leader)return null;leader.completedLaps=TOTAL_LAPS-2;leader.trackProgress=.88;leader.totalProgress=(TOTAL_LAPS-2)*RL.TRACK_LENGTH+leader.trackProgress*RL.TRACK_LENGTH;leader.displayProgress=leader.trackProgress;leader.baseSpeed=.2;return leader.username;},
    finishLeader:()=>finishLeader(),
    differentLaps:()=>differentLaps(),
    results:()=>showResults(),
    tts:()=>state.ttsLast||null,
    shellRect:()=>{const a=document.getElementById('gift-actions').getBoundingClientRect(),r=document.getElementById('race-zone').getBoundingClientRect(),s=shell.getBoundingClientRect();return {bar:{x:Math.round(a.x),y:Math.round(a.y),w:Math.round(a.width),h:Math.round(a.height)},race:{y:Math.round(r.y),h:Math.round(r.height)},shell:{w:Math.round(s.width),h:Math.round(s.height),scrollW:shell.scrollWidth,clientW:shell.clientWidth}};}
  };
  buildGiftBar();buildTeams();setupMedia();connectBridge();requestAnimationFrame(frame);
  if(DEMO_MODE){prepareGrid(8);window.setTimeout(()=>{if(state.phase==='grid')startRace(8);},1800);}
  else{setWaitingState();}
})();
