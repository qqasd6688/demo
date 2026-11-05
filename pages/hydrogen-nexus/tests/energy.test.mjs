import test from 'node:test';
import assert from 'node:assert/strict';
import { simulate, defaults, presets, CAPACITY } from '../assets/simulation.js';

function verify(s){
  for(const [bus,residual] of Object.entries(s.balance))assert.ok(Math.abs(residual)<1e-8,`${bus} residual ${residual}`);
  assert.ok(s.storage>=0&&s.storage<=CAPACITY,'storage respects capacity');
  for(const key of ['pv','windPower','chpElectric','electrolyzer','hydrogenProduction','hydrogenServed','fuelcellElectric','boilerHeat','absorptionHeat','chillerCold','gridImport','gridExport','heatServed','conversionLoss'])assert.ok(s[key]>=-1e-8,`${key} cannot be negative`);
  assert.ok(!(s.electrolyzer>.001&&s.fuelcellElectric>.001),'no simultaneous hydrogen cycling');
  assert.ok(!(s.gridImport>.001&&s.gridExport>.001),'grid direction is exclusive');
}
test('all presets conserve every bus and the whole physical boundary',()=>{for(const p of Object.values(presets))for(const stock of [0, .001, 30, 119.999, 120])verify(simulate(p,stock));});
test('extreme weather and independent loads preserve conservation',()=>{
  let seed=801;
  function rand(){seed=(seed*1664525+1013904223)>>>0;return seed/2**32;}
  for(let i=0;i<2500;i++)verify(simulate({solar:rand()*1000,wind:rand()*30,temperature:rand()*55-10,electric:rand()*1000,heat:rand()*700,cold:rand()*700,hydrogen:rand()*8},rand()*120,.001+rand()*.2));
});
test('empty hydrogen storage limits fuel cell and reports unserved demand',()=>{
  const s=simulate(presets.evening,0);verify(s);assert.equal(s.fuelcellElectric,0);assert.equal(s.hydrogenServed,0);assert.equal(s.unmet.hydrogen,1.2);assert.ok(s.gridImport>0);
});
test('full tanks curtail electrolysis and export remaining electricity',()=>{const s=simulate({...presets.renewable,hydrogen:0},120);verify(s);assert.equal(s.electrolyzer,0);assert.equal(s.storage,120);assert.ok(s.gridExport>0);});
test('long running charge and discharge integrates the hydrogen mass without overflow',()=>{
  let inventory=119;
  for(let i=0;i<4000;i++){const s=simulate(i<2000?presets.renewable:presets.evening,inventory);verify(s);assert.ok(Math.abs(s.storage-inventory-s.storageRate/60)<1e-8);inventory=s.storage;}
  assert.equal(inventory,0);
});
test('wind turbine cuts out in dangerous wind and solar is zero at night',()=>{assert.equal(simulate({...defaults,solar:0,wind:25}).pv,0);assert.equal(simulate({...defaults,wind:30}).windPower,0);assert.equal(simulate({...defaults,wind:2}).windPower,0);});
test('cooling rejects both absorbed heat and drive energy',()=>{const s=simulate(presets.peak);assert.ok(Math.abs(s.coolingReject-s.coldServed-s.absorptionHeat-s.chillerElectric)<1e-8);});
test('overloaded heat supply reports unmet loads without fabricating power',()=>{const s=simulate({...defaults,temperature:-10,heat:700},0);verify(s);assert.ok(s.unmet.heat>0);assert.ok(s.heatServed<s.heatDemand);});
