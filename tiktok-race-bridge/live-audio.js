(function(root){
  'use strict';
  // One persistent graph for every audible source; the recording tap is the
  // exact same limited mix sent to the speakers, never a replacement soundtrack.
  function create(music,countdown){
    let context,musicGain,voiceGain,sfxGain,master,capture,voiceCapture,musicCapture;
    let enabled=false,normal=.6,voiceActive=false,stingUntil=0,lastFunnyAt=0;
    const events=[];
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
    function target(seconds=.12){ramp(voiceActive?normal*.12:performance.now()<stingUntil?normal*.5:normal,seconds);}
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
      voiceActive=true;target(.08);log('welcome-start',{name,duration:buffer.duration,musicGain:normal*.12,normal,lang,peak,rms:Math.sqrt(sum/samples.length)});
      try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{try{source.stop();}catch{}reject(new Error('Voice playback timeout'));},buffer.duration*1000+8000);source.onended=()=>{clearTimeout(timer);resolve();};source.start(context.currentTime+.1);});await new Promise(r=>setTimeout(r,250));}
      finally{source.disconnect();filter.disconnect();compressor.disconnect();gain.disconnect();voiceActive=false;target(.65);log('welcome-end',{name});}
      return {source:'server',lang,duration:buffer.duration,peak,rms:Math.sqrt(sum/samples.length)};
    }
    function sting(id){if(!enabled||voiceActive)return;const frequencies={rose:[660,880,1320],bomb:[250,150,70],emp:[1600,900,1400,450],galaxy:[260,390,520,780,1040]}[id]||[700];
      frequencies.forEach((f,i)=>{const o=context.createOscillator(),g=context.createGain(),t=context.currentTime+i*.08;o.type=id==='emp'?'square':'triangle';o.frequency.setValueAtTime(f,t);o.frequency.exponentialRampToValueAtTime(Math.max(40,f*.65),t+.22);g.gain.setValueAtTime(.13,t);g.gain.exponentialRampToValueAtTime(.001,t+.3);o.connect(g);g.connect(sfxGain);o.start(t);o.stop(t+.31);o.onended=()=>{o.disconnect();g.disconnect();};});log('gift-sfx',{id});
      if(id==='galaxy'&&performance.now()-lastFunnyAt>=25000){lastFunnyAt=performance.now();for(const f of [330,415]){const o=context.createOscillator(),g=context.createGain(),t=context.currentTime;o.type='sawtooth';o.frequency.value=f;g.gain.setValueAtTime(.035,t);g.gain.exponentialRampToValueAtTime(.001,t+.28);o.connect(g);g.connect(sfxGain);o.start();o.stop(t+.3);o.onended=()=>{o.disconnect();g.disconnect();};}log('comic-horn');}}
    function beep(number){if(!enabled||voiceActive)return;const o=context.createOscillator(),g=context.createGain(),t=context.currentTime;o.frequency.value=number===0?1040:520;g.gain.setValueAtTime(.2,t);g.gain.exponentialRampToValueAtTime(.001,t+.22);o.connect(g);g.connect(sfxGain);o.start();o.stop(t+.24);}
    async function go(){if(!enabled||voiceActive)return;await resume();stingUntil=performance.now()+1800;target(.08);countdown.currentTime=0;countdown.play().catch(e=>log('countdown-error',{error:e.message}));setTimeout(()=>target(.65),1900);}
    return {unlock,disable,resume,welcome,sting,beep,go,setLevel(v){normal=v;target(.3);},get voiceActive(){return voiceActive;},get context(){return context;},
      get streams(){return {mix:capture?.stream,voice:voiceCapture?.stream,music:musicCapture?.stream};},
      report:()=>({enabled,context:context?.state,normal,musicGain:musicGain?.gain.value,voiceActive,events:[...events]})};
  }
  root.LiveAudio=Object.freeze({create});
})(window);
