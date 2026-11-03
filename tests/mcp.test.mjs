import test from 'node:test';
import assert from 'node:assert/strict';
import {createMcpSession,runMcpComposition} from '../src/mcp.mjs';
import {validateRequest,evaluateSkill} from '../src/skill.mjs';
const SAMPLE='0x74B2c2E4E4B771F0C75dcE44f40787468E323f79';
const chain={name:'Pharos',chainId:1672,expectedChainId:1672,chainIdMatches:true,latestBlock:'200001',nativeSymbol:'PROS'};
const gas={gasPriceWei:'2000000000',gasPriceGwei:'2'};
const balance={address:SAMPLE,balanceWei:'1000000000000000000',balance:'1',symbol:'PROS'};
function mockTransport({badNetwork=false,errorTool='',badSession=false}={}){
 let count=0,session=null;const history=[];
 const fake=async(url,options)=>{
  const method=options.method,params=options.body?JSON.parse(options.body):{};
  history.push({httpMethod:method,mcpMethod:params.method,tool:params.params?.name,
   headers:options.headers});
  if(method==='DELETE')return new Response('',{status:200});
  if(params.method==='initialize'){
   session=badSession?'':'mcp-unit-session';
   return new Response(JSON.stringify({jsonrpc:'2.0',id:params.id,
    result:{protocolVersion:'2025-06-18',serverInfo:{name:'pharos-mcp-server',version:'0.1.0'},
     capabilities:{tools:{}}}}),{status:200,headers:session?{'mcp-session-id':session}:{}});
  }
  if(params.method==='notifications/initialized')return new Response('',{status:202});
  if(params.method==='tools/call'){
   if(!session||options.headers['mcp-session-id']!==session)throw Error('Session not reused correctly');
   count++;
   const name=params.params.name;
   let data;
   if(name==='get_chain_info')data={...chain,...(badNetwork?{chainId:688689,chainIdMatches:false}:{})};
   else if(name==='get_gas_price')data=gas;
   else if(name==='get_balance'){
    assert.deepEqual(params.params.arguments,{address:SAMPLE,block:'200001'});
    data=balance;
   }else throw Error('Unexpected tool '+name);
   const result={content:[{type:'text',text:JSON.stringify(data)}]};
   if(name===errorTool){
    result.isError=true;result.content=[{type:'text',text:JSON.stringify({error:{message:'upstream RPC not available'}})}];
   }
   const response={jsonrpc:'2.0',id:params.id,result};
   if(count%2===0){
    return new Response('event: message\ndata: '+JSON.stringify(response)+'\n\n',{
     status:200,headers:{'content-type':'text/event-stream'}});
   }
   return new Response(JSON.stringify(response),{status:200});
  }
  throw Error('Unexpected MCP method '+params.method);
 };
 return {fake,history};
}
test('real MCP flow: init, notification, 3 tools, then close in one session',async()=>{
 const mock=mockTransport(),request=validateRequest({address:SAMPLE});
 const r=await runMcpComposition(request,mock.fake);
 assert.equal(r.trace.length,4);
 assert.deepEqual(r.trace.slice(1).map(x=>x.method),['get_chain_info','get_gas_price','get_balance']);
 const actual=evaluateSkill(request,r.sources);
 assert.equal(actual.decision,'ALLOW');
 assert.ok(mock.history.some(x=>x.httpMethod==='DELETE'));
 const methods=mock.history.map(x=>x.mcpMethod);
 assert.equal(methods[0],'initialize');
 assert.equal(methods[1],'notifications/initialized');
 assert.equal(mock.history[2].headers['mcp-session-id'],'mcp-unit-session');
});
test('fail closed if chain RPC reports Atlantic rather than hosted mainnet',async()=>{
 const mock=mockTransport({badNetwork:true});
 await assert.rejects(runMcpComposition(validateRequest({}),mock.fake),/network mismatch/i);
 assert.equal(mock.history.filter(x=>x.mcpMethod==='tools/call').length,1);
});
test('MCP tool errors cannot turn into successful Skill data',async()=>{
 const mock=mockTransport({errorTool:'get_gas_price'});
 await assert.rejects(runMcpComposition(validateRequest({}),mock.fake),/upstream RPC not available/);
 assert.equal(mock.history.filter(x=>x.mcpMethod==='tools/call').length,2);
});
test('missing session is not silently replaced by RPC',async()=>{
 const mock=mockTransport({badSession:true});
 await assert.rejects(createMcpSession(mock.fake),/no session ID/);
});
