import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import {fork,execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const ROOT=path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/,'$1'));
const OUT=process.env.V4_OUTPUT||path.join(ROOT,'preview','v4');
const WORK=path.join(ROOT,'preview','v4-work');
fs.mkdirSync(OUT,{recursive:true});fs.mkdirSync(WORK,{recursive:true});
const EDGE='C:/Users/legio/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe';
const FF=process.env.FFMPEG_PATH||'ffmpeg';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const server=fork(path.join(ROOT,'server.mjs'),[],{cwd:ROOT,env:{...process.env,PORT:'10004',TIKTOK_ENABLED:'false',WS_TEST_HOOKS:'1',TTS_PREWARM:'false'},silent:true,windowsHide:true});
let logs='';server.stdout.on('data',b=>logs+=b);server.stderr.on('data',b=>logs+=b);
let browser;
const report={gates:[],pageErrors:[],consoleErrors:[],states:[],rounds:[]};
const gate=(name,ok,detail)=>{report.gates.push({name,ok:!!ok,detail});console.log(`${ok?'PASS':'FAIL'} ${name} ${JSON.stringify(detail??'')}`);};
try{
  for(let i=0;i<60;i++){try{if((await fetch('http://localhost:10004/health')).ok)break;}catch{}await wait(250);}
  browser=await puppeteer.launch({executablePath:EDGE,headless:true,args:['--disable-dev-shm-usage','--no-sandbox'],userDataDir:fs.mkdtempSync(path.join(WORK,'capture-profile-')),defaultViewport:{width:720,height:1280,deviceScaleFactor:1}});
  const page=await browser.newPage();
  page.on('pageerror',e=>report.pageErrors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text());});
  await page.goto('http://localhost:10004/',{waitUntil:'networkidle0'});
  const boot=await page.evaluate(()=>({report:NeonRushQA.report(),hidden:document.getElementById('viewers').hidden}));
  gate('production-boot-zero',boot.report.racers===0&&boot.hidden,boot.report.racers);
  await page.screenshot({path:path.join(OUT,'01-waiting.png')});
  if(process.argv.includes('--inspect')){console.log(JSON.stringify(boot));await browser.close();server.kill();process.exit(0);}
  // Warm the actual local pt-PT engine, without playing it before capture.
  const warm=await page.evaluate(async()=>{const r=await fetch('/tts/welcome?name=Hugo');return {status:r.status,lang:r.headers.get('X-TTS-Language')};});
  gate('piper-pt-PT',warm.status===200&&warm.lang==='pt-PT',warm);
  await page.click('#audio-toggle');
  await page.waitForFunction(()=>NeonRushQA.audioMix().context==='running');
  await page.evaluate(()=>NeonRushQA.accelerate(12));
  const cdp=await page.createCDPSession(),frames=[];
  let capturing=true,frameCount=0;
  cdp.on('Page.screencastFrame',async ev=>{await cdp.send('Page.screencastFrameAck',{sessionId:ev.sessionId}).catch(()=>{});if(!capturing)return;const file=`frame-${String(frameCount++).padStart(6,'0')}.jpg`;fs.writeFileSync(path.join(WORK,file),Buffer.from(ev.data,'base64'));frames.push({file,timestamp:ev.metadata.timestamp});});
  await cdp.send('Page.startScreencast',{format:'jpeg',quality:85,maxWidth:720,maxHeight:1280,everyNthFrame:3});
  await page.evaluate(()=>{window.v4Recordings={};window.v4CaptureStart=performance.now();for(const [name,stream]of Object.entries(NeonRushQA.audioStreams())){const chunks=[],rec=new MediaRecorder(stream,{mimeType:'audio/webm;codecs=opus',audioBitsPerSecond:192000});rec.ondataavailable=e=>chunks.push(e.data);window.v4Recordings[name]={rec,chunks};rec.start(250);}});
  const captureStart=await page.evaluate(()=>window.v4CaptureStart);
  const start=Date.now(),sent=new Set(),screens=new Set();let recorded=false,previousPhase='',previousRound=0;
  function send(at,event){if(Date.now()-start<at||sent.has(at))return;sent.add(at);server.send({type:'live-event',event});}
  while(Date.now()-start<420000){
    send(3000,{type:'join',username:'Hugo',userId:'qa-hugo',uniqueId:'hugo'});
    send(6500,{type:'like',username:'Hugo',userId:'qa-hugo',count:1});
    send(7500,{type:'comment',username:'Ana',userId:'qa-ana',comment:'3'});
    send(7900,{type:'share',username:'Inês',userId:'qa-ines'});
    send(8500,{type:'comment',username:'Hugo',userId:'qa-hugo',comment:'1'});
    send(16500,{type:'gift',username:'Hugo',userId:'qa-hugo',giftName:'Rose',totalDiamonds:1});
    send(21500,{type:'gift',username:'Ana',userId:'qa-ana',giftName:'Rocket',totalDiamonds:50});
    send(26000,{type:'gift',username:'Inês',userId:'qa-ines',giftName:'Thunder',totalDiamonds:100});
    send(31500,{type:'gift',username:'Hugo',userId:'qa-hugo',giftName:'Galaxy',totalDiamonds:500});
    const snap=await page.evaluate(()=>({life:NeonRushQA.lifecycle(),snap:NeonRushQA.snapshot(),audio:NeonRushQA.audioState()}));
    if(snap.snap.phase!==previousPhase){previousPhase=snap.snap.phase;report.states.push({phase:previousPhase,at:(Date.now()-start)/1000,round:snap.life.round});console.log(`STATE ${snap.life.round} ${previousPhase}`);}
    if(snap.life.completedRounds>previousRound){previousRound=snap.life.completedRounds;report.rounds.push(snap.life.lastRound);}
    if(snap.life.completedRounds===3&&!sent.has('leave')){sent.add('leave');for(const [userId,username]of [['qa-hugo','Hugo'],['qa-ana','Ana'],['qa-ines','Inês']])server.send({type:'live-event',event:{type:'leave',userId,username}});}
    for(const [key,condition,name]of [['race',snap.snap.phase==='race'&&Date.now()-start>17000,'02-race.png'],['results',snap.snap.phase==='results','03-results.png'],['new',snap.life.round>=2&&snap.snap.phase==='grid','04-new-round.png']]){if(condition&&!screens.has(key)){screens.add(key);await page.screenshot({path:path.join(OUT,name)});}}
    assert.equal(new Set(snap.snap.racers.map(r=>r.id)).size,snap.snap.racers.length,'duplicate racer');
    if(!recorded&&Date.now()-start>=88000){
      capturing=false;await cdp.send('Page.stopScreencast');
      const captured=await page.evaluate(async()=>{const out={};await Promise.all(Object.entries(window.v4Recordings).map(async([name,{rec,chunks}])=>{await new Promise(r=>{rec.onstop=r;rec.stop();});const blob=new Blob(chunks,{type:'audio/webm'});const arr=new Uint8Array(await blob.arrayBuffer());let str='';for(let i=0;i<arr.length;i+=8192)str+=String.fromCharCode(...arr.subarray(i,i+8192));out[name]=btoa(str);}));return {audio:out,mix:NeonRushQA.audioMix(),ended:performance.now()};});
      for(const [name,base64]of Object.entries(captured.audio))fs.writeFileSync(path.join(WORK,`${name}.webm`),Buffer.from(base64,'base64'));
      report.audio=captured.mix;report.captureStart=captureStart;report.captureDuration=(captured.ended-captureStart)/1000;report.frames=frames.length;
      fs.writeFileSync(path.join(WORK,'capture.json'),JSON.stringify({frames,report},null,2));recorded=true;console.log('CAPTURE COMPLETE');
    }
    if(snap.life.completedRounds>=3&&snap.life.round>=4)break;
    await wait(160);
  }
  const end=await page.evaluate(()=>({life:NeonRushQA.lifecycle(),qa:NeonRushQA.report(),welcome:NeonRushQA.welcomeQA()}));
  report.end=end;
  gate('three-complete-rounds',end.life.completedRounds===3&&end.life.round===4,end.life);
  gate('individual-podium',report.rounds.length===3&&report.rounds.every(r=>r.length===3&&r.every((x,i)=>x.position===i+1&&x.laps===10&&x.finished)),report.rounds);
  gate('no-stuck-results',end.life.stuckResults===0,end.life.stuckResults);
  const stateTimeouts=end.life.history.filter((s,i,h)=>h[i+1]&&({lobby:2300,grid:2300,countdown:3500,results:8500,resetting:1200}[s.phase]??Infinity)<h[i+1].at-s.at);
  gate('state-timeouts',stateTimeouts.length===0,stateTimeouts);report.stateTimeouts=stateTimeouts.length;
  gate('empty-round-returns-waiting',end.life.phase==='waiting'&&end.qa.racers===0,{phase:end.life.phase,racers:end.qa.racers});
  gate('identity-dedupe',end.qa.duplicateRacers===0,end.qa.duplicateRacers);
  gate('track',Object.entries(end.qa.roadQA).filter(([k])=>/Violations|Hits/.test(k)).every(([,v])=>v===0),end.qa.roadQA);
  gate('browser-clean',!report.pageErrors.length&&!report.consoleErrors.length&&!end.qa.pageErrors.length,{page:report.pageErrors,console:report.consoleErrors,app:end.qa.pageErrors});
  gate('welcome-path',end.welcome.qa.playResolved&&end.welcome.qa.lang==='pt-PT'&&end.welcome.qa.currentTime>0,end.welcome);
  await browser.close();browser=null;server.kill();
  const listing=frames.map((f,i)=>`file '${f.file}'\nduration ${Math.min(.5,Math.max(.001,(frames[i+1]?.timestamp??(f.timestamp+1/20))-f.timestamp))}`).join('\n')+`\nfile '${frames.at(-1).file}'\n`;
  fs.writeFileSync(path.join(WORK,'frames.ffconcat'),listing);
  execFileSync(FF,['-y','-v','error','-f','concat','-safe','0','-i',path.join(WORK,'frames.ffconcat'),'-i',path.join(WORK,'mix.webm'),'-map','0:v','-map','1:a','-vf','fps=30,scale=720:1280','-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-shortest','-movflags','+faststart',path.join(OUT,'neon-rush-v4-preview.mp4')],{windowsHide:true,stdio:'pipe'});
  execFileSync(FF,['-y','-v','error','-i',path.join(OUT,'neon-rush-v4-preview.mp4'),'-vn','-ar','48000',path.join(OUT,'preview-audio.wav')],{windowsHide:true});
  report.allProgrammaticGatesPass=report.gates.every(g=>g.ok);
}catch(error){report.failure=error.stack;console.error(error.stack);process.exitCode=1;}
finally{if(browser)await browser.close();server.kill();fs.writeFileSync(path.join(OUT,'qa-v4.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(WORK,'server.log'),logs);}
