// SkillEngine-style custom skill: deterministic policy consumes Chain MCP output
// with no on-chain write, unsigned transaction or wallet access.
export const MAINNET=Object.freeze({chainId:1672,nativeSymbol:'PROS',
 mcp:'https://mcp.pharos.xyz/mcp'});
export const SAMPLE_ADDRESS='0x74B2c2E4E4B771F0C75dcE44f40787468E323f79';
const DECIMAL=/^(?:0|[1-9]\d*)(?:\.\d+)?$/;
export function units(text,decimals,name){
 const raw=String(text??'');
 if(!DECIMAL.test(raw))throw Error(name+' must be a nonnegative decimal');
 const [whole,fraction='']=raw.split('.');
 if(fraction.length>decimals)throw Error(name+' supports at most '+decimals+' decimal places');
 if(whole.length>32)throw Error(name+' is too large');
 return BigInt(whole)*10n**BigInt(decimals)+BigInt((fraction+'0'.repeat(decimals)).slice(0,decimals)||'0');
}
export function decimal(value,places=18){
 const n=BigInt(value),base=10n**BigInt(places);
 const f=(n%base).toString().padStart(places,'0').replace(/0+$/,'');
 return (n/base).toString()+(f?'.'+f:'');
}
export const DEFAULT_POLICY=Object.freeze({
 maxGasGwei:'1000000',maxEstimatedCostPros:'100',minimumWalletPros:'0',
 assumedGasUnits:21000
});
export const STRICT_POLICY=Object.freeze({
 maxGasGwei:'0',maxEstimatedCostPros:'0',minimumWalletPros:'0',
 assumedGasUnits:21000
});
export function validateRequest(raw={}){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Invalid request body');
 const address=String(raw.address||SAMPLE_ADDRESS);
 if(!/^0x[0-9a-fA-F]{40}$/.test(address))throw Error('Invalid EVM account address');
 const source=raw.policy||DEFAULT_POLICY;
 if(!source||typeof source!=='object'||Array.isArray(source))throw Error('Invalid skill policy');
 const policy={
  maxGasGwei:String(source.maxGasGwei??DEFAULT_POLICY.maxGasGwei),
  maxEstimatedCostPros:String(source.maxEstimatedCostPros??DEFAULT_POLICY.maxEstimatedCostPros),
  minimumWalletPros:String(source.minimumWalletPros??DEFAULT_POLICY.minimumWalletPros),
  assumedGasUnits:Number(source.assumedGasUnits??DEFAULT_POLICY.assumedGasUnits)
 };
 const maxGasWei=units(policy.maxGasGwei,9,'maxGasGwei');
 const maxCostWei=units(policy.maxEstimatedCostPros,18,'maxEstimatedCostPros');
 const minBalanceWei=units(policy.minimumWalletPros,18,'minimumWalletPros');
 if(!Number.isSafeInteger(policy.assumedGasUnits)||policy.assumedGasUnits<21000||policy.assumedGasUnits>500000)
  throw Error('assumedGasUnits must be 21000–500000');
 if(maxGasWei>10n**21n||maxCostWei>10n**27n||minBalanceWei>10n**30n)
  throw Error('Policy cap outside supported range');
 return {address,policy,limits:{maxGasWei,maxCostWei,minBalanceWei}};
}
function asUInt(x,name){
 if(typeof x!=='string'||!/^\d+$/.test(x))throw Error('MCP '+name+' is missing or malformed');
 return BigInt(x);
}
export function evaluateSkill(request,sources,observedAt=new Date().toISOString()){
 const chain=sources.get_chain_info,gas=sources.get_gas_price,balance=sources.get_balance;
 if(!chain||!gas||!balance)throw Error('Missing one or more required Chain MCP outputs');
 if(chain.chainId!==MAINNET.chainId||chain.expectedChainId!==MAINNET.chainId||chain.chainIdMatches!==true)
  throw Error('Wrong Chain MCP network; expected Pharos Mainnet 1672');
 const latestBlock=asUInt(chain.latestBlock,'latestBlock');
 if(latestBlock<=0n)throw Error('Chain MCP returned an invalid latest block');
 if(String(chain.nativeSymbol)!==MAINNET.nativeSymbol)throw Error('Unexpected Chain MCP native symbol');
 if(String(balance.address).toLowerCase()!==request.address.toLowerCase())
  throw Error('Chain MCP balance address does not match the requested account');
 const price=asUInt(gas.gasPriceWei,'gasPriceWei');
 const available=asUInt(balance.balanceWei,'balanceWei');
 const gasUnits=BigInt(request.policy.assumedGasUnits);
 const estimatedWei=price*gasUnits;
 const rules=[
  {name:'GAS_PRICE_CEILING',passed:price<=request.limits.maxGasWei,
   observed:decimal(price,9)+' Gwei',
   required:'≤ '+request.policy.maxGasGwei+' Gwei'},
  {name:'COST_BUDGET',passed:estimatedWei<=request.limits.maxCostWei,
   observed:decimal(estimatedWei)+' PROS (estimate)',
   required:'≤ '+request.policy.maxEstimatedCostPros+' PROS'},
  {name:'WALLET_MINIMUM',passed:available>=request.limits.minBalanceWei,
   observed:decimal(available)+' PROS',
   required:'≥ '+request.policy.minimumWalletPros+' PROS'}
 ];
 const failed=rules.filter(x=>!x.passed);
 return {
  skill:'pharos-gas-readiness-gate',skillVersion:'1.0.0',
  decision:failed.length?'HOLD':'ALLOW',
  decidedBy:failed.length?failed.map(x=>x.name):['ALL_RULES_PASSED'],
  explanation:failed.length?
   'Chain MCP live readings did not satisfy the configured limits; no action is prepared.':
   'Chain MCP live readings satisfy the configured monitoring policy; only a recommendation was made.',
  rules,network:chain.chainId,chainName:chain.name,
  blockNumber:latestBlock.toString(),
  address:request.address,gasPriceWei:price.toString(),gasPriceGwei:decimal(price,9),
  balanceWei:available.toString(),balancePros:decimal(available),
  assumedGasUnits:request.policy.assumedGasUnits,
  estimatedCostWei:estimatedWei.toString(),estimatedCostPros:decimal(estimatedWei),
  observedAt,policy:request.policy,
  security:{readOnly:true,broadcast:false,signatureRequired:false,
   note:'This is a policy recommendation. Assumed gas units are not an eth_estimateGas result.'}
 };
}
