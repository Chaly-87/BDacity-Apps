(function(root){
  'use strict';
  // One persistent graph for every audible source; the recording tap is the
  // exact same limited mix sent to the speakers, never a replacement soundtrack.
  // V5 SHOW: ducking por evento, fila de prioridade (welcome TTS > galaxy >
  // explosão/shock > boost > comic) e SFX sintetizados agressivos.
  const DUCK={welcome:.10,boost:.3,explosion:.2,shock:.2,galaxy:.15,countdown:.5};
  const SFX_PRIORITY={welcome:5,galaxy:4,results:3,explosion:3,shock:3,boost:2,finish:2,countdown:2,comic:1};
  function create(music,countdown){
    let context,musicGain,voiceGain,sfxGain,master,capture,voiceCapture,musicCapture;
    let enabled=false,normal=.6,voiceActive=false,stingUntil=0,lastFunnyAt=0,eventUntil=0;
    const events=[],pending=[];
    const log=(type,extra={})=>{events.push({type,at:performance.now(),...extra});if(events.length>400)events.shift();};
    function init(){
      if(context)return;
      context=new (window.AudioContext||window.webkitAudioContext)();
      musicGain=context.createGain();voiceGain=context.createGain();sfxGain=context.createGain();
      master=context.createDynamicsCompressor();master.threshold.value=-3;master.knee.value=0;master.ratio.value=20;master.attack.value=.003;master.release.value=.08;
      capture=context.createMediaStreamDestination();voiceCapture=context.createMediaStreamDestination();musicCapture=context.createMediaStreamDestination();
      const headroom=context.createGain();headroom.gain.value=.8;
      master.connect(headroom);headroom.connect(context.destination);headroom.connect(capture);musicGain.connect(master);voiceGain.connect(master);sfxGain.connect(master);
      voiceGain.connect(voiceCapture);musicGain.connect(musicCapture);
      context.createMediaElementSource(music).connect(musicGain);context.createMediaElementSource(countdown).connect(sfxGain);
      music.volume=1;musicGain.gain.value=normal;sfxGain.gain.value=.55;voiceGain.gain.value=1;
      context.onstatechange=()=>{log('context',{state:context.state});if(enabled&&!document.hidden&&context.state==='suspended')context.resume().catch(e=>log('resume-error',{error:e.message}));};
    }
    function ramp(value,seconds){if(!context)return;const p=musicGain.gain,t=context.currentTime;p.cancelScheduledValues(t);p.setValueAtTime(p.value,t);p.linearRampToValueAtTime(value,t+seconds);}
    // Música NUNCA pára nem recomeça: duck baixa o gain, restore sobe suave.
    function duck(kind,seconds=.1){if(!context)return;eventUntil=performance.now()+(kind==='countdown'?1800:seconds*1000+2600);ramp(voiceActive?DUCK.welcome*normal:normal*(DUCK[kind]??1),seconds);log('duck',{kind,level:normal*(DUCK[kind]??1)});}
    function restore(seconds=.65){if(!context)return;eventUntil=0;ramp(voiceActive?DUCK.welcome*normal:normal,seconds);log('restore',{level:normal});}
    function target(seconds=.12){ramp(voiceActive?DUCK.welcome*normal:performance.now()<stingUntil?DUCK.countdown*normal:normal,seconds);}
    // Fila de prioridade: nada de caos áudio; welcome fala primeiro.
    function enqueue(kind,fn){const p=SFX_PRIORITY[kind]??2;if(voiceActive&&p<5){pending.push({kind,fn});log('sfx-deferred',{kind,p});return;}fn();}
    function drain(){if(!pending.length)return;const next=pending.shift();next.fn();}
    // SFX sintetizados (agressivos, sem assets externos):
    function sfxBoost(){if(!enabled||voiceActive)return;const t=context.currentTime,o=context.createOscillator(),g=context.createGain(),f=context.createBiquadFilter();o.type='sawtooth';o.frequency.setValueAtTime(90,t);o.frequency.exponentialRampToValueAtTime(720,t+.5);f.type='bandpass';f.frequency.setValueAtTime(300,t);f.frequency.exponentialRampToValueAtTime(2400,t+.5);f.Q.value=2.2;g.gain.setValueAtTime(.001,t);g.gain.exponentialRampToValueAtTime(.5,t+.09);g.gain.exponentialRampToValueAtTime(.001,t+.95);o.connect(f);f.connect(g);g.connect(sfxGain);o.start(t);o.stop(t+1);o.onended=()=>{o.disconnect();g.disconnect();f.disconnect();};log('sfx',{kind:'boost'});}
    function sfxExplosion(){if(!enabled||voiceActive)return;const t=context.currentTime,len=.9,buf=context.createBuffer(1,context.sampleRate*len,context.sampleRate),d=buf.getChannelData(0);for(let i=0;i<d.length;i+=1){d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,2.2)*.9;}const s=context.createBufferSource(),g=context.createGain(),f=context.createBiquadFilter();s.buffer=buf;f.type='lowpass';f.frequency.setValueAtTime(900,t);f.frequency.exponentialRampToValueAtTime(90,t+len);g.gain.setValueAtTime(.85,t);g.gain.exponentialRampToValueAtTime(.001,t+len);s.connect(f);f.connect(g);g.connect(sfxGain);s.start(t);s.onended=()=>{s.disconnect();g.disconnect();f.disconnect();};log('sfx',{kind:'explosion'});}
    function sfxShock(){if(!enabled||voiceActive)return;const t=context.currentTime;for(let i=0;i<3;i+=1){const o=context.createOscillator(),g=context.createGain();o.type='square';o.frequency.setValueAtTime(1500-i*180,t+i*.05);o.frequency.exponentialRampToValueAtTime(240,t+i*.05+.3);g.gain.setValueAtTime(.22,t+i*.05);g.gain.exponentialRampToValueAtTime(.001,t+i*.05+.34);o.connect(g);g.connect(sfxGain);o.start(t+i*.05);o.stop(t+i*.05+.36);o.onended=()=>{o.disconnect();g.disconnect();};}log('sfx',{kind:'shock'});}
    function sfxGalaxy(){if(!enabled||voiceActive)return;const t=context.currentTime;[130,196,260,392,523,784].forEach((f,i)=>{const o=context.createOscillator(),g=context.createGain();o.type='sine';o.frequency.value=f;g.gain.setValueAtTime(.001,t+i*.12);g.gain.exponentialRampToValueAtTime(.16,t+i*.12+.08);g.gain.exponentialRampToValueAtTime(.001,t+i*.12+1.15);o.connect(g);g.connect(sfxGain);o.start(t+i*.12);o.stop(t+i*.12+1.2);o.onended=()=>{o.disconnect();g.disconnect();};});log('sfx',{kind:'galaxy'});}
    function sfxFinish(){if(!enabled||voiceActive)return;const t=context.currentTime;[523,659,784].forEach((f,i)=>{const o=context.createOscillator(),g=context.createGain();o.type='triangle';o.frequency.value=f;g.gain.setValueAtTime(.001,t+i*.07);g.gain.exponentialRampToValueAtTime(.3,t+i*.07+.03);g.gain.exponentialRampToValueAtTime(.001,t+i*.07+.5);o.connect(g);g.connect(sfxGain);o.start(t+i*.07);o.stop(t+i*.07+.55);o.onended=()=>{o.disconnect();g.disconnect();};});log('sfx',{kind:'finish'});}
    function sfxResults(){if(!enabled||voiceActive)return;const t=context.currentTime;[392,523,659,784].forEach((f,i)=>{const o=context.createOscillator(),g=context.createGain();o.type='triangle';o.frequency.value=f;g.gain.setValueAtTime(.001,t+i*.16);g.gain.exponentialRampToValueAtTime(.26,t+i*.16+.05);g.gain.exponentialRampToValueAtTime(.001,t+i*.16+.85);o.connect(g);g.connect(sfxGain);o.start(t+i*.16);o.stop(t+i*.16+.9);o.onended=()=>{o.disconnect();g.disconnect();};});log('sfx',{kind:'results'});}
    // Momentos engraçados: nunca durante welcome; cooldown global 25s.
    const FUNNY=[['airhorn',[233,311],.5],['goat',[880,660],.7],['gasp',[196,147],.9],['scratch',[1200,300],.4]];
    function funny(){if(!enabled||voiceActive)return;if(performance.now()-lastFunnyAt<25000)return;lastFunnyAt=performance.now();const [name,freqs,dur]=FUNNY[Math.floor(Math.random()*FUNNY.length)];freqs.forEach((f,i)=>{const o=context.createOscillator(),g=context.createGain(),t=context.currentTime+i*.09;o.type=name==='scratch'?'sawtooth':'square';o.frequency.setValueAtTime(f,t);o.frequency.exponentialRampToValueAtTime(f*.5,t+dur);g.gain.setValueAtTime(.09,t);g.gain.exponentialRampToValueAtTime(.001,t+dur);o.connect(g);g.connect(sfxGain);o.start(t);o.stop(t+dur+.02);o.onended=()=>{o.disconnect();g.disconnect();};});log('funny',{name});}
    async function unlock(){init();enabled=true;await context.resume();target();await music.play();log('unlocked');}
    function disable(){enabled=false;music.pause();context?.suspend();}
    async function resume(){if(enabled){await context.resume();if(music.paused)await music.play();}}
    async function welcome(name){
      if(!enabled)throw new Error('Audio session not unlocked');
      await resume();log('tts-request',{name});
      const response=await fetch(`/tts/welcome?name=${encodeURIComponent(name)}`,{signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw new Error(`TTS HTTP ${response.status}`);
      const lang=response.headers.get('X-TTS-Language');if(lang!=='pt-PT')throw new Error('TTS must be pt-PT');
      const buffer=await context.decodeAudioData(await response.arrayBuffer());
      let peak=0,sum=0;const samples=buffer.getChannelData(0);for(const v of samples){peak=Math.max(peak,Math.abs(v));sum+=v*v;}
      if(peak<.001)throw new Error('Silent TTS response');
      const source=context.createBufferSource(),gain=context.createGain(),filter=context.createBiquadFilter(),compressor=context.createDynamicsCompressor();
      source.buffer=buffer;gain.gain.value=Math.min(2.8,.88/peak);filter.type='highpass';filter.frequency.value=95;
      compressor.threshold.value=-18;compressor.knee.value=12;compressor.ratio.value=3;compressor.attack.value=.004;compressor.release.value=.12;
      source.connect(filter);filter.connect(compressor);compressor.connect(gain);gain.connect(voiceGain);
      voiceActive=true;target(.08);
      // SEGURANÇA WELCOME: qualquer SFX já a soar é abafado por baixo da voz
      // (regra: "duck/pause/defer lower-priority sound as needed").
      sfxGain.gain.cancelScheduledValues(context.currentTime);sfxGain.gain.setValueAtTime(sfxGain.gain.value,context.currentTime);sfxGain.gain.linearRampToValueAtTime(.12,context.currentTime+.12);log('sfx-duck-for-voice',{});
      try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{try{source.stop();}catch{}reject(new Error('Voice playback timeout'));},buffer.duration*1000+8000);source.onended=()=>{clearTimeout(timer);resolve();};source.start(context.currentTime+.1);});await new Promise(r=>setTimeout(r,250));}
      finally{source.disconnect();filter.disconnect();compressor.disconnect();gain.disconnect();voiceActive=false;sfxGain.gain.cancelScheduledValues(context.currentTime);sfxGain.gain.setValueAtTime(sfxGain.gain.value,context.currentTime);sfxGain.gain.linearRampToValueAtTime(.55,context.currentTime+.65);restore(.65);log('welcome-end',{name});drain();}
      return {source:'server',lang,duration:buffer.duration,peak,rms:Math.sqrt(sum/samples.length)};
    }
    // API central: efeito por tipo — SFX agressivo + duck + restore agendado.
    // kind: boost | explosion | shock | galaxy | welcome | countdown | comic
    // UM só timer de restore: um evento novo SEMPRE substitui o pendente
    // (um restore antigo nunca pode cancelar o duck de um evento novo).
    let restoreTimer=0;
    function effect(kind,durationMs=2200){
      if(!enabled)return;
      const key=DUCK[kind]!==undefined?kind:'boost';
      enqueue(key==='comic'?'comic':key,()=>{
        if(voiceActive&&key!=='welcome')return;
        if(key==='boost')sfxBoost();else if(key==='explosion')sfxExplosion();else if(key==='shock')sfxShock();else if(key==='galaxy')sfxGalaxy();else if(key==='comic')funny();else if(key==='finish')sfxFinish();else if(key==='results')sfxResults();
        if(key!=='welcome'&&key!=='countdown'&&key!=='finish'&&key!=='results'){clearTimeout(restoreTimer);duck(key,.1);restoreTimer=setTimeout(restore,Math.max(600,durationMs));}
        log('effect',{kind,durationMs});
      });
    }
    function sting(id){
      if(!enabled)return;
      effect({rose:'boost',bomb:'explosion',emp:'shock',galaxy:'galaxy'}[id]||'comic',2200);
    }
    function beep(number){if(!enabled||voiceActive)return;const o=context.createOscillator(),g=context.createGain(),t=context.currentTime;o.frequency.value=number===0?1040:520;g.gain.setValueAtTime(.2,t);g.gain.exponentialRampToValueAtTime(.001,t+.22);o.connect(g);g.connect(sfxGain);o.start();o.stop(t+.24);o.onended=()=>{o.disconnect();g.disconnect();};log('beep',{number});}
    async function go(){if(!enabled)return;await resume();duck('countdown',.08);stingUntil=performance.now()+1800;countdown.currentTime=0;countdown.play().catch(e=>log('countdown-error',{error:e.message}));setTimeout(()=>{stingUntil=0;restore(.5);},1900);}
    return {unlock,disable,resume,welcome,sting,effect,funny,duck,restore,beep,go,setLevel(v){normal=v;target(.3);},get voiceActive(){return voiceActive;},get context(){return context;},
      get streams(){return {mix:capture?.stream,voice:voiceCapture?.stream,music:musicCapture?.stream};},
      report:()=>({enabled,context:context?.state,normal,musicGain:musicGain?.gain.value,sfxGain:sfxGain?.gain.value,voiceActive,pending:pending.length,events:[...events]})};
  }
  root.LiveAudio=Object.freeze({create});
})(window);
