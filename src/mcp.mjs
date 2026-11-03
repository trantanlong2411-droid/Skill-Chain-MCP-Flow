// Real Streamable HTTP MCP client for the Pharos hosted Chain MCP.
// The single request executes initialize -> initialized notification -> tools/call (3x)
// within one session; it DOES NOT call Pharos JSON-RPC directly.
import {MAINNET} from './skill.mjs';
const PROTOCOL='2025-06-18';
const ENDPOINT=MAINNET.mcp;
const HEADERS={'content-type':'application/json','accept':'application/json, text/event-stream'};
function decodeResponse(text){
 const raw=text.trim();
 if(raw.startsWith('{'))return JSON.parse(raw);
 // MCP Streamable HTTP may wrap JSON-RPC in an SSE "message" event.
 const events=raw.split(/\r?\n\r?\n/).map(chunk=>chunk.split(/\r?\n/)
  .filter(line=>line.startsWith('data:'))
  .map(line=>line.slice(5).trimStart()).join('\n')).filter(Boolean);
 for(const event of events.reverse()){
  if(event==='[DONE]')continue;
  try{const message=JSON.parse(event);if(message.jsonrpc==='2.0')return message;}catch{}
 }
 throw Error('Chain MCP returned no parseable JSON-RPC message');
}
function toolPayload(response,tool){
 if(response.error)throw Error('MCP '+tool+': '+String(response.error.message||'protocol error'));
 const result=response.result;
 if(result?.isError)throw Error('MCP '+tool+' failed: '+String(result.content?.find(x=>x.type==='text')?.text||'Unknown tool error').slice(0,260));
 const raw=result?.content?.find(x=>x.type==='text')?.text;
 if(typeof raw!=='string')throw Error('MCP '+tool+' returned no text content');
 const data=JSON.parse(raw);
 if(data?.error)throw Error('MCP '+tool+' returned a tool error: '+String(data.error.message||'unknown').slice(0,200));
 if(data===null||typeof data!=='object')throw Error('MCP '+tool+' content malformed');
 return data;
}
export async function createMcpSession(fetcher=fetch,url=ENDPOINT){
 let session='',counter=0,closed=false;
 async function send(method,params,notification=false){
  if(closed)throw Error('MCP session already closed');
  const id=notification?undefined:++counter;
  const body={jsonrpc:'2.0',...(notification?{}:{id}),method,...(params===undefined?{}:{params})};
  const response=await fetcher(url,{
   method:'POST',headers:{...HEADERS,'mcp-protocol-version':PROTOCOL,
    ...(session?{'mcp-session-id':session}:{})},
   body:JSON.stringify(body),signal:AbortSignal.timeout(24000)
  });
  if(response.status===429){
   const retry=response.headers.get('retry-after');
   const error=Error('Pharos hosted Chain MCP rate limit (429)'+(retry?' Retry-After: '+retry+'s':''));
   error.code='RATE_LIMIT';throw error;
  }
  if(!response.ok){
   const raw=await response.text();
   throw Error('Chain MCP HTTP '+response.status+': '+raw.slice(0,160));
  }
  const sid=response.headers.get('mcp-session-id');
  if(sid)session=sid;
  if(notification)return null;
  const json=decodeResponse(await response.text());
  if(json.id!==id)throw Error('Chain MCP response ID mismatch');
  if(json.error)throw Error('Chain MCP protocol: '+String(json.error.message||'Unknown JSON-RPC error'));
  return json;
 }
 const init=await send('initialize',{
  protocolVersion:PROTOCOL,capabilities:{},
  clientInfo:{name:'pharos-skill-chain-composition',version:'1.0.0'}
 });
 if(init.result?.serverInfo?.name!=='pharos-mcp-server')throw Error('Unexpected hosted MCP server identity');
 if(!session)throw Error('Hosted MCP returned no session ID; cannot compose tool calls safely');
 await send('notifications/initialized',undefined,true);
 return {
  sessionEstablished:true,serverInfo:init.result.serverInfo,
  async call(name,args={}){
   if(!['get_chain_info','get_balance','get_gas_price'].includes(name))throw Error('Tool not allowed in this read-only composition');
   return toolPayload(await send('tools/call',{name,arguments:args}),name);
  },
  async close(){
   closed=true;
   if(!session)return;
   try{await fetcher(url,{method:'DELETE',headers:{...HEADERS,'mcp-session-id':session,
    'mcp-protocol-version':PROTOCOL},signal:AbortSignal.timeout(3500)});}
   catch{}
  }
 };
}
export async function runMcpComposition(request,fetcher=fetch){
 const trace=[];let session;
 try{
  session=await createMcpSession(fetcher);
  trace.push({step:1,component:'Chain MCP',phase:'initialize',
   status:'OK',server:session.serverInfo.name});
  const chain=await session.call('get_chain_info',{});
  trace.push({step:2,component:'Chain MCP',method:'get_chain_info',status:'OK',
   output:chain});
  // Verify chain before invoking any other tool; never silently mix Atlantic and Mainnet.
  if(chain.chainId!==MAINNET.chainId||chain.chainIdMatches!==true)
   throw Error('MCP network mismatch: expected Pharos Mainnet 1672');
  const gas=await session.call('get_gas_price',{});
  trace.push({step:3,component:'Chain MCP',method:'get_gas_price',status:'OK',output:gas});
  const balance=await session.call('get_balance',{
   address:request.address,block:String(chain.latestBlock)
  });
  trace.push({step:4,component:'Chain MCP',method:'get_balance',status:'OK',
   arguments:{address:request.address,block:String(chain.latestBlock)},output:balance});
  return {sources:{get_chain_info:chain,get_gas_price:gas,get_balance:balance},trace};
 }catch(error){
  const e=Error(String(error.message||error));
  e.flowTrace=trace;e.code=error.code||'MCP_FAILURE';
  throw e;
 }finally{if(session)await session.close()}
}
