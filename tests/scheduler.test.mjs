import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {Scheduler} from '../src/worker/scheduler.mjs';
test('coalesces simultaneous requests and keeps providers independent', async()=>{
  let release, calls=0; const pending=new Promise(r=>{release=r}); const reports=[];
  const s=new Scheduler({a:{refresh:()=>{calls++;return pending}},b:{refresh:async()=>42}},(id,value)=>reports.push([id,value]));
  const first=s.refreshProvider('a'); const duplicate=s.refreshProvider('a');
  assert.equal(first,duplicate); assert.equal(await s.refreshProvider('b'),42); release(7); assert.equal(await first,7); assert.equal(calls,1); assert.deepEqual(reports,[['b',42],['a',7]]);
});
test('reconfigures and stops its timer',()=>{
  const calls=[];const timers={setInterval:(f,ms)=>{calls.push(ms);return 5},clearInterval:id=>calls.push(id)};
  const s=new Scheduler({},()=>{},timers);s.configure(10);s.configure(0);s.configure(1);s.stop();assert.deepEqual(calls,[600000,5,60000,5]);assert.throws(()=>s.configure(3));
});
test('one failing provider does not reject the cycle',async()=>{
 const s=new Scheduler({bad:{refresh:()=>{throw Error('bad')}},good:{refresh:()=>1}},()=>{});
 const values=await s.refresh();assert.equal(values[0].state,'error');assert.equal(values[1],1);
});
