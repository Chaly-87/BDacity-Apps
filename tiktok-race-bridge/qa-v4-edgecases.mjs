import puppeteer from 'puppeteer-core';
import {fork} from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const out=process.env.V4_OUTPUT||'preview/v4';fs.mkdirSync(out,{recursive:true});
const server=fork('server.mjs',[],{env:{...process.env,PORT:'10006',TIKTOK_ENABLED:'false',WS_TEST_HOOKS:'1',TTS_PREWARM:'false'},silent:true});
server.stdout.on('data',()=>{});server.stderr.on('data',()=>{});
const wait=ms=>new Promise(r=>setTimeout(r,ms));let browser;
const checks=[];const check=(name,ok)=>{checks.push({name,ok});assert.ok(ok,name);};
try{
  for(let i=0;i<40;i++){try{await fetch('http://localhost:10006/health');break;}catch{}await wait(250);}
  fs.mkdirSync('preview/v4-work',{recursive:true});
  browser=await puppeteer.launch({executablePath:'C:/Users/legio/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe',headless:true,args:['--no-sandbox'],userDataDir:fs.mkdtempSync('preview/v4-work/edgecase-'),defaultViewport:{width:720,height:1280}});
  for(const type of ['like','comment','gift','follow','share']){
    const page=await browser.newPage();await page.goto('http://localhost:10006/',{waitUntil:'networkidle0'});
    await page.evaluate(type=>NeonRushQA.live({type,userId:'user1',uniqueId:'hugo1',username:'Hugo',comment:'Olá!',giftName:'Rose',count:1}),type);
    const r=await page.evaluate(()=>NeonRushQA.report());check(`${type} first admission`,r.racers===1&&r.racerKeys[0]==='user1');await page.close();
  }
  const gifts=await browser.newPage();await gifts.goto('http://localhost:10006/',{waitUntil:'networkidle0'});
  const visual=await gifts.evaluate(()=>{const q=NeonRushQA;q.live({type:'like',userId:'g1',username:'One',count:1});q.live({type:'like',userId:'g2',username:'Two',count:1});q.live({type:'gift',userId:'g1',username:'One',giftName:'Rose'});const rose={snap:q.snapshot(),effects:q.effects()};q.live({type:'gift',userId:'g1',username:'One',giftName:'Rose'});const cooldown=q.effects();q.live({type:'gift',userId:'g1',username:'One',giftName:'Rocket'});const rocket=q.effects();q.live({type:'gift',userId:'g1',username:'One',giftName:'Thunder'});const shock=q.snapshot();q.live({type:'gift',userId:'g1',username:'One',giftName:'Galaxy'});return {rose,cooldown,rocket,shock,galaxy:q.snapshot()};});
  check('ROSA means active nitro, not a false cooldown label',visual.rose.effects.eventText.includes('ATIVADO')&&visual.rose.snap.racers[0].boost>visual.rose.snap.now);
  check('repeat gift cooldown is visible',visual.cooldown.eventText.includes('EM ESPERA'));
  check('FOGUETE creates visible obstacle',visual.rocket.obstacles>0);
  check('TROVAO shocks rivals',visual.shock.racers[1].shock>visual.shock.now);
  check('GALAXIA activates arena-wide presentation',visual.galaxy.shell.includes('galaxy'));
  await gifts.close();
  const page=await browser.newPage();await page.goto('http://localhost:10006/',{waitUntil:'networkidle0'});
  const result=await page.evaluate(()=>{
    const q=NeonRushQA;q.live({type:'like',username:'Hugo',count:1});q.live({type:'comment',userId:'stable123',uniqueId:'hugo123',username:'Hugo',comment:'1'});
    const upgrade=q.report();q.live({type:'gift',userId:'stable123',username:'Hugo',giftName:'Rose'});q.live({type:'join',userId:'stable123',username:'Hugo'});const repeated=q.report();
    q.live({type:'follow',userId:'different456',username:'Hugo'});const sameName=q.report();
    for(let i=2;i<18;i++)q.live({type:'comment',userId:'u'+i,username:'User'+i,comment:'hi'});
    const full=q.report();return {upgrade,repeated,sameName,full};
  });
  check('fallback upgrades to canonical userId',result.upgrade.racers===1&&result.upgrade.racerKeys[0]==='stable123');
  check('like-comment-gift-join dedupe',result.repeated.racers===1);
  check('distinct stable IDs sharing name stay distinct',result.sameName.racers===2);
  check('capacity queue',result.full.racers===16&&result.full.queued===2&&result.full.duplicateRacers===0);
  await page.evaluate(()=>NeonRushQA.accelerate(100));await page.waitForFunction(()=>NeonRushQA.lifecycle().completedRounds>=1,{timeout:30000});
  await page.evaluate(()=>NeonRushQA.testWatchdog());
  await page.waitForFunction(()=>NeonRushQA.lifecycle().round>=2,{timeout:20000});
  const next=await page.evaluate(()=>({report:NeonRushQA.report(),snap:NeonRushQA.snapshot()}));
  const life=await page.evaluate(()=>NeonRushQA.lifecycle());check('independent browser watchdog recovers failed primary results timer',life.stuckResults===1&&life.history.some(h=>h.reason==='watchdog'));
  check('queued users promoted next round',next.report.racerKeys.includes('u16')&&next.report.racerKeys.includes('u17'));
  check('reset cleans finish boosts and events',next.snap.finishCount===0&&next.snap.firstFinishAt===null&&next.snap.racers.every(r=>!r.fin&&r.boost===0&&r.shock===0&&r.route===0)&&next.snap.event.until===0);
  check('identity retained after reset',next.report.duplicateRacers===0);
  console.log(JSON.stringify(checks,null,2));
}finally{if(browser)await browser.close();server.kill();fs.writeFileSync(out+'/edge-cases.json',JSON.stringify(checks,null,2));}
