import test from 'node:test';
import assert from 'node:assert/strict';
import './race-lifecycle.js';
test('three complete lifecycle loops use only legal edges',()=>{
  let time=0;const f=RaceLifecycle.create(()=>time);
  for(let round=0;round<3;round++)for(const phase of ['lobby','grid','countdown','race','final_sprint','finishing','results','resetting','waiting']){time+=1000;f.transition(phase);}
  assert.equal(f.snapshot().completedRounds,3);assert.equal(f.snapshot().stuckResults,0);
  assert.equal(f.phase,'waiting');assert.throws(()=>f.transition('results'),/Invalid/);
});
test('results watchdog recovers at twelve seconds even if the normal timer fails',()=>{
  let time=0;const f=RaceLifecycle.create(()=>time);
  for(const phase of ['lobby','grid','countdown','race','finishing','results'])f.transition(phase);
  time=11999;assert.equal(f.watchdog(),false);time=12000;assert.equal(f.watchdog(),true);
  assert.equal(f.phase,'resetting');assert.equal(f.snapshot().stuckResults,1);f.transition('waiting');
});
