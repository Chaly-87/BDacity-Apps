(function(root){
  'use strict';
  const EDGES={waiting:['lobby'],lobby:['grid','waiting'],grid:['countdown'],countdown:['race'],race:['final_sprint','finishing'],final_sprint:['finishing'],finishing:['results'],results:['resetting'],resetting:['waiting']};
  const DURATIONS=Object.freeze({lobby:1800,grid:1800,countdown:3000,results:8000,resetting:700});
  function create(now=()=>performance.now()){
    let phase='waiting',entered=now(),round=1,completedRounds=0,stuckResults=0;
    const history=[{phase,at:entered,round}];
    function transition(next,reason='normal'){
      if(!EDGES[phase]?.includes(next))throw new Error(`Invalid lifecycle transition: ${phase} -> ${next}`);
      phase=next;entered=now();if(next==='results')completedRounds++;if(next==='waiting')round++;
      history.push({phase,at:entered,round,reason});if(history.length>300)history.shift();return phase;
    }
    return {get phase(){return phase;},get age(){return now()-entered;},transition,
      watchdog(){if(phase==='results'&&now()-entered>=12000){stuckResults++;transition('resetting','watchdog');return true;}return false;},
      snapshot:()=>({phase,entered,round,completedRounds,stuckResults,history:history.map(x=>({...x}))})};
  }
  root.RaceLifecycle=Object.freeze({create,DURATIONS,EDGES});
})(typeof window!=='undefined'?window:globalThis);
