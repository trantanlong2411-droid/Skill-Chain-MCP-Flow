import test from 'node:test';
import assert from 'node:assert/strict';
import {units,decimal,validateRequest,evaluateSkill,DEFAULT_POLICY,STRICT_POLICY} from '../src/skill.mjs';
const request=validateRequest({address:'0x74B2c2E4E4B771F0C75dcE44f40787468E323f79'});
const mocked={
 get_chain_info:{name:'Pharos',chainId:1672,expectedChainId:1672,chainIdMatches:true,
 latestBlock:'1111111',nativeSymbol:'PROS'},
 get_gas_price:{gasPriceWei:'1000000000',gasPriceGwei:'1'},
 get_balance:{address:request.address,balanceWei:'10000000000000000000',balance:'10',symbol:'PROS'}
};
test('decimal precision remains exact using bigints',()=>{
 assert.equal(units('1.23456789',9,'test'),1234567890n);
 assert.equal(units('0.000000000000000001',18,'test'),1n);
 assert.equal(decimal(21000000000000n),'0.000021');
});
test('valid policy and the official mainnet ID',()=>{
 assert.equal(validateRequest({}).policy.assumedGasUnits,21000);
 assert.equal(mocked.get_chain_info.chainId,1672);
 assert.equal(validateRequest({policy:STRICT_POLICY}).policy.maxGasGwei,'0');
});
test('a real Chain MCP output is necessary for ALLOW',()=>{
 const result=evaluateSkill(request,mocked,'2026-11-03T00:00:00Z');
 assert.equal(result.decision,'ALLOW');
 assert.deepEqual(result.decidedBy,['ALL_RULES_PASSED']);
 assert.equal(result.estimatedCostPros,'0.000021');
 assert.equal(result.security.broadcast,false);
});
test('changing live gas data changes the decision under the same configured policy',()=>{
 const narrow=validateRequest({policy:{...DEFAULT_POLICY,maxGasGwei:'2'}});
 assert.equal(evaluateSkill(narrow,mocked).decision,'ALLOW');
 const changed={...mocked,get_gas_price:{gasPriceWei:'3000000000'}};
 assert.equal(evaluateSkill(narrow,changed).decision,'HOLD');
 assert.ok(evaluateSkill(narrow,changed).decidedBy.includes('GAS_PRICE_CEILING'));
});
test('strict zero gas ceiling denies a positive real quote',()=>{
 const r=evaluateSkill(validateRequest({policy:STRICT_POLICY}),mocked);
 assert.equal(r.decision,'HOLD');
 assert.ok(r.decidedBy.includes('GAS_PRICE_CEILING'));
});
test('on-chain wallet balance is a live part of the decision',()=>{
 const min=validateRequest({policy:{...DEFAULT_POLICY,minimumWalletPros:'2'}});
 assert.equal(evaluateSkill(min,mocked).decision,'ALLOW');
 const zero={...mocked,get_balance:{...mocked.get_balance,balanceWei:'0'}};
 assert.equal(evaluateSkill(min,zero).decision,'HOLD');
 assert.deepEqual(evaluateSkill(min,zero).decidedBy,['WALLET_MINIMUM']);
});
test('wrong chain, missing MCP data or mismatched account fail closed',()=>{
 assert.throws(()=>evaluateSkill(request,{...mocked,get_chain_info:{...mocked.get_chain_info,chainId:688689}}),/Wrong/);
 assert.throws(()=>evaluateSkill(request,{...mocked,get_gas_price:null}),/Missing/);
 assert.throws(()=>evaluateSkill(request,{...mocked,get_balance:{...mocked.get_balance,address:'0x000000000000000000000000000000000000dEaD'}}),/does not match/);
});
test('invalid address, negative cap and unsupported gas units are rejected',()=>{
 assert.throws(()=>validateRequest({address:'not-an-address'}),/Invalid EVM/);
 assert.throws(()=>validateRequest({policy:{...DEFAULT_POLICY,maxGasGwei:'-5'}}),/nonnegative/);
 assert.throws(()=>validateRequest({policy:{...DEFAULT_POLICY,assumedGasUnits:1}}),/21000/);
});
