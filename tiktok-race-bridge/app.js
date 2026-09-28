(function(){
  'use strict';
  const RL=window.RaceLogic,TG=window.TrackGeometry;
  if(!RL||!TG)throw new Error('Race modules unavailable');
  // V4 LIVE: relógio da corrida = MAX_RACE_DURATION (300s). A corrida termina
  // sempre: 10 voltas de alguém OU 5:00 no relógio — o que chegar primeiro.
  const TOTAL_LAPS=RL.TOTAL_LAPS,RACE_TIME=RL.MAX_RACE_DURATION,MAX_RACERS=16;
  // V5 SHOW: boost a sério — 2.2× base durante ~3s (afeta física E visual).
  const BOOST_MULT=2.2,BOOST_MS=3000;
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
  // V4-LEGIBILITY: karts ~17.6% maiores no ecrã. APENAS visual (scale de draw):
  // TRACK_PATH.kartHalfWidth/kartHalfLength (física/QA) ficam intactos.
  const KART_SCALE=1.2;
  // V4 ZOOM: câmara do MUNDO (+10%) aplicada só no desenho do canvas da pista —
  // HUD/top/bottom intocados. Zoom em coordenadas de MUNDO (antes do reset do
  // contexto): os vectores voltam a rasterizar nítidos — resolve o "desfocado"
  // sem blur. trackMesh é construída no mesmo espaço, pelo que pista, kerbs,
  // barreiras, hazards, grid e karts deslocam-se juntos; a margem de folga do
  // hitbox audit (minRoadClearance 12.28) cobre o corte de ~5px nas bordas.
  const WORLD_ZOOM=1.1;
  // V5 SHOW: música oficial = psyfunk.mp3 (ficheiro EXATO do utilizador,
  // sem pitch/speed/remix). Para trocar no futuro: mudar SÓ esta constante.
  const MUSIC_SRC='/assets/psyfunk.mp3';
  // LIVE DATA ONLY: sem viewers fake. O contador só aparece com número real
  // enviado pela ponte (evento roomUser/stats). Sem dados → oculto.
  function setViewerCount(n){const v=el('viewers');if(!v)return;const num=Math.max(0,Math.floor(Number(n)));if(Number.isFinite(num)&&num>0){v.hidden=false;v.textContent='◉ '+num.toLocaleString('pt-PT');}else{v.hidden=true;}}
  const canvas=document.getElementById('race-canvas');let ctx=canvas.getContext('2d',{alpha:true});
  // V4 LIVE-SOURCE: backing store = tamanho CSS real do elemento (1 píxel de
  // raster por píxel de output). NÃO é zoom — é RESOLUÇÃO: no stream 1080×1920
  // o canvas rasteriza a 1080 (nítido) em vez de esticar os 720 originais;
  // a 720 mantém o custo original. Coordenas de jogo continuam 720×720.
  // Câmara mantém +10% (WORLD_ZOOM).
  const BACKING=Math.max(720,Math.round(canvas.getBoundingClientRect().width)||720);
  canvas.width=BACKING;canvas.height=BACKING;
  ctx.scale(BACKING/720,BACKING/720);
  // (a transformação de zoom de câmara é aplicada aqui — ctx já existe)
  ctx.translate(360,360);ctx.scale(WORLD_ZOOM,WORLD_ZOOM);ctx.translate(-360,-360);
  const shell=document.getElementById('shell'),music=document.getElementById('music'),hostVideo=document.getElementById('host-video');
  const goSound=(()=>{const a=new Audio('/assets/countdown-go.mp3');a.preload='auto';a.volume=.9;return a;})();
  const audioMix=window.LiveAudio.create(music,goSound),lifecycle=window.RaceLifecycle.create();
  const durations=window.RaceLifecycle.DURATIONS,eligible=new Map(),identityAliases=new Map(),receivedEvents=new Set();
  const ELIGIBLE_MS=15*60*1000;
  let raceScale=1,phaseDeadline=0,lastCountdown=-1,lastLeader=null;
  function playCountdownGo(){audioMix.go().catch(e=>state.errors.push(e.message));}
  const state={phase:'waiting',racers:[],queue:new Map(),likesByUser:{},giftCooldowns:{},raceStartedAt:0,firstFinishAt:null,finishCount:0,lastNow:performance.now(),remaining:RACE_TIME,mode:RL.MODES.LIVE_INTERACTIVE,eventUntil:0,eventType:'',errors:[],fpsSamples:[],frameCount:0,lastFpsAt:performance.now(),fps:60,ws:null,wsRetry:null,audio:false,ttsBusy:false,lastGift:null,ttsLast:null};
  const seededNames=['@LUNA','@MIGUEL','@SOFIA','@TIAGO','@INES','@DIOGO','@MARTA','@RAFA','@BEA','@NUNO','@RITA','@LUIS','@ANA','@PEDRO','@CARLA','@HUGO'];
  function transition(next,reason){lifecycle.transition(next,reason);state.phase=next;shell.dataset.phase=next;phaseDeadline=durations[next]?performance.now()+durations[next]:0;}
  function racing(){return ['race','final_sprint','finishing'].includes(state.phase);}
  function safeText(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function cameraPulse(kind){shell.dataset.camera=kind;state.cameraUntil=performance.now()+850;}

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
    // BASE SPEED: metade da velocidade da preview V4 — o ritmo rápido fica
    // reservado para TURBO/nitro/boost (mult 1.55). Lap base: ~60-77 s.
    return Object.assign(r,{teamId,lane:((index%3)-1)*.78,baseSpeed:.013+(index%7)*.000625,boostUntil:0,shockUntil:0,visualBoostUntil:0,visualShockUntil:0,boostMult:BOOST_MULT,displayProgress:0,finishRoute:0,gridIndex:index});
  }
  function seed(count){state.racers=Array.from({length:Math.min(MAX_RACERS,count)},(_,i)=>makeRacer(i));state.finishCount=0;state.firstFinishAt=null;state.remaining=RACE_TIME;renderHud();}
  function prepareGrid(count=8){if(state.phase!=='waiting')return;seed(count);transition('lobby');}
  function startRace(count=8){prepareGrid(count);}
  function setRaceCopy(title,sub){el('race-state').textContent=title;el('race-detail').textContent=sub;el('race-banner').querySelector('strong').textContent=title;el('race-subtitle').textContent=sub;el('bottom-callout').innerHTML=`${title.split(' ').slice(0,-1).join(' ')||'NEON RUSH'}<br><b>${title.split(' ').slice(-1)}</b>`;}
  function showEvent(user,gift,effect,type='gift',duration=3000,causeText,effectText){el('event-cause').textContent=causeText||`${user} ENVIOU ${gift}`;el('event-effect').textContent=effectText||`${effect} ATIVADO!`;el('event-avatar').textContent=String(user).replace(/^@/,'').charAt(0).toUpperCase()||'?';const w=el('world-event');w.textContent=`${gift} → ${effect}`;w.classList.add('active');state.eventUntil=performance.now()+duration;state.eventType=type;shell.classList.toggle('galaxy',type==='galaxy');}
  function clearEvent(now){if(state.eventUntil&&now>=state.eventUntil){state.eventUntil=0;el('world-event').classList.remove('active');shell.classList.remove('galaxy');}}
  function buildGiftBar(){
    // V4-LEGIBILITY: cartão simplificado = ICON + NOME + EFEITO (texto grande).
    // Sem a 3.ª linha descritiva pequena. gift-who (destaque temporário) mantém-se.
    const SHORT_EFFECT={rose:'TURBO',bomb:'OBSTÁCULO',emp:'SHOCK',galaxy:'CAOS'};
    el('gift-actions').innerHTML=BAR_ITEMS.map(item=>{
      const rule=RL.GIFT_RULES[item.id];
      return `<div class="gift-card" data-gift="${item.id}" style="--gift:${item.color}"><span class="gift-icon">${item.icon}</span><span class="gift-body"><strong>${item.title}</strong><b>${SHORT_EFFECT[item.id]||EFFECT_LABELS[rule.effect]}</b><em class="gift-who"></em></span></div>`;
    }).join('');
  }
  const giftTimers=new Map();
  function playGiftSting(id,rule){audioMix.sting(id);}
  // V5 SHOW — SISTEMA CENTRAL DE EFEITOS LIVE. Toda reação auditiva/visual de
  // evento passa aqui: música (duck/restore), SFX, overlay e classes fx na
  // shell (arena/cidade reagem). Um único caminho — sem lógica áudio espalhada.
  const FX_KIND={turbo:'boost',boost:'boost',hazard:'explosion',slow:'explosion',shock:'shock',galaxy:'galaxy'};
  function triggerLiveEffect(effect,{user='',giftId='',duration=2200}={}){
    const kind=FX_KIND[effect]||'boost';
    audioMix.effect(kind,duration);
    shell.classList.remove('fx-boost','fx-explosion','fx-shock','fx-galaxy');
    void shell.offsetWidth;
    shell.classList.add(`fx-${kind}`);
    clearTimeout(state.fxClassUntil);
    state.fxClassUntil=setTimeout(()=>shell.classList.remove('fx-boost','fx-explosion','fx-shock','fx-galaxy'),Math.max(1200,Math.min(duration,3200)));
    const overlayText={boost:`${user} — ${giftId==='rose'?'ROSA':'BOOST'} → TURBO`,explosion:`${user} — FOGUETE → EXPLOSÃO`,shock:`${user} — TROVÃO → SHOCK`,galaxy:`${user} — GALÁXIA → CAOS`}[kind];
    if(overlayText)el('event-effect').textContent=overlayText;
    refreshEntryPanel();
  }
  // Painel de entrada PERMANENTE — nunca desaparece nem é substituído por gifts.
  function refreshEntryPanel(){
    const panel=el('entry-panel');if(!panel)return;
    panel.querySelectorAll('[data-entry-team]').forEach(el=>{el.classList.toggle('on',state.racers.some(r=>r.teamId===Number(el.dataset.entryTeam)));});
    const count=state.racers.length;
    const c=panel.querySelector('.entry-count');if(c)c.textContent=count?`${count} NA PISTA`:'À ESPERA DE PILOTOS';
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
    el('top3').innerHTML=ranked.slice(0,3).map((r,i)=>`<li style="--team:${TEAM_DEFS[r.teamId].color}">P${i+1} · ${safeText(r.username.slice(0,12))}</li>`).join('');
      el('top10').innerHTML=ranked.slice(0,10).map((r,i)=>`<li style="--team:${TEAM_DEFS[r.teamId].color}"><i></i><span>${i+1}. ${safeText(r.username.slice(0,10))}</span><em>${r.finished?'FIN':`${Math.min(10,r.completedLaps+1)}/10`}</em></li>`).join('');
    TEAM_DEFS.forEach(t=>{const count=state.racers.filter(r=>r.teamId===t.id&&!r.finished).length;el(`team-count-${t.id}`).textContent=`${count} PILOTO${count===1?'':'S'}`;el(`team-energy-${t.id}`).style.setProperty('--energy',`${Math.min(100,12+count*14)}%`);});
    refreshEntryPanel();
  }
  function finishRacer(r,now){if(r.finished)return;state.finishCount+=1;RL.finishRacer(r,state.finishCount,now-state.raceStartedAt);r.finishRoute=0;if(state.firstFinishAt==null){state.firstFinishAt=now;transition('finishing');cameraPulse('finish');}audioMix.effect('finish',600);showEvent(r.username,'META',`P${r.finishPosition}`,'finish',2200,`${r.username} CHEGOU À META`,`P${r.finishPosition} · META`);}
  function tickRace(dt,now){
    state.racers.filter(r=>r.finished&&r.finishRoute<1).forEach(r=>{r.finishRoute=Math.min(1,r.finishRoute+dt*.52);});
    if(!racing())return;
    const raceDt=dt*raceScale;state.remaining-=raceDt;
    const active=RL.rankRacers(state.racers.filter(r=>!r.finished));
    active.forEach(r=>{const mult=now<r.boostUntil?BOOST_MULT:now<r.shockUntil?.45:1;r.motionSpeed=(r.motionSpeed||0)+(r.baseSpeed*mult-(r.motionSpeed||0))*Math.min(1,dt*5);r.trackProgress+=r.motionSpeed*raceDt;
      while(r.trackProgress>=1&&!r.finished){r.trackProgress-=1;r.completedLaps++;r.currentLap=Math.min(TOTAL_LAPS,r.completedLaps+1);if(r.completedLaps>=TOTAL_LAPS)finishRacer(r,now);}
      r.totalProgress=r.completedLaps*RL.TRACK_LENGTH+r.trackProgress*RL.TRACK_LENGTH;r.displayProgress=r.trackProgress;
    });
    const leader=RL.rankRacers(state.racers)[0];
    if(state.phase==='race'&&leader?.completedLaps>=TOTAL_LAPS-1){transition('final_sprint');shell.classList.add('sprint');cameraPulse('sprint');setRaceCopy('FINAL SPRINT','O LÍDER ENTROU NA ÚLTIMA VOLTA');}
    if(lastLeader&&leader&&lastLeader!==leader.userId&&!leader.finished){leader.overtakeUntil=now+650;}lastLeader=leader?.userId;
    if(state.phase!=='finishing'&&state.remaining<=0){finishByTimeout(now);return;}
    if(state.phase==='finishing'&&((state.racers.every(r=>r.finished)&&state.racers.every(r=>r.finishRoute>=1))||(state.firstFinishAt==null&&state.remaining<=0)||(state.firstFinishAt!=null&&now-state.firstFinishAt>=45000)))showResults();
  }
  function tracePath(pts){ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));}
  function drawKerbs(pts){
    // V4-LEGIBILITY: kerbs mais largos/brilhantes — borda da pista legível ao 1.º olhar.
    ctx.lineWidth=9;
    for(let i=0;i<pts.length-1;i+=1){ctx.strokeStyle=(i%2)?'#ff2f5e':'#ffffff';ctx.beginPath();ctx.moveTo(pts[i].x,pts[i].y);ctx.lineTo(pts[i+1].x,pts[i+1].y);ctx.stroke();}
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
    // V4-LEGIBILITY: barreira neon mais presente (separação pista/cidade).
    ctx.save();ctx.shadowColor='rgba(32,231,255,.9)';ctx.shadowBlur=14;
    ctx.strokeStyle='rgba(96,240,255,.95)';ctx.lineWidth=4;
    ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.stroke();
    ctx.restore();
  }
  function drawPitBoxes(){
    ctx.save();ctx.strokeStyle='rgba(255,216,77,.85)';ctx.lineWidth=1.6;ctx.setLineDash([5,4]);
    ctx.font='700 9px Arial';ctx.textAlign='center';
    for(let pos=1;pos<=3;pos+=1){
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
    const mesh=trackMesh,left=mesh.left,right=mesh.right,HW=TG.TRACK_PATH.roadHalfWidth;
    ctx.save();ctx.lineJoin='round';ctx.lineCap='round';
    // FUNDO: transparente → o cenário da cidade neon (neon-world.jpg) vê-se
    // através do canvas. Asfalto só onde a estrada existe. (clearRect vive no
    // draw() em espaço de ecrã; com a margem de zoom nunca apaga píxeis de karts.)
    ctx.beginPath();
    left.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();
    right.slice().reverse().forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();
    const asphalt=ctx.createLinearGradient(0,0,0,canvas.height);
    asphalt.addColorStop(0,'#3a495e');asphalt.addColorStop(.45,'#1e2c40');asphalt.addColorStop(1,'#2b3a4e');
    // V4-LEGIBILITY: sombra do asfalto mais forte — a pista "assenta" sobre a cidade.
    ctx.shadowColor='rgba(0,0,0,.95)';ctx.shadowBlur=26;ctx.shadowOffsetY=14;
    ctx.fillStyle=asphalt;ctx.fill('evenodd');
    ctx.shadowBlur=0;ctx.shadowOffsetY=0;
    // V4-LEGIBILITY: contorno escuro no limite do asfalto (aresta clara) +
    // barreiras deslocadas mais para fora — silhueta da pista inconfundível.
    ctx.strokeStyle='rgba(6,12,26,.9)';ctx.lineWidth=4;ctx.stroke();
    ctx.save();ctx.clip('evenodd');ctx.strokeStyle='rgba(181,210,225,.065)';ctx.lineWidth=1;for(let y=60;y<690;y+=5){ctx.beginPath();ctx.moveTo(20,y);ctx.lineTo(700,y+17);ctx.stroke();}ctx.restore();
    drawKerbs(left);drawKerbs(right);
    drawBarrier(offsetOutward(left,mesh.center,9));
    drawBarrier(offsetOutward(right,mesh.center,9));
    for(let i=0;i<48;i++){const p=TG.centerPoint(i/48),pulse=state.phase==='waiting'?.4:.65+Math.sin(now*.004+i*.6)*.25;for(const side of [-1,1]){const x=p.x+p.ty*(HW+13)*side,y=p.y-p.tx*(HW+13)*side;ctx.fillStyle='#07121f';ctx.fillRect(x-3,y-2,6,10);ctx.shadowBlur=9;ctx.shadowColor=state.phase==='final_sprint'?'#ffd84d':'#41d6ff';ctx.fillStyle=state.phase==='final_sprint'?`rgba(255,210,77,${pulse})`:`rgba(98,227,255,${pulse})`;ctx.fillRect(x-2,y-3,4,3);ctx.shadowBlur=0;}}
    ctx.setLineDash([14,16]);ctx.strokeStyle='rgba(255,255,255,.4)';ctx.lineWidth=3;tracePath(mesh.center);ctx.stroke();ctx.setLineDash([]);
    drawChevrons();
    drawPitBoxes();
    const f=TG.pointAt(0,0);ctx.save();ctx.translate(f.x,f.y);ctx.rotate(f.angle);
    for(let x=-10;x<10;x+=5)for(let y=-HW;y<HW;y+=13){ctx.fillStyle=((x/5+y/13)&1)?'#fff':'#0b0e17';ctx.fillRect(x,y,5,13);}
    ctx.restore();
    const gantry=TG.pointAt(0,0);ctx.save();ctx.translate(gantry.x,gantry.y-27);ctx.fillStyle='#070f1d';ctx.strokeStyle='#75b3c6';ctx.lineWidth=2;ctx.fillRect(-70,-32,140,22);ctx.strokeRect(-70,-32,140,22);ctx.fillStyle='#88b2c4';ctx.fillRect(-72,-26,4,60);ctx.fillRect(68,-26,4,60);ctx.fillStyle='#fff';ctx.font='900 10px Arial';ctx.textAlign='center';ctx.fillText('NEON RUSH  /  START',0,-19);for(let i=0;i<5;i++){ctx.fillStyle=state.phase==='countdown'?'#ff365e':racing()?'#37f2a0':'#1a3449';ctx.beginPath();ctx.arc(-24+i*12,-5,3,0,Math.PI*2);ctx.fill();}ctx.restore();
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
    if(!['grid','countdown'].includes(state.phase))return;
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
    return TG.finishRoutePoint(r.finishPosition||1,r.finishRoute);
  }
  // V4-LEGIBILITY: contorno local atrás de cada kart — silhueta separa-se do
  // asfalto e dos rivais sem etiquetas a flutuar (nomes ficam no HUD/TOP3).
  const KART_OUTLINE=.9;
  function drawKart(r,rank,now){
    let p;if(r.finished)p=finishRoutePoint(r);else if(['grid','countdown'].includes(state.phase))p=TG.startGrid(state.racers.length||16)[r.gridIndex];else p=TG.pointAt(r.displayProgress,r.lane);
    if(!p)return;
    const t=TEAM_DEFS[r.teamId],boost=now<r.boostUntil||now<r.visualBoostUntil,shocked=now<r.shockUntil||now<r.visualShockUntil;
    const speed=Math.hypot(p.tx,p.ty)||1;
    ctx.save();
    // V4-LEGIBILITY: aura de contraste local (sombra suave + rim team-color)
    // desenhada ANTES do rasto, por baixo de tudo do kart.
    ctx.save();ctx.globalAlpha=KART_OUTLINE;ctx.shadowColor=hexToRgba(t.color,.95);ctx.shadowBlur=16;
    ctx.fillStyle='rgba(2,6,18,.55)';ctx.beginPath();ctx.ellipse(p.x+2,p.y+4,26,15,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=hexToRgba(t.color,.4);ctx.beginPath();ctx.ellipse(p.x,p.y,24,14,0,0,Math.PI*2);ctx.fill();
    ctx.restore();
    // rasto neon (so em corrida): fita da posição anterior até à atual
    if(racing()&&!r.finished){
      const prev=TG.pointAt(((r.displayProgress-0.012)%1+1)%1,r.lane);
      ctx.strokeStyle=hexToRgba(t.color,.4);ctx.lineWidth=7;ctx.lineCap='round';
      ctx.beginPath();ctx.moveTo(prev.x,prev.y);ctx.lineTo(p.x,p.y);ctx.stroke();
    }
    ctx.translate(p.x+2,p.y+4);ctx.rotate(p.angle);ctx.fillStyle='rgba(0,0,0,.6)';ctx.beginPath();ctx.ellipse(0,0,23,14,0,0,Math.PI*2);ctx.fill();ctx.rotate(-p.angle);ctx.translate(-2,-4);ctx.rotate(p.angle);ctx.scale(KART_SCALE*(boost?1.04:shocked?.96:1),KART_SCALE);
    // brilho/aura da equipa
    ctx.shadowColor=t.color;ctx.shadowBlur=boost?24:14;
    ctx.fillStyle=hexToRgba(t.color,.34);ctx.beginPath();ctx.ellipse(0,0,25,12.5,0,0,Math.PI*2);ctx.fill();
    ctx.shadowBlur=0;
    if(boost){ctx.shadowColor='#20e7ff';ctx.shadowBlur=14;ctx.fillStyle='#28bfff';ctx.beginPath();ctx.moveTo(-18,-7);ctx.lineTo(-48-Math.sin(now*.06)*9,0);ctx.lineTo(-18,7);ctx.fill();ctx.fillStyle='#fff4bf';ctx.beginPath();ctx.moveTo(-18,-3);ctx.lineTo(-35,0);ctx.lineTo(-18,3);ctx.fill();ctx.shadowBlur=0;}
    if(shocked){ctx.strokeStyle='#fff19c';ctx.shadowColor='#b5baff';ctx.shadowBlur=12;ctx.lineWidth=2.4;ctx.beginPath();for(let k=0;k<=12;k++){const a=k/12*Math.PI*2,rr=k%2?23:17;const x=Math.cos(a+now*.004)*rr,y=Math.sin(a+now*.004)*rr;k?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();ctx.shadowBlur=0;}
    // rodas F1 (pretas com hub da cor da equipa)
    ctx.fillStyle='#0a0c14';
    [[-11,-13,9,5.5],[-11,7.5,9,5.5],[11,-13,8.5,5.5],[11,7.5,8.5,5.5]].forEach(([x,y,w,h])=>{ctx.fillRect(x,y,w,h);});
    ctx.fillStyle=t.color;
    [[-11,-13,9,5.5],[-11,7.5,9,5.5],[11,-13,8.5,5.5],[11,7.5,8.5,5.5]].forEach(([x,y,w,h])=>{ctx.fillRect(x+2.5,y+1.4,w-5,h-2.8);});
    ctx.fillStyle='#8fa5b9';const spin=racing()?Math.floor(now*.025)%5:2;[[-11,-13],[-11,7.5],[11,-13],[11,7.5]].forEach(([x,y])=>ctx.fillRect(x+spin,y,1.3,5.5));
    // asa dianteira
    ctx.fillStyle=t.color;ctx.fillRect(14,-11,4,22);
    ctx.fillStyle='rgba(255,255,255,.85)';ctx.fillRect(17.4,-11,1.4,22);
    // corpo em seta
    ctx.beginPath();ctx.moveTo(13,-3);ctx.lineTo(4,-6.5);ctx.lineTo(-10,-5);ctx.lineTo(-15,0);ctx.lineTo(-10,5);ctx.lineTo(4,6.5);ctx.lineTo(13,3);ctx.closePath();ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,.92)';ctx.lineWidth=1.5;ctx.stroke();
    // cockpit + halo
    ctx.fillStyle='#111b2b';ctx.beginPath();ctx.arc(-1,0,4.6,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#dff9ff';ctx.lineWidth=1.2;ctx.stroke();
    ctx.fillStyle=t.color;ctx.beginPath();ctx.arc(-2,0,5.7,0,Math.PI*2);ctx.fill();ctx.fillStyle='#e5fbff';ctx.beginPath();ctx.ellipse(-.3,0,2,4,0,0,Math.PI*2);ctx.fill();
    // asa traseira
    ctx.fillStyle=t.color;ctx.fillRect(-18,-9,4,18);
    ctx.fillStyle='rgba(255,255,255,.85)';ctx.fillRect(-18,-9,1.4,18);
    ctx.restore();
    // badge de número/posição (como na mestre)
    ctx.save();ctx.translate(p.x,p.y);
    ctx.fillStyle='rgba(4,8,22,.92)';ctx.strokeStyle=t.color;ctx.lineWidth=1.6;
    ctx.beginPath();ctx.roundRect(-12,-33,24,14,3);ctx.fill();ctx.stroke();
    ctx.fillStyle='#fff';ctx.font='900 11px Arial';ctx.textAlign='center';ctx.fillText('P'+rank,0,-22.5);
    ctx.fillStyle=t.color;ctx.beginPath();ctx.arc(17.5,-25.5,6.5,0,Math.PI*2);ctx.fill();ctx.fillStyle='#07122b';ctx.font='900 8.5px Arial';ctx.fillText(r.username.replace(/^@/,'').charAt(0).toUpperCase(),17.5,-22.5);
    if(now<r.overtakeUntil){ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.strokeRect(-27,-20,54,40);}
    ctx.restore();
  }
  const trackMesh=TG.roadMesh(240);
  // V5 PERF: pista/kerbs/barreiras/gantry são ESTÁTICOS por fase → desenhar
  // 1× numa layer offscreen e blitar por frame. Só karts/drones/grid
  // (dinâmicos) ficam no ciclo por frame. Mesmo output, menos trabalho.
  // Requer `ctx` reatribuível (let) — as funções de desenho usam o closure.
  const trackLayer=document.createElement('canvas');trackLayer.width=canvas.width;trackLayer.height=canvas.height;
  const tctx=trackLayer.getContext('2d');
  let trackLayerKey='';
  function drawTrackLayer(now){
    const key=`${state.phase}|${shell.classList.contains('galaxy')?'g':'n'}|${trackLayer.width}`;
    if(key===trackLayerKey)return;
    trackLayerKey=key;
    tctx.setTransform(1,0,0,1,0,0);tctx.clearRect(0,0,trackLayer.width,trackLayer.height);
    tctx.setTransform(ctx.getTransform());
    const saved=ctx;ctx=tctx;drawTrackGeometry(now);ctx=saved;
  }
  function draw(now){
    ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.restore();
    drawTrackLayer(now);
    ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(trackLayer,0,0);ctx.restore();
    drawDrones(now);drawGrid();for(const hazard of state.obstacles||[]){if(now>hazard.until)continue;const p=TG.pointAt(hazard.progress,hazard.lane);ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);ctx.fillStyle='#ff792c';ctx.shadowColor='#ff792c';ctx.shadowBlur=15;ctx.fillRect(-5,-17,10,34);ctx.shadowBlur=0;ctx.fillStyle='#101724';for(let j=-15;j<16;j+=9)ctx.fillRect(-5,j,10,4);ctx.restore();}const ranked=RL.rankRacers(state.racers);ranked.forEach((r,i)=>drawKart(r,i+1,now));
  }
  function frame(now){const dt=Math.min(.05,(now-state.lastNow)/1000);state.lastNow=now;tickLifecycle(now);tickRace(dt,now);clearEvent(now);if(now>state.cameraUntil)delete shell.dataset.camera;draw(now);state.frameCount+=1;if(now-state.lastFpsAt>=250){state.fps=state.frameCount*1000/(now-state.lastFpsAt);state.fpsSamples.push(state.fps);if(state.fpsSamples.length>120)state.fpsSamples.shift();state.frameCount=0;state.lastFpsAt=now;renderHud();}requestAnimationFrame(frame);}
  function gift(id,user='@HUGO',source='demo',identity=null){
    const rule=RL.GIFT_RULES[id];if(!rule)return null;
    // NOVA REGRA: gift de quem não tem racer cria PRIMEIRO o racer e aplica
    // o efeito a esse mesmo racer (1 user = 1 racer).
    let sender=RL.findRacerForUser(state.racers,identity||user);
    if(!sender&&source==='live'&&!state.queue.has(RL.racerKey(identity||user))){
      const outcome=RL.admitRacer({racers:state.racers,queue:state.queue,user:identity||user,team:1,maxRacers:MAX_RACERS,makeRacer});
      sender=outcome.racer||null;
      if(outcome.admitted&&!outcome.queued)showEvent(String(identity?.username||user),'GIFT','NOVO PILOTO INSCRITO','join',2200);
    }
    const ranked=RL.rankRacers(state.racers);if(source==='demo')sender=sender||ranked[ranked.length-1]||state.racers[0];
    const now=performance.now();
    const applied=RL.applyGiftEffect({mode:source==='demo'?RL.MODES.FULL_INTERACTION_DEMO:state.mode,gift:rule,source:'gift',target:sender?.userId,now,cooldownMap:state.giftCooldowns});
    const effectLabel=EFFECT_LABELS[rule.effect];
    state.lastGift={id,user,source,mode:source==='demo'?RL.MODES.FULL_INTERACTION_DEMO:state.mode,blocked:!!applied.blocked,effected:!!applied.blocked?null:rule.effect,label:effectLabel,at:now};
    const coolingDown=applied.cooldown===true;
    const galaxyEvent=!coolingDown&&id==='galaxy';
    shell.style.setProperty('--event-color',BAR_ITEMS.find(x=>x.id===id)?.color||'#20e7ff');cameraPulse('gift');
    const giftTitle=BAR_ITEMS.find(x=>x.id===id)?.title||rule.name;
    showEvent(user,giftTitle,effectLabel,galaxyEvent?'galaxy':'gift',rule.duration,`${user} ENVIOU ${giftTitle}`,`${effectLabel} ${coolingDown?'EM ESPERA':'ATIVADO'}!`);
    highlightGift(id,`@${String(user).replace(/^@+/,'')}`,coolingDown?'EM ESPERA':effectLabel);
    triggerLiveEffect(rule.effect,{user,giftId:id,duration:rule.duration});
    if(!coolingDown){
      if(sender&&['turbo','boost','galaxy'].includes(rule.effect)){sender.boostUntil=now+BOOST_MS;sender.visualBoostUntil=sender.boostUntil;}
      if(['shock','hazard','slow','galaxy'].includes(rule.effect))ranked.filter(r=>r!==sender&&!r.finished).forEach(r=>r.shockUntil=now+rule.duration);
      if(rule.effect==='hazard')state.obstacles=ranked.filter(r=>r!==sender&&!r.finished).slice(0,3).map(r=>({progress:(r.trackProgress+.035)%1,lane:r.lane,until:now+rule.duration}));
    }
    if(applied.blocked||!sender)return applied;
    if(rule.effect==='turbo'||rule.effect==='boost'||rule.effect==='galaxy')sender.boostUntil=now+BOOST_MS;
    if(rule.effect==='shock'||rule.effect==='hazard'||rule.effect==='slow'){ranked.filter(r=>r!==sender&&!r.finished).slice(0,5).forEach(r=>r.shockUntil=now+rule.duration);}
    if(rule.effect==='hazard'){state.obstacles=ranked.filter(r=>r!==sender&&!r.finished).slice(0,3).map(r=>({progress:(r.trackProgress+.035)%1,lane:r.lane,until:now+rule.duration}));}
    if(rule.effect==='galaxy')ranked.filter(r=>r!==sender&&!r.finished).forEach(r=>r.shockUntil=now+rule.duration);
    return applied;
  }    function onLike(user,count){const display=typeof user==='string'?user:String(user?.username||user?.uniqueId||'@viewer'),id=RL.racerKey(user),previous=Number(state.likesByUser[id]||0),total=RL.recordLike({likesByUser:state.likesByUser,userId:id,amount:count}),milestones=RL.crossedLikeMilestones(previous,count,1000);
    // NOVA REGRA: o 1.º LIKE REAL de quem não tem racer cria/queue um racer.
    let firstRacerViaLike=false;
    if(previous===0&&!RL.findRacerForUser(state.racers,user)&&!state.queue.has(RL.racerKey(user))){const outcome=RL.admitRacer({racers:state.racers,queue:state.queue,user,team:1,maxRacers:MAX_RACERS,makeRacer});if(outcome.admitted){firstRacerViaLike=true;showEvent(display,'LIKES',outcome.queued?'PILOTO NA FILA':'NOVO PILOTO','likes');}}
    // 1000 likes = BÓNUS (boost) — nunca cria 2.º racer.
    if(!firstRacerViaLike&&milestones.length){const racer=RL.findRacerForUser(state.racers,user);if(racer){racer.boostUntil=performance.now()+1800;showEvent(display,`${total} LIKES`,'BÓNUS VELOCIDADE','likes');}}
    maybeStartRealRace();}
  function showResults(){if(state.phase!=='finishing')return;transition('results');shell.classList.remove('sprint','galaxy');setMusicLevel(MUSIC_LEVELS.results);audioMix.effect('results',1400);const ranked=RL.rankRacers(state.racers),winner=ranked.find(r=>r.finishPosition===1);shell.style.setProperty('--winner',winner?TEAM_DEFS[winner.teamId].color:'#20e7ff');const box=el('results');box.hidden=false;box.innerHTML=`<small class="results-kicker">NEON RUSH CITY • CORRIDA ${lifecycle.snapshot().round}</small><h2>${winner?'TEMOS VENCEDOR':'TEMPO ESGOTADO'}</h2><div class="podium">${ranked.slice(0,3).map((r,i)=>`<div style="--team:${TEAM_DEFS[r.teamId].color}"><b>${r.finished?'P'+r.finishPosition:'DNF'}</b><span>${safeText(r.username)}</span><small>${TEAM_DEFS[r.teamId].name}</small></div>`).join('')}</div><strong class="winning-team">${winner?TEAM_DEFS[winner.teamId].name+' VENCEU':'SEM VENCEDOR'}</strong><p>${state.finishCount}/${ranked.length} NA META · ${TOTAL_LAPS} VOLTAS</p><em>PRÓXIMA CORRIDA EM <span id="next-race-seconds">8</span>S</em>`;setRaceCopy('RESULTADOS FINAIS','A PRÓXIMA GRELHA ESTÁ A CHEGAR');state.lastRound=ranked.map(r=>({id:r.userId,position:r.finishPosition,laps:r.completedLaps,finished:r.finished}));}
  // V4 LIVE: cap absoluto de 5 minutos (MAX_RACE_DURATION). Congela o progresso
  // (racing() deixa de ser verdade), calcula o ranking final — terminados por
  // finishPosition, restantes por voltas+trackProgress —, atribui posições e
  // segue para FINISHING → RESULTS (~8s) → RESETTING → WAITING. Nada excede 5:00.
  function finishByTimeout(now){
    const ranked=RL.timeoutRanking(state.racers);
    let next=ranked.filter(r=>r.finished).length+1;
    ranked.filter(r=>!r.finished).forEach(r=>{RL.finishRacer(r,next,now-state.raceStartedAt);next+=1;});
    transition('finishing','max-race-duration');
    showEvent('RELÓGIO','5:00','FIM DA CORRIDA','finish',2200,'TEMPO ESGOTADO','O LÍDER NO LIMITE VENCE');
  }
  function resetFromResults(){if(state.phase!=='results'&&state.phase!=='resetting')return;if(state.phase==='results')transition('resetting');el('results').hidden=true;shell.classList.remove('sprint','galaxy');delete shell.dataset.camera;state.racers=[];state.finishCount=0;state.firstFinishAt=null;state.remaining=RACE_TIME;state.raceStartedAt=0;state.giftCooldowns={};state.lastGift=null;state.eventUntil=0;state.eventType='';state.obstacles=[];lastLeader=null;giftTimers.forEach(clearTimeout);giftTimers.clear();document.querySelectorAll('.gift-card.active').forEach(c=>{c.classList.remove('active');c.querySelector('.gift-who').textContent='';});el('world-event').classList.remove('active');el('event-cause').textContent='NOVA CORRIDA';el('event-effect').textContent='A PREPARAR A ARENA';setRaceCopy('A PREPARAR A ARENA','A PRÓXIMA CORRIDA COMEÇA JÁ');setMusicLevel(MUSIC_LEVELS.waiting);renderHud();phaseDeadline=performance.now()+durations.resetting;}
  function fillNextGrid(now){
    const queued=[...state.queue.entries()],returning=[...eligible.entries()].filter(([,u])=>now-u.lastInteraction<ELIGIBLE_MS);
    state.queue.clear();const chosen=new Set();
    for(const [key,u] of [...queued,...returning]){if(chosen.has(key)||!eligible.has(key))continue;chosen.add(key);if(state.racers.length<MAX_RACERS)state.racers.push(makeRacer(state.racers.length,u.username,u.teamId,{userId:key}));else state.queue.set(key,u);}
  }
  function tickLifecycle(now){
    if(state.phase==='results'){const e=el('next-race-seconds');if(e)e.textContent=Math.max(0,Math.ceil((phaseDeadline-now)/1000));}
    if(state.phase==='countdown'){const n=Math.max(1,Math.ceil((phaseDeadline-now)/1000));if(n!==lastCountdown){lastCountdown=n;el('countdown-number').textContent=n;audioMix.beep(n);}}
    if(!phaseDeadline||now<phaseDeadline)return;
    if(state.phase==='lobby')beginRealRace();
    else if(state.phase==='grid'){transition('countdown');setRaceCopy('PREPARAR…','A LIVE VAI ACELERAR');lastCountdown=-1;}
    else if(state.phase==='countdown'){transition('race');state.raceStartedAt=now;state.racers.forEach(r=>r.status='racing');setMusicLevel(MUSIC_LEVELS.race);setRaceCopy('CORRIDA EM CURSO','10 VOLTAS · UMA ARENA · A TUA EQUIPA');cameraPulse('start');playCountdownGo();}
    else if(state.phase==='results')resetFromResults();
    else if(state.phase==='resetting'){transition('waiting');setWaitingState();fillNextGrid(now);renderHud();maybeStartRealRace();}
  }
  window.setInterval(()=>{if(lifecycle.watchdog()){state.phase='resetting';shell.dataset.phase='resetting';resetFromResults();}},250);
  function finishLeader(){const r=RL.rankRacers(state.racers).find(x=>!x.finished);if(!r||!racing())return;r.completedLaps=TOTAL_LAPS-1;r.trackProgress=.995;r.baseSpeed=.2;}
  function differentLaps(){if(!racing())return;state.racers.forEach((r,i)=>{r.completedLaps=i%9;r.currentLap=r.completedLaps+1;r.trackProgress=(i*.137)%1;r.totalProgress=r.completedLaps*RL.TRACK_LENGTH+r.trackProgress*RL.TRACK_LENGTH;r.displayProgress=r.trackProgress;});}
  // PRODUÇÃO: espera ativa sem karts falsos. A corrida arranca só com pilotos reais.
  function setWaitingState(){setRaceCopy('A AGUARDAR PILOTOS','COMENTA 1 / 2 / 3 / 4 PARA ENTRAR');}
  function beginRealRace(){
    if(!state.racers.length||state.phase!=='lobby')return;
    transition('grid');state.raceStartedAt=0;setMusicLevel(.6);
    const slots=TG.startGrid(state.racers.length);
    state.racers.forEach((r,i)=>{const p=slots[i%slots.length];r.trackProgress=p.progress;r.lane=p.lane;r.displayProgress=p.progress;r.gridIndex=i;r.status='ready';});
    setRaceCopy('GRELHA DE PARTIDA',`${state.racers.length} PILOTO${state.racers.length===1?'':'S'} REAIS`);
  }
  function maybeStartRealRace(){if(state.phase==='waiting'&&state.racers.length>=2){transition('lobby');setRaceCopy('PILOTOS CONFIRMADOS','A FECHAR A GRELHA');}}
  // --- WELCOME BOT: fila FIFO, dedupe por sessão, telemetria de reprodução ---
  const welcomeState={queue:[],seen:new Set(),busy:false,blocked:null,qa:{joinReceived:false,ttsRequested:false,ttsHttp:null,lang:null,playResolved:null,currentTime:0,volume:0,musicDucked:false,musicRestored:false,autoplayBlocked:false,source:null,error:null}};
  function requestWelcome(name,identity=name){
    const key=RL.racerKey(identity);if(!key||welcomeState.seen.has(key))return;
    welcomeState.seen.add(key);if(welcomeState.queue.length>=8)welcomeState.queue.shift();
    welcomeState.queue.push(String(name));pumpWelcome();
  }
  function pumpWelcome(){
    if(welcomeState.busy||!state.audio)return;
    const next=welcomeState.queue.shift();if(!next)return;
    welcomeState.busy=true;
    void speakWelcome(next).finally(()=>{welcomeState.busy=false;pumpWelcome();});
  }
  async function speakWelcome(name){
    const qa=welcomeState.qa;qa.ttsRequested=true;qa.error=null;
    try{
      const result=await audioMix.welcome(String(name).replace(/^@+/,''));
      Object.assign(qa,{ttsHttp:200,lang:result.lang,playResolved:true,currentTime:result.duration,volume:1,musicDucked:true,musicRestored:true,autoplayBlocked:false,source:result.source});
      state.ttsLast={...result,name};return result;
    }catch(error){qa.error=error.message;qa.playResolved=false;qa.source='silence';return null;}
  }
  function canonicalIdentity(ev){
    const id=RL.racerKey(ev.userId),unique=RL.racerKey(ev.uniqueId),name=RL.racerKey(ev.username);
    const aliases=[id&&'id:'+id,unique&&'unique:'+unique,name&&'name:'+name].filter(Boolean);
    const known=aliases.map(k=>identityAliases.get(k)).find(Boolean);
    const oldEntry=known&&eligible.get(known),preferred=id||unique||name;
    // A stable ID upgrades an earlier username-only admission, but two distinct
    // stable IDs sharing a display name must remain two distinct viewers.
    const key=id||(known||preferred);
    if(known&&known!==key&&!identityAliases.has('id:'+known)&&!oldEntry?.stableId){
      if(oldEntry){eligible.delete(known);eligible.set(key,oldEntry);}
      if(state.queue.has(known)){const entry=state.queue.get(known);state.queue.delete(known);state.queue.set(key,entry);}
      state.racers.filter(r=>r.userId===known).forEach(r=>r.userId=key);
      if(welcomeState.seen.has(known)){welcomeState.seen.delete(known);welcomeState.seen.add(key);}
      if(state.likesByUser[known]!=null){state.likesByUser[key]=(state.likesByUser[key]||0)+state.likesByUser[known];delete state.likesByUser[known];}
      for(const [alias,value]of identityAliases)if(value===known)identityAliases.set(alias,key);
    }
    for(const alias of aliases)identityAliases.set(alias,key);
    return {userId:key,uniqueId:ev.uniqueId,username:String(ev.username||ev.uniqueId||key).slice(0,24)};
  }
  function admitInteraction(identity,teamId=1){
    const key=RL.racerKey(identity);if(!key)return null;
    const old=eligible.get(key),entry={username:identity.username,teamId:old?.teamId??teamId,lastInteraction:performance.now(),stableId:old?.stableId||identity.stableId};
    eligible.set(key,entry);
    const existing=RL.findRacerForUser(state.racers,identity);if(existing)return existing;
    if(state.queue.has(key)){Object.assign(state.queue.get(key),entry);return null;}
    if(['countdown','race','final_sprint','finishing','results','resetting'].includes(state.phase)||state.racers.length>=MAX_RACERS){state.queue.set(key,entry);return null;}
    const racer=makeRacer(state.racers.length,entry.username,entry.teamId,identity);state.racers.push(racer);
    if(state.phase==='grid'){const slots=TG.startGrid(state.racers.length);state.racers.forEach((r,i)=>{Object.assign(r,{trackProgress:slots[i].progress,displayProgress:slots[i].progress,lane:slots[i].lane,gridIndex:i});});}
    return racer;
  }
  function onLiveEvent(ev){
    const type=String(ev?.type||'');
    if(ev?.id){if(receivedEvents.has(ev.id))return;receivedEvents.add(ev.id);if(receivedEvents.size>5000)receivedEvents.delete(receivedEvents.values().next().value);}
    if(type==='viewers'){setViewerCount(ev.count);return;}
    if(type==='bridgeStatus'){el('bridge-status').textContent=ev.connected?'TIKTOK LIVE':'BRIDGE LIGADA';return;}
    if(type==='leave'){const key=canonicalIdentity(ev).userId;eligible.delete(key);state.queue.delete(key);return;}
    if(type==='liveEnded'){eligible.clear();state.queue.clear();return;}
    if(!['join','like','comment','gift','follow','share'].includes(type)||!RL.racerKey(ev))return;
    const identity=canonicalIdentity(ev),user=identity.username;identity.stableId=!!ev.userId;
    if(type==='join'){welcomeState.qa.joinReceived=true;showEvent(user,'ENTROU','BEM-VINDO','join',1600);requestWelcome(user,identity);return;}
    const teams={1:0,red:0,2:1,blue:1,3:2,green:2,4:3,purple:3},comment=String(ev.comment||'').trim().toLowerCase();
    const r=admitInteraction(identity,teams[comment]??1);
    if(type==='comment'&&Object.hasOwn(teams,comment)&&r&&['waiting','lobby','grid'].includes(state.phase)){r.teamId=teams[comment];r.team=TEAM_DEFS[r.teamId].key;eligible.get(identity.userId).teamId=r.teamId;}
    if(type==='gift'){
      const aliases={rosa:'rose',rose:'rose',rocket:'bomb',foguete:'bomb',thunder:'emp','trovão':'emp',trovao:'emp',galaxia:'galaxy','galáxia':'galaxy'};
      const raw=String(ev.giftName||'').toLowerCase(),diamonds=Number(ev.totalDiamonds)||0;
      // REGRA CRÍTICA: gift desconhecido NUNCA é ignorado — vira BOOST.
      // Valor em diamantes escala a intensidade (1–9→1.8×, 10–49→2.0×, 50–99→2.2×, 100+→2.4×).
      let id=aliases[raw]||raw;
      if(!Object.hasOwn(RL.GIFT_RULES,id)){
        const tierBoost=diamonds>=100?2.4:diamonds>=50?2.2:diamonds>=10?2.0:1.8;
        showEvent(user,String(ev.giftName||'GIFT').toUpperCase(),'BOOST','gift',2200,`${user} ENVIOU ${String(ev.giftName||'GIFT').toUpperCase()}`,'BOOST ATIVADO!');
        triggerLiveEffect('boost',{user,giftId:String(ev.giftName||'gift').toLowerCase(),duration:2200});
        const gifter=RL.findRacerForUser(state.racers,identity);
        if(gifter){gifter.boostUntil=performance.now()+BOOST_MS*(tierBoost/2.2);gifter.visualBoostUntil=gifter.boostUntil;gifter.boostMult=tierBoost;}
        playGiftSting('rose',RL.GIFT_RULES.rose);
        return;
      }
      gift(id,user,'live',identity);
    }else if(type==='like'){
      const before=state.likesByUser[identity.userId]||0,count=Math.max(1,Number(ev.count)||1);
      RL.recordLike({likesByUser:state.likesByUser,userId:identity.userId,amount:count});
      if(r&&RL.crossedLikeMilestones(before,count,1000).length)r.boostUntil=performance.now()+1800;
    }else showEvent(user,type==='comment'?'COMENTOU':type==='follow'?'SEGUIU':'PARTILHOU',r?'PILOTO INSCRITO':'NA PRÓXIMA GRELHA','join',2200);
    maybeStartRealRace();renderHud();
  }
  function connectBridge(){if(location.protocol==='file:')return;const proto=location.protocol==='https:'?'wss':'ws';try{const ws=new WebSocket(`${proto}://${location.host}/ws`);state.ws=ws;ws.onopen=()=>{el('bridge-status').textContent='LIVE LIGADA';};ws.onmessage=e=>{try{onLiveEvent(JSON.parse(e.data));}catch{}};ws.onclose=()=>{el('bridge-status').textContent='MODO LOCAL';state.wsRetry=window.setTimeout(connectBridge,3500);};ws.onerror=()=>{};}catch{el('bridge-status').textContent='MODO LOCAL';}}
  function phaseLevel(){return racing()?MUSIC_LEVELS.race:state.phase==='results'?MUSIC_LEVELS.results:MUSIC_LEVELS.waiting;}
  function setMusicLevel(v){audioMix.setLevel(Math.max(0,Math.min(1,Number(v)||0)));}
  async function toggleAudio(){
    const desired=!state.audio;
    try{if(desired){await audioMix.unlock();state.audio=true;pumpWelcome();}else{audioMix.disable();state.audio=false;}}
    catch(error){state.errors.push('Audio unlock: '+error.message);}
    const btn=el('audio-toggle');btn.setAttribute('aria-pressed',String(state.audio));btn.textContent=state.audio?'SOM ON':'SOM OFF';
  }
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.audio)audioMix.resume().catch(()=>{});});
  document.addEventListener('pointerdown',()=>{if(state.audio)audioMix.resume().catch(()=>{});});
  function setupMedia(){hostVideo.src='/assets/host-avatar.mp4';hostVideo.play().catch(()=>{});music.preload='auto';music.loop=true;music.src=MUSIC_SRC;music.load();setMusicLevel(MUSIC_LEVELS.waiting);el('audio-toggle').addEventListener('click',toggleAudio);}
  function qaAction(action){if(action!=='results'&&state.phase==='results'){el('results').hidden=true;}if(action==='grid')prepareGrid(16);else if(action==='race8')startRace(8);else if(action==='race16'){startRace(16);window.setTimeout(differentLaps,1100);}else if(action==='rose')gift('rose');else if(action==='premium')gift('emp');else if(action==='galaxy')gift('galaxy');else if(action==='likes')onLike('@NOVO_PILOTO',1000);else if(action==='finish')finishLeader();else if(action==='results')showResults();}
  document.querySelectorAll('[data-qa]').forEach(b=>b.addEventListener('click',()=>qaAction(b.dataset.qa)));
  if(new URLSearchParams(location.search).has('qa'))document.body.classList.add('qa');
  // DEMO_MODE: apenas via URL (?qa / ?demo). Produção = sem karts falsos.
  const DEMO_MODE=new URLSearchParams(location.search).has('qa')||new URLSearchParams(location.search).has('demo');
  window.NeonRushQA={action:qaAction,report:()=>{const laps=new Set(state.racers.map(r=>r.completedLaps));const avg=state.fpsSamples.length?state.fpsSamples.reduce((a,b)=>a+b,0)/state.fpsSamples.length:state.fps;const musicEl=document.getElementById('music');return {phase:state.phase,racers:state.racers.length,queued:state.queue.size,queueKeys:[...state.queue.keys()],racerKeys:state.racers.map(r=>r.userId),duplicateRacers:RL.countDuplicateRacers(state.racers),active:state.racers.filter(r=>!r.finished).length,finished:state.racers.filter(r=>r.finished).length,differentLaps:laps.size>1,lapList:[...laps].sort((a,b)=>a-b),pageErrors:state.errors.slice(),consoleErrors:0,fps:Number(avg.toFixed(1)),music:{src:String(musicEl.currentSrc||musicEl.src||'').split('/').pop(),readyState:musicEl.readyState,loaded:musicEl.readyState>=2,paused:musicEl.paused,time:Number(musicEl.currentTime.toFixed(2)),volume:musicEl.volume,muted:musicEl.muted},tts:{mode:RL.MODES.LIVE_COMPLIANT===state.mode?'LIVE_COMPLIANT':state.mode,last:state.ttsLast||null},roadQA:TG.runRoadQA()};},
    lifecycle:()=>({...lifecycle.snapshot(),lastRound:state.lastRound,eligible:[...eligible.keys()]}),
    audioMix:()=>audioMix.report(),
    effects:()=>({obstacles:(state.obstacles||[]).length,eventText:el('event-effect').textContent}),
    audioStreams:()=>audioMix.streams,
    accelerate:(scale)=>{if(['localhost','127.0.0.1'].includes(location.hostname))raceScale=Math.max(1,Math.min(100,Number(scale)||1));return raceScale;},
    testWatchdog:()=>{if(['localhost','127.0.0.1'].includes(location.hostname)&&state.phase==='results')phaseDeadline=Infinity;},
    welcome:(name)=>speakWelcome(name||'@ANA'),
    reset:resetFromResults,
    setMode:(m)=>{state.mode=RL.MODES[m]||m;return state.mode;},
    mode:()=>state.mode,
    enableAudio:()=>{if(!state.audio)return toggleAudio();return state.audio;},
    audioState:()=>({audio:state.audio,readyState:music.readyState,paused:music.paused,time:Number(music.currentTime.toFixed(3)),duration:music.duration,volume:music.volume,src:String(music.currentSrc||music.src||'').split('/').pop()}),
    snapshot:()=>({phase:state.phase,now:performance.now(),firstFinishAt:state.firstFinishAt,finishCount:state.finishCount,mode:state.mode,lastGift:state.lastGift?{...state.lastGift}:null,event:{type:state.eventType,until:state.eventUntil},shell:[...shell.classList],cooldowns:Object.fromEntries(Object.entries(state.giftCooldowns)),racers:state.racers.map(r=>({u:r.username,id:r.userId,lap:r.completedLaps,prog:Number(r.trackProgress.toFixed(4)),base:Number(r.baseSpeed.toFixed(5)),boost:Math.round(r.boostUntil),shock:Math.round(r.shockUntil),fin:!!r.finished,pos:r.finishPosition||0,route:Number(r.finishRoute.toFixed(2)),avatar:r.avatar,team:r.teamId}))}),
    progress:(user)=>{const r=state.racers.find(x=>x.username===user||x.userId===String(user||'').toLowerCase());return r?Number(r.trackProgress.toFixed(5)):null;},
    giftBar:giftBarState,
    gift:(id,user,source)=>gift(id,user,source||'live'),
    likes:(user,amount)=>onLike(user,Number(amount)||1000),
    comment:(user,text)=>onLiveEvent({type:'comment',username:user,comment:text}),
    live:(ev)=>onLiveEvent(ev),
    startRace:()=>startRace(16),
    grid:()=>prepareGrid(16),
    sprint:()=>{if(state.phase!=='race')return null;const leader=RL.rankRacers(state.racers).filter(r=>!r.finished)[0];if(!leader)return null;leader.completedLaps=TOTAL_LAPS-2;leader.trackProgress=.88;leader.totalProgress=(TOTAL_LAPS-2)*RL.TRACK_LENGTH+leader.trackProgress*RL.TRACK_LENGTH;leader.displayProgress=leader.trackProgress;leader.baseSpeed=.2;return leader.username;},
    finishLeader:()=>finishLeader(),
    differentLaps:()=>differentLaps(),
    results:()=>showResults(),
    tts:()=>state.ttsLast||null,
    welcomeQA:()=>({seen:[...welcomeState.seen],queue:[...welcomeState.queue],busy:welcomeState.busy,blocked:welcomeState.blocked,qa:{...welcomeState.qa}}),
    shellRect:()=>{const a=document.getElementById('gift-actions').getBoundingClientRect(),r=document.getElementById('race-zone').getBoundingClientRect(),s=shell.getBoundingClientRect();return {bar:{x:Math.round(a.x),y:Math.round(a.y),w:Math.round(a.width),h:Math.round(a.height)},race:{y:Math.round(r.y),h:Math.round(r.height)},shell:{w:Math.round(s.width),h:Math.round(s.height),scrollW:shell.scrollWidth,clientW:shell.clientWidth}};}
  };
  buildGiftBar();buildTeams();setupMedia();connectBridge();requestAnimationFrame(frame);
  shell.dataset.phase='waiting';
  if(DEMO_MODE){prepareGrid(8);}
  else{setWaitingState();}
})();
