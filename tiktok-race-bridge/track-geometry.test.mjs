import test from 'node:test';
import assert from 'node:assert/strict';
import './track-geometry.js';

const TG=globalThis.TrackGeometry;

test('track QA: 16 racers, five laps, full kart footprint remains on road',()=>{
  assert.ok(TG);
  const report=TG.runRoadQA({racers:16,laps:5,samplesPerLap:360});
  assert.ok(report.roadSamples>0);
  assert.equal(report.roadViolations,0);
  assert.equal(report.grassHits,0);
  assert.equal(report.infieldHits,0);
  assert.equal(report.boxHits,0);
  assert.ok(report.minRoadClearance>=0);
  assert.equal(TG.startGrid(16).length,16);
  assert.equal(TG.FINISH_EXIT_PATH.length,3);
});
