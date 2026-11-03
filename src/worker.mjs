import {runMcpComposition} from './mcp.mjs';
import {MAINNET,validateRequest,evaluateSkill} from './skill.mjs';
import {HTML} from './page.mjs';
const json=(payload,status=200)=>new Response(JSON.stringify(payload),{status,
 headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',
 'x-content-type-options':'nosniff','access-control-allow-origin':'same-origin'}});
export default{
 async fetch(req){
  const url=new URL(req.url);
  if(req.method==='GET'&&url.pathname==='/')return new Response(HTML,{
   headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store',
    'x-content-type-options':'nosniff'}});
  if(req.method==='GET'&&url.pathname==='/api/health')
   return json({ok:true,service:'skill-chain-mcp-flow',
    chainMcp:{endpoint:MAINNET.mcp,chainId:MAINNET.chainId,
     connectionTested:false,note:'Local health does not test the external MCP service'},
    skill:'pharos-gas-readiness-gate',readOnly:true,sendTransactions:false});
  if(req.method!=='POST'||url.pathname!=='/api/run')
   return json({ok:false,error:'Not found'},404);
  let body;
  try{
   if(Number(req.headers.get('content-length')||0)>4096)throw Error('Request too large');
   const raw=await req.text();
   if(raw.length>4096)throw Error('Request too large');
   body=JSON.parse(raw);
  }catch(e){return json({ok:false,decision:'ERROR_NO_DECISION',error:String(e.message||e)},400)}
  let request;
  try{request=validateRequest(body)}
  catch(e){return json({ok:false,decision:'ERROR_NO_DECISION',error:String(e.message||e)},400)}
  try{
   const {sources,trace}=await runMcpComposition(request);
   const result=evaluateSkill(request,sources);
   trace.push({step:5,component:'SkillEngine Skill',skill:result.skill,
    input:{chainId:sources.get_chain_info.chainId,block:sources.get_chain_info.latestBlock,
     gasWei:sources.get_gas_price.gasPriceWei,balanceWei:sources.get_balance.balanceWei,
     policy:request.policy},output:{decision:result.decision,decidedBy:result.decidedBy,
      rules:result.rules,estimatedCostPros:result.estimatedCostPros}});
   return json({ok:true,composition:'CHAIN_MCP_DATA_TO_SKILL_DECISION',
    network:'Pharos Mainnet',chainId:MAINNET.chainId,
    mcpEndpoint:MAINNET.mcp,connection:'STREAMABLE_HTTP_MCP',
    genuineMcpToolCalls:['get_chain_info','get_gas_price','get_balance'],
    toolsUsed:2,steps:trace.length,trace,decision:result,
    execution:'READ_ONLY_ANALYSIS',transactionBroadcast:false});
  }catch(e){
   return json({ok:false,composition:'MCP_UNAVAILABLE_NO_SKILL_DECISION',
    error:String(e.message||e).slice(0,390),errorCode:e.code||'MCP_FAILURE',
    trace:e.flowTrace||[],decision:null,transactionBroadcast:false},502);
  }
 }
};
