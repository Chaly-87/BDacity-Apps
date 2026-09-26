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
  const EFFECT_LABELS={turbo:'TURBO',slow:'OBSTÁCULO',boost:'BOOST',hazard:'OBSTÁCULO',shock:'CHOQUE',galaxy:'CAOS TOTAL'};
  const canvas=document.getElementById('race-canvas'),ctx=canvas.getContext('2d',{alpha:true});
  const shell=document.getElementById('shell'),music=document.getElementById('music'),hostVideo=document.getElementById('host-video');
  const state={phase:'waiting',racers:[],queue:new Map(),likesByUser:{},giftCooldowns:{},raceStartedAt:0,firstFinishAt:null,finishCount:0,lastNow:performance.now(),remaining:RACE_TIME,mode:RL.MODES.LIVE_COMPLIANT,eventUntil:0,eventType:'',errors:[],fpsSamples:[],frameCount:0,lastFpsAt:performance.now(),fps:60,ws:null,wsRetry:null,audio:false,ttsBusy:false};
  const seededNames=['@LUNA','@MIGUEL','@SOFIA','@TIAGO','@INES','@DIOGO','@MARTA','@RAFA','@BEA','@NUNO','@RITA','@LUIS','@ANA','@PEDRO','@CARLA','@HUGO'];

  window.addEventListener('error',e=>state.errors.push(String(e.message||'page error')));
  window.addEventListener('unhandledrejection',e=>state.errors.push(String(e.reason?.message||e.reason||'unhandled rejection')));

  function hexToRgba(hex,a){const n=parseInt(hex.slice(1),16);return `rgba(${n>>16},${n>>8&255},${n&255},${a})`;}
  function teamFor(value){if(typeof value==='number')return TEAM_DEFS[Math.abs(value)%4];const s=String(value||'').toLowerCase();const idx=TEAM_DEFS.findIndex(t=>s.includes(t.key));return TEAM_DEFS[idx<0?0:idx];}
  function el(id){return document.getElementById(id);}
  function makeRacer(index,name=seededNames[index%seededNames.length],teamId=index%4){
    const r=RL.makeRacerState({userId:name.toLowerCase(),username:name,team:TEAM_DEFS[teamId].key,currentLap:1,completedLaps:0,trackProgress:0,status:'ready'});
    return Object.assign(r,{teamId,lane:((index%3)-1)*.78,baseSpeed:.026+(index%7)*.00125,boostUntil:0,shockUntil:0,displayProgress:0,finishRoute:0,gridIndex:index});
  }
  function seed(count){state.racers=Array.from({length:Math.min(MAX_RACERS,count)},(_,i)=>makeRacer(i));state.finishCount=0;state.firstFinishAt=null;state.remaining=RACE_TIME;renderHud();}
  function prepareGrid(count=state.racers.length||8){seed(count);state.phase='grid';state.raceStartedAt=0;setMusicLevel(.6);state.racers.forEach((r,i)=>{const p=TG.startGrid(count)[i];r.trackProgress=p.progress;r.lane=p.lane;r.displayProgress=p.progress;});setRaceCopy('GRELHA DE PARTIDA','16 SLOTS • GEOMETRIA DA PISTA');}
  function startRace(count=8){prepareGrid(count);window.setTimeout(()=>{if(state.phase!=='grid')return;state.phase='race';state.raceStartedAt=performance.now();setMusicLevel(.75);state.racers.forEach((r,i)=>{r.trackProgress=(1-i*.013+1)%1;r.displayProgress=r.trackProgress;r.status='racing';});setRaceCopy('CORRIDA EM CURSO','CADA PILOTO TEM A SUA VOLTA');},900);}
  function setRaceCopy(title,sub){el('race-state').textContent=title;el('race-detail').textContent=sub;el('race-banner').querySelector('strong').textContent=title;el('race-subtitle').textContent=sub;el('bottom-callout').innerHTML=`${title.split(' ').slice(0,-1).join(' ')||'NEON RUSH'}<br><b>${title.split(' ').slice(-1)}</b>`;}
  function showEvent(user,gift,effect,type='gift',duration=3000){el('event-cause').textContent=`${user} ENVIOU ${gift}`;el('event-effect').textContent=`${effect} ATIVADO!`;el('event-avatar').textContent=String(user).replace(/^@/,'').charAt(0).toUpperCase()||'?';const w=el('world-event');w.textContent=`${gift} → ${effect}`;w.classList.add('active');state.eventUntil=performance.now()+duration;state.eventType=type;shell.classList.toggle('galaxy',type==='galaxy');}
  function clearEvent(now){if(state.eventUntil&&now>=state.eventUntil){state.eventUntil=0;el('world-event').classList.remove('active');shell.classList.remove('galaxy');}}
  function buildGiftBar(){
    const ids=['rose','bomb','emp','galaxy'];
    el('gift-actions').innerHTML=ids.map(id=>{const rule=RL.GIFT_RULES[id],team=id==='rose'?'#ff4e98':id==='bomb'?'#ff8b2c':id==='emp'?'#ffe14d':'#bd5cff';return `<div class="gift-card" style="--gift:${team}"><span class="gift-icon">${ICONS[id]}</span><span><strong>${rule.name}</strong><b>= ${EFFECT_LABELS[rule.effect]}</b><small>${rule.tier}</small></span></div>`;}).join('');
  }
  function buildTeams(){el('team-dock').innerHTML=TEAM_DEFS.map(t=>`<div class="team-card" style="--team:${t.color}"><strong>${t.name}</strong><small id="team-count-${t.id}">0 PILOTOS</small><span class="energy"><i id="team-energy-${t.id}" style="--energy:12%"></i></span></div>`).join('');}
  function renderHud(){
    const ranked=RL.rankRacers(state.racers);const leader=ranked[0];
    el('leader-lap').textContent=String(Math.min(TOTAL_LAPS,(leader?.completedLaps||0)+1)).padStart(2,'0')+'/'+TOTAL_LAPS;
    const secs=Math.max(0,Math.ceil(state.remaining));el('race-time').textContent=String(Math.floor(secs/60)).padStart(2,'0')+':'+String(secs%60).padStart(2,'0');
    el('top3').innerHTML=ranked.slice(0,3).map((r,i)=>`<li style="--team:${TEAM_DEFS[r.teamId].color}">P${i+1} · ${r.username.slice(0,12)}</li>`).join('');
    el('top10').innerHTML=ranked.slice(0,10).map((r,i)=>`<li style="--team:${TEAM_DEFS[r.teamId].color}"><i></i><span>${i+1}. ${r.username.slice(0,10)}</span><em>${r.finished?'FIN':`${Math.min(10,r.completedLaps+1)}/10`}</em></li>`).join('');
    TEAM_DEFS.forEach(t=>{const count=state.racers.filter(r=>r.teamId===t.id&&!r.finished).length;el(`team-count-${t.id}`).textContent=`${count} PILOTO${count===1?'':'S'}`;el(`team-energy-${t.id}`).style.setProperty('--energy',`${Math.min(100,12+count*14)}%`);});
  }
  function finishRacer(r,now){if(r.finished)return;state.finishCount+=1;RL.finishRacer(r,state.finishCount,now-state.raceStartedAt);r.finishRoute=0;if(state.firstFinishAt==null)state.firstFinishAt=now;showEvent(r.username,'META',`P${r.finishPosition}`,'finish',1800);}
  function tickRace(dt,now){
    if(state.phase!=='race')return;
    state.remaining-=dt;const active=state.racers.filter(r=>!r.finished);
    active.forEach((r,i)=>{const mult=now<r.boostUntil?1.55:now<r.shockUntil?0.45:1;const before=r.trackProgress;r.trackProgress+=r.baseSpeed*mult*dt;if(r.trackProgress>=1){r.trackProgress-=1;r.completedLaps+=1;r.currentLap=Math.min(TOTAL_LAPS,r.completedLaps+1);if(r.completedLaps>=TOTAL_LAPS)finishRacer(r,now);}r.totalProgress=r.completedLaps*RL.TRACK_LENGTH+r.trackProgress*RL.TRACK_LENGTH;r.displayProgress=r.trackProgress;if(before>.85&&r.trackProgress<.15&&r.completedLaps===TOTAL_LAPS-1){shell.classList.add('sprint');setMusicLevel(.92);setRaceCopy('FINAL SPRINT','O LÍDER ENTROU NA ÚLTIMA VOLTA');}});
    state.racers.filter(r=>r.finished&&r.finishRoute<1).forEach(r=>{r.finishRoute=Math.min(1,r.finishRoute+dt*.52);});
    if(RL.raceShouldEnd(state.racers,state.firstFinishAt,now)||state.remaining<=0)showResults();
  }
  function drawTrackGeometry(){
    const mesh=TG.roadMesh(160);ctx.save();ctx.lineJoin='round';ctx.lineCap='round';
    const draw=(pts,color,width,dash=[])=>{ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.setLineDash(dash);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();};
    draw(mesh.center,'rgba(30,231,255,.18)',2,[12,14]);draw(mesh.left,'rgba(255,72,170,.34)',3,[8,8]);draw(mesh.right,'rgba(32,231,255,.34)',3,[8,8]);ctx.setLineDash([]);
    const f=TG.pointAt(0,0);ctx.translate(f.x,f.y);ctx.rotate(f.angle);for(let x=-40;x<40;x+=10)for(let y=-15;y<15;y+=10){ctx.fillStyle=((x/10+y/10)&1)?'#fff':'#111';ctx.fillRect(x,y,10,10);}ctx.restore();
  }
  function drawGrid(){if(state.phase!=='grid')return;const slots=TG.startGrid(state.racers.length);ctx.save();ctx.font='700 10px Arial';ctx.textAlign='center';slots.forEach(s=>{ctx.strokeStyle='rgba(255,255,255,.78)';ctx.strokeRect(s.x-15,s.y-10,30,20);ctx.fillStyle='#fff';ctx.fillText(String(s.slot),s.x,s.y+3);});ctx.restore();}
  function drawKart(r,rank,now){
    let p;if(r.finished&&r.finishRoute<1){const path=TG.FINISH_EXIT_PATH,pos=r.finishRoute*(path.length-1),a=path[Math.floor(pos)],b=path[Math.min(path.length-1,Math.ceil(pos))],mix=pos-Math.floor(pos),ap=TG.pointAt(a.progress,a.lane/36),bp=TG.pointAt(b.progress,b.lane/36);p={x:ap.x+(bp.x-ap.x)*mix,y:ap.y+(bp.y-ap.y)*mix,angle:ap.angle+(bp.angle-ap.angle)*mix};}else if(r.finished){p=TG.parkingPoint(r.finishPosition);}else if(state.phase==='grid'){p=TG.startGrid(state.racers.length)[r.gridIndex];}else p=TG.pointAt(r.displayProgress,r.lane);
    const t=TEAM_DEFS[r.teamId],boost=now<r.boostUntil;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);
    ctx.shadowColor=t.color;ctx.shadowBlur=boost?18:8;ctx.fillStyle=hexToRgba(t.color,.32);ctx.beginPath();ctx.ellipse(0,4,20,11,0,0,Math.PI*2);ctx.fill();
    if(boost){ctx.fillStyle='#7effff';ctx.beginPath();ctx.moveTo(-16,-5);ctx.lineTo(-34,0);ctx.lineTo(-16,5);ctx.fill();}
    ctx.fillStyle='#080b14';ctx.fillRect(-14,-12,7,5);ctx.fillRect(-14,7,7,5);ctx.fillRect(8,-12,7,5);ctx.fillRect(8,7,7,5);
    ctx.fillStyle=t.color;ctx.beginPath();ctx.moveTo(19,0);ctx.lineTo(7,-9);ctx.lineTo(-14,-7);ctx.lineTo(-18,0);ctx.lineTo(-14,7);ctx.lineTo(7,9);ctx.closePath();ctx.fill();
    ctx.fillStyle='#dff9ff';ctx.fillRect(6,-4,9,8);ctx.fillStyle='#111b2b';ctx.beginPath();ctx.arc(-1,0,5,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=1;ctx.stroke();ctx.restore();
    ctx.save();ctx.font='900 11px Arial';ctx.textAlign='center';ctx.fillStyle='#050611';ctx.strokeStyle=t.color;ctx.lineWidth=3;ctx.strokeText(String(rank),p.x,p.y-18);ctx.fillStyle='#fff';ctx.fillText(String(rank),p.x,p.y-18);ctx.restore();
  }
  function draw(now){ctx.clearRect(0,0,canvas.width,canvas.height);drawTrackGeometry();drawGrid();const ranked=RL.rankRacers(state.racers);ranked.forEach((r,i)=>drawKart(r,i+1,now));}
  function frame(now){const dt=Math.min(.05,(now-state.lastNow)/1000);state.lastNow=now;tickRace(dt,now);clearEvent(now);draw(now);state.frameCount+=1;if(now-state.lastFpsAt>=1000){state.fps=state.frameCount*1000/(now-state.lastFpsAt);state.fpsSamples.push(state.fps);if(state.fpsSamples.length>30)state.fpsSamples.shift();state.frameCount=0;state.lastFpsAt=now;renderHud();}requestAnimationFrame(frame);}
  function gift(id,user='@HUGO',source='demo'){
    const rule=RL.GIFT_RULES[id];if(!rule)return;const ranked=RL.rankRacers(state.racers);const sender=ranked.find(r=>r.username===user)||ranked[ranked.length-1]||state.racers[0];const applied=RL.applyGiftEffect({mode:source==='demo'?RL.MODES.FULL_INTERACTION_DEMO:state.mode,gift:rule,source:'gift',target:sender?.userId,now:performance.now(),cooldownMap:state.giftCooldowns});showEvent(user,rule.name,applied.blocked?'EFEITO VISUAL':EFFECT_LABELS[rule.effect],id==='galaxy'?'galaxy':'gift',rule.duration);if(applied.blocked||!sender)return;if(rule.effect==='turbo'||rule.effect==='boost'||rule.effect==='galaxy')sender.boostUntil=performance.now()+rule.duration;if(rule.effect==='shock'||rule.effect==='hazard'||rule.effect==='slow'){ranked.filter(r=>r!==sender&&!r.finished).slice(0,5).forEach(r=>r.shockUntil=performance.now()+rule.duration);}if(rule.effect==='galaxy')ranked.filter(r=>r!==sender&&!r.finished).forEach(r=>r.shockUntil=performance.now()+rule.duration);}
  function onLike(user,count){const id=user.toLowerCase(),previous=Number(state.likesByUser[id]||0),total=RL.recordLike({likesByUser:state.likesByUser,userId:id,amount:count}),milestones=RL.crossedLikeMilestones(previous,count,1000),exists=state.racers.some(r=>r.userId===id)||state.queue.has(id);if(milestones.includes(1000)&&!exists){if(state.racers.length<MAX_RACERS){state.racers.push(makeRacer(state.racers.length,user,1));showEvent(user,'1000 LIKES','NOVO PILOTO','likes');}else{state.queue.set(id,{username:user,teamId:1});showEvent(user,'1000 LIKES','PILOTO NA FILA','likes');}}else if(milestones.length){const racer=state.racers.find(r=>r.userId===id);if(racer)racer.boostUntil=performance.now()+1800;showEvent(user,`${total} LIKES`,'BOOST','likes');}}
  function showResults(){if(state.phase==='results')return;state.phase='results';shell.classList.remove('sprint','galaxy');setMusicLevel(.28);const ranked=RL.rankRacers(state.racers);const box=el('results');box.hidden=false;box.innerHTML=`<h2>RESULTADOS</h2><div class="podium">${ranked.slice(0,3).map((r,i)=>`<div style="--team:${TEAM_DEFS[r.teamId].color}">P${i+1}<br>${r.username}<br><small>${TEAM_DEFS[r.teamId].key.toUpperCase()}</small></div>`).join('')}</div><p>PRÓXIMA CORRIDA EM BREVE</p>`;setRaceCopy('RESULTADOS FINAIS','TOP 10 CONFIRMADO');}
  function resetFromResults(){el('results').hidden=true;shell.classList.remove('sprint','galaxy');startRace(8);setMusicLevel(.75);}
  function finishLeader(){const r=RL.rankRacers(state.racers).find(x=>!x.finished);if(!r)return;if(state.phase!=='race'){state.phase='race';state.raceStartedAt=performance.now();}r.completedLaps=TOTAL_LAPS-1;r.trackProgress=.995;r.totalProgress=(TOTAL_LAPS-1)*RL.TRACK_LENGTH+995;r.baseSpeed=.2;}
  function differentLaps(){state.phase='race';state.raceStartedAt=performance.now();state.racers.forEach((r,i)=>{r.completedLaps=i%9;r.currentLap=r.completedLaps+1;r.trackProgress=(i*.137)%1;r.totalProgress=r.completedLaps*RL.TRACK_LENGTH+r.trackProgress*RL.TRACK_LENGTH;r.displayProgress=r.trackProgress;});}
  function browserPtPtWelcome(name){return new Promise(resolve=>{const voices=window.speechSynthesis?.getVoices?.()||[],voice=voices.find(v=>String(v.lang).toLowerCase().startsWith('pt-pt'));if(!voice){resolve(false);return;}const utter=new SpeechSynthesisUtterance(`Bem-vindo, ${String(name).replace(/^@/,'')}.`);utter.lang='pt-PT';utter.voice=voice;utter.onend=()=>resolve(true);utter.onerror=()=>resolve(false);window.speechSynthesis.speak(utter);});}
  async function speakWelcome(name){if(!state.audio||state.ttsBusy)return;state.ttsBusy=true;let spoken=false;setMusicLevel(.22);try{const res=await fetch(`/tts/welcome?name=${encodeURIComponent(String(name).replace(/^@/,''))}`);if(res.ok){const blob=await res.blob(),url=URL.createObjectURL(blob),audio=new Audio(url);await audio.play();await new Promise(resolve=>{audio.onended=resolve;audio.onerror=resolve;});URL.revokeObjectURL(url);spoken=true;}if(!spoken)await browserPtPtWelcome(name);}catch{await browserPtPtWelcome(name);}finally{setMusicLevel(state.phase==='race'?.75:.42);state.ttsBusy=false;}}
  function onLiveEvent(ev){const type=String(ev?.type||'');const user=String(ev?.username||'@VIEWER').slice(0,24);if(type==='comment'){const map={1:0,red:0,2:1,blue:1,3:2,green:2,4:3,purple:3};const key=String(ev.comment||'').trim().toLowerCase(),id=user.toLowerCase();if(Object.hasOwn(map,key)&&!state.racers.some(r=>r.userId===id)&&!state.queue.has(id)){if(state.racers.length<MAX_RACERS)state.racers.push(makeRacer(state.racers.length,user,map[key]));else state.queue.set(id,{username:user,teamId:map[key]});showEvent(user,'COMENTÁRIO',state.racers.length<MAX_RACERS?'PILOTO INSCRITO':'PILOTO NA FILA','join');}}else if(type==='like')onLike(user,Number(ev.count)||1);else if(type==='gift'){const key=String(ev.giftName||'rose').toLowerCase();const id=Object.hasOwn(RL.GIFT_RULES,key)?key:RL.giftFor(Number(ev.totalDiamonds)||1).id;gift(id,user,'live');}else if(type==='join'){showEvent(user,'ENTROU','BEM-VINDO','join',1600);void speakWelcome(user);}}
  function connectBridge(){if(location.protocol==='file:')return;const proto=location.protocol==='https:'?'wss':'ws';try{const ws=new WebSocket(`${proto}://${location.host}/ws`);state.ws=ws;ws.onopen=()=>{el('bridge-status').textContent='LIVE LIGADA';};ws.onmessage=e=>{try{onLiveEvent(JSON.parse(e.data));}catch{}};ws.onclose=()=>{el('bridge-status').textContent='MODO LOCAL';state.wsRetry=window.setTimeout(connectBridge,3500);};ws.onerror=()=>{};}catch{el('bridge-status').textContent='MODO LOCAL';}}
  function setMusicLevel(v){if(!music.paused)music.volume=Math.max(0,Math.min(1,v));}
  async function toggleAudio(){state.audio=!state.audio;const btn=el('audio-toggle');btn.setAttribute('aria-pressed',String(state.audio));btn.textContent=state.audio?'SOM ON':'SOM OFF';if(state.audio){hostVideo.muted=true;if(music.src){try{music.volume=state.phase==='race'?.75:.42;await music.play();}catch{}}}else{music.pause();}}
  function setupMedia(){hostVideo.src='/assets/host-avatar.mp4';hostVideo.play().catch(()=>{});music.src='/assets/neon-rush-official.mp3';music.load();el('audio-toggle').addEventListener('click',toggleAudio);}
  function qaAction(action){if(action!=='results'&&state.phase==='results'){el('results').hidden=true;}if(action==='grid')prepareGrid(16);else if(action==='race8')startRace(8);else if(action==='race16'){startRace(16);window.setTimeout(differentLaps,1100);}else if(action==='rose')gift('rose');else if(action==='premium')gift('emp');else if(action==='galaxy')gift('galaxy');else if(action==='likes')onLike('@NOVO_PILOTO',1000);else if(action==='finish')finishLeader();else if(action==='results')showResults();}
  document.querySelectorAll('[data-qa]').forEach(b=>b.addEventListener('click',()=>qaAction(b.dataset.qa)));
  if(new URLSearchParams(location.search).has('qa'))document.body.classList.add('qa');
  window.NeonRushQA={action:qaAction,report:()=>{const laps=new Set(state.racers.map(r=>r.completedLaps));const avg=state.fpsSamples.length?state.fpsSamples.reduce((a,b)=>a+b,0)/state.fpsSamples.length:state.fps;return {phase:state.phase,racers:state.racers.length,queued:state.queue.size,active:state.racers.filter(r=>!r.finished).length,finished:state.racers.filter(r=>r.finished).length,differentLaps:laps.size>1,pageErrors:state.errors.slice(),consoleErrors:0,fps:Number(avg.toFixed(1)),roadQA:TG.runRoadQA()};},reset:resetFromResults};
  buildGiftBar();buildTeams();setupMedia();prepareGrid(8);connectBridge();requestAnimationFrame(frame);window.setTimeout(()=>{if(state.phase==='grid')startRace(8);},1800);
})();
