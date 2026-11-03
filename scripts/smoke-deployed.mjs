import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {validateRequest,evaluateSkill,DEFAULT_POLICY,STRICT_POLICY} from '../src/skill.mjs';
const base=(process.env.FLOW_URL||'https://skill-chain-mcp-flow.trantanlong2411.workers.dev').replace(/\/$/,'');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function request(path,payload){
 const resp=await fetch(base+path,{method:payload?'POST':'GET',
  headers:payload?{'content-type':'application/json'}:{},
  body:payload?JSON.stringify(payload):undefined,
  signal:AbortSignal.timeout(65000)});
 const raw=await resp.text();let parsed;
 try{parsed=JSON.parse(raw)}catch{throw Error(path+' returned non-JSON HTTP '+resp.status+': '+raw.slice(0,250))}
 if(!resp.ok||!parsed.ok)throw Error(path+' HTTP '+resp.status+': '+JSON.stringify(parsed).slice(0,550));
 return parsed;
}
let health;
for(let i=0;i<18;i++){
 try{health=await request('/api/health');if(health.service==='skill-chain-mcp-flow')break;}
 catch(e){console.log('Waiting for Worker',i+1,String(e.message).slice(0,160))}
 await wait(5000);
}
assert.equal(health?.chainMcp?.chainId,1672,'Worker not ready');
assert.equal(health?.sendTransactions,false);
const results=[];
for(const [scenario,policy] of [['relaxed',DEFAULT_POLICY],['strict',STRICT_POLICY]]){
 let record;
 for(let attempt=0;attempt<3;attempt++){
  try{record=await request('/api/run',{policy});break;}
  catch(e){
   console.log('LIVE MCP retry',scenario,attempt+1,String(e.message).slice(0,400));
   if(attempt===2)throw e;
   await wait(17000);
  }
 }
 assert.equal(record.connection,'STREAMABLE_HTTP_MCP');
 assert.equal(record.composition,'CHAIN_MCP_DATA_TO_SKILL_DECISION');
 assert.equal(record.chainId,1672);
 assert.equal(record.transactionBroadcast,false);
 assert.deepEqual(record.genuineMcpToolCalls,['get_chain_info','get_gas_price','get_balance']);
 assert.equal(record.trace.length,5);
 assert.deepEqual(record.trace.slice(1,4).map(x=>x.method),['get_chain_info','get_gas_price','get_balance']);
 const sources=Object.fromEntries(record.trace.slice(1,4).map(x=>[x.method,x.output]));
 const skill=evaluateSkill(validateRequest({policy,address:record.decision.address}),sources,
  record.decision.observedAt);
 assert.equal(record.decision.decision,skill.decision);
 assert.deepEqual(record.decision.rules,skill.rules);
 assert.equal(record.decision.balanceWei,sources.get_balance.balanceWei);
 assert.equal(record.decision.gasPriceWei,sources.get_gas_price.gasPriceWei);
 assert.equal(record.decision.blockNumber,sources.get_chain_info.latestBlock);
 assert.ok(['ALLOW','HOLD'].includes(record.decision.decision));
 results.push({scenario,...record});
 console.log('VERIFIED LIVE CHAIN MCP TO SKILL FLOW',JSON.stringify({
  scenario,decision:record.decision.decision,decidedBy:record.decision.decidedBy,
  latestBlock:record.decision.blockNumber,gasPriceGwei:record.decision.gasPriceGwei,
  nativeBalancePros:record.decision.balancePros,trace:record.trace.map(x=>x.method||x.skill||x.phase)
 }));
 await wait(2000);
}
await mkdir('proof',{recursive:true});
await writeFile('proof/live-composed-flow.json',JSON.stringify({
 schema:'pharos-chain-mcp-skill-composition-v1',
 verifiedAt:new Date().toISOString(),worker:base,
 notes:'Actual hosted Pharos Mainnet Chain MCP tool calls, not direct RPC and not fixtures. No transactions, no wallet signatures.',
 scenarios:results},null,2)+'\n');
console.log('SUCCESS: hosted Chain MCP data genuinely fed into custom Skill policy; proof/live-composed-flow.json');
