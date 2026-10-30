'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),{cli}=require('./sesion.cjs');
async function access(){const tokens=require(cli+'configstore').configstore.get('tokens');assert.ok(tokens);if(tokens.access_token&&tokens.expires_at>Date.now()+60000)return tokens.access_token;const api=require(cli+'api'),resp=await fetch('https://www.googleapis.com/oauth2/v3/token',{method:'POST',redirect:'error',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:tokens.refresh_token,client_id:api.clientId(),client_secret:api.clientSecret()}),signal:AbortSignal.timeout(20000)});assert.equal(resp.status,200);return(await resp.json()).access_token;}
async function sourceHash(config){
 const s=config.source.storageSource;assert.equal(s.bucket,'gcf-v2-sources-336914296469-southamerica-west1');assert.ok(['finanzasV1Consultar/function-source.zip','finanzasV1Ejecutar/function-source.zip'].includes(s.object));assert.match(s.generation,/^\d+$/);
 const token=await access(),url='https://storage.googleapis.com/storage/v1/b/'+s.bucket+'/o/'+encodeURIComponent(s.object)+'?alt=media&generation='+s.generation;
 const r=await fetch(url,{headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(45000)});assert.equal(r.status,200,'LECTURA_ARTEFACTO');const b=Buffer.from(await r.arrayBuffer());return{sha256:crypto.createHash('sha256').update(b).digest('hex'),bytes:b.length};
}
async function verifySource(before,after){
 const a=structuredClone(before.buildConfig),b=structuredClone(after.buildConfig);
 delete a.build;delete b.build;delete a.source.storageSource.generation;delete b.source.storageSource.generation;delete a.sourceProvenance;delete b.sourceProvenance;
 assert.deepEqual(b,a,'BUILD_CONFIG_ADICIONAL_CAMBIO');
 const old=await sourceHash(before.buildConfig),current=await sourceHash(after.buildConfig);assert.deepEqual(current,old,'FUENTE_ARCHIVO_DIFERENTE');return{...current,buildAnterior:before.buildConfig.build,buildActual:after.buildConfig.build,generacionAnterior:before.buildConfig.source.storageSource.generation,generacionActual:after.buildConfig.source.storageSource.generation};
}
module.exports={access,verifySource};
