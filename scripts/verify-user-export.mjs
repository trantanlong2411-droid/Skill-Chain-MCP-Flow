import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateRequest,evaluateSkill,MAINNET} from '../src/skill.mjs';
const path=new URL('../proof/user-export-2026-11-03.json',import.meta.url);
const source=JSON.parse(await readFile(path,'utf8'));
assert.equal(source.ok,true);
assert.equal(source.composition,'CHAIN_MCP_DATA_TO_SKILL_DECISION');
assert.equal(source.connection,'STREAMABLE_HTTP_MCP');
assert.equal(source.network,'Pharos Mainnet');
assert.equal(source.chainId,MAINNET.chainId);
assert.equal(source.mcpEndpoint,MAINNET.mcp);
assert.equal(source.toolsUsed,2);
assert.equal(source.steps,5);
assert.equal(source.transactionBroadcast,false);
assert.equal(source.execution,'READ_ONLY_ANALYSIS');
const steps=source.trace;
assert.equal(steps.length,5);
assert.equal(steps[0].status,'OK');
assert.equal(steps[0].server,'pharos-mcp-server');
assert.deepEqual(steps.slice(1,4).map(x=>x.method),['get_chain_info','get_gas_price','get_balance']);
assert.ok(steps.slice(1,4).every(x=>x.status==='OK'));
assert.equal(steps[4].component,'SkillEngine Skill');
assert.equal(steps[4].skill,'pharos-gas-readiness-gate');
const inputs=Object.fromEntries(steps.slice(1,4).map(x=>[x.method,x.output]));
const p=steps[4].input;
assert.equal(p.chainId,inputs.get_chain_info.chainId);
assert.equal(p.block,inputs.get_chain_info.latestBlock);
assert.equal(p.gasWei,inputs.get_gas_price.gasPriceWei);
assert.equal(p.balanceWei,inputs.get_balance.balanceWei);
assert.equal(p.policy.maxGasGwei,'0');
assert.equal(p.policy.maxEstimatedCostPros,'0');
assert.equal(inputs.get_chain_info.chainId,1672);
assert.equal(inputs.get_chain_info.chainIdMatches,true);
assert.equal(inputs.get_balance.balanceWei,'0');
assert.equal(inputs.get_gas_price.gasPriceWei,'10000000000');
assert.equal(inputs.get_gas_price.gasPriceGwei,'10');
assert.equal(inputs.get_chain_info.latestBlock,'21994114');
assert.equal(source.decision.observedAt,'2026-11-03T07:24:08.549Z');
const request=validateRequest({address:source.decision.address,policy:p.policy});
const replay=evaluateSkill(request,inputs,source.decision.observedAt);
assert.deepEqual(replay,source.decision,'Replayed skill result differs from uploaded user export');
assert.deepEqual(steps[4].output,{
 decision:source.decision.decision,decidedBy:source.decision.decidedBy,
 rules:source.decision.rules,estimatedCostPros:source.decision.estimatedCostPros
});
assert.equal(source.decision.decision,'HOLD');
assert.deepEqual(source.decision.decidedBy,['GAS_PRICE_CEILING','COST_BUDGET']);
assert.deepEqual(source.decision.rules.map(r=>r.passed),[false,false,true]);
assert.equal(source.decision.estimatedCostPros,'0.00021');
assert.equal(source.decision.security.readOnly,true);
assert.equal(source.decision.security.broadcast,false);
console.log('USER-EXPORTED COMPOSED FLOW VERIFIED',JSON.stringify({
 at:source.decision.observedAt,block:source.decision.blockNumber,
 gasPriceGwei:source.decision.gasPriceGwei,balancePros:source.decision.balancePros,
 estimatedCostPros:source.decision.estimatedCostPros,
 decision:source.decision.decision,decidedBy:source.decision.decidedBy,
 realSourceClaim:'Pharos hosted Chain MCP',transactionsSent:false
}));
