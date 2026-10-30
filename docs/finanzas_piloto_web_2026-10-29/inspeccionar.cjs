'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {sesion,P,I}=require('./sesion.cjs');
const decode=v=>'stringValue'in v?v.stringValue:'booleanValue'in v?v.booleanValue:'integerValue'in v?v.integerValue:'nullValue'in v?null:v.arrayValue?(v.arrayValue.values||[]).map(decode):v.mapValue?Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,v])=>[k,decode(v)])):'TIPO_NO_ADMITIDO';
const result={proyecto:P,iglesia:I,escriturasRemotas:0,at:new Date().toISOString()};
const save=()=>fs.writeFileSync(path.join(__dirname,'inspeccion.json'),JSON.stringify(result,null,2)+'\n');
async function main(){
const request=await sesion(),root='/v1/projects/'+P+'/databases/(default)/documents/',readTime=new Date(Date.now()-3000).toISOString();
async function doc(route,fields){const u=new URL('https://firestore.googleapis.com'+root+route);for(const f of fields)u.searchParams.append('mask.fieldPaths',f);u.searchParams.set('readTime',readTime);const d=await request(u.hostname,u.pathname+u.search,{missing:true});return d?{exists:true,updateTime:d.updateTime,data:Object.fromEntries(Object.entries(d.fields||{}).map(([k,v])=>[k,decode(v)]))}:{exists:false};}
const church=await doc('iglesias/'+I,['adminUid']);assert.ok(church.exists);const uid=church.data.adminUid;assert.match(uid,/^[A-Za-z0-9_-]{1,128}$/);
const owner=await doc('usuarios_globales/'+uid,['iglesiaId','rolGlobal','pertenenciaId']);assert.ok(owner.exists);assert.equal(owner.data.iglesiaId,I);assert.equal(owner.data.rolGlobal,'admin_iglesia');
const migration=await doc('migraciones_pertenencia/'+uid,['version','origen','iglesiaId','pertenenciaId','versionPerfilAnterior']);
const privateDir=path.resolve(__dirname,'../../migrate_working_dir/finanzas_titular_8iyv_2026-10-29');fs.mkdirSync(privateDir,{recursive:true});
const snapshot={proyecto:P,iglesia:I,uid,readTime,church,owner,migration};fs.writeFileSync(path.join(privateDir,'seleccion-respaldo.json'),JSON.stringify(snapshot,null,2)+'\n',{flag:'wx'});fs.writeFileSync(path.join(privateDir,'seleccion-respaldo.copia.json'),JSON.stringify(snapshot,null,2)+'\n',{flag:'wx'});
result.titular={perfilExiste:true,iglesiaYRolCoherentes:true,pertenencia:Object.hasOwn(owner.data,'pertenenciaId')?'PRESENTE_REQUIERE_REVISION':'AUSENTE',comprobanteMigracionExiste:migration.exists};result.respaldoPrivado=path.relative(path.resolve(__dirname,'../..'),privateDir).replaceAll('\\','/');save();
if(Object.hasOwn(owner.data,'pertenenciaId')||migration.exists)throw Error('Pertenencia o comprobante previo: revisar, no reasignar');
result.metadataLibro={};
for(const [route,fields] of Object.entries({'finanzas_control/protocolo':['versionProtocolo','iglesiaId','epoca','estado'],'finanzas_control/libro':['versionEsquema','iglesiaId','huboMovimientos'],'finanzas_control/periodo':['versionEsquema','iglesiaId','periodosAbiertos'],'finanzas_control/incremental_v1':['versionEsquema','iglesiaId','epoca','estadoVerificacion'],'finanzas_config/contabilidad':['versionEsquema','iglesiaId'],'finanzas_config/acceso':['moduloHabilitado'],'finanzas_control/publicacion_v1':['versionEsquema','iglesiaId','habilitado']}))result.metadataLibro[route]=await doc('iglesias/'+I+'/'+route,fields);
result.coleccionesFinancieras={};
for(const name of ['control','config','cuentas','categorias','movimientos','saldos','resumenes','aperturas','reversiones','cierres','reservas_cuentas','reservas_categorias','auditoria','elegibilidad']){const d=await request('firestore.googleapis.com',root+'iglesias/'+I+':runQuery',{body:{structuredQuery:{select:{fields:[{fieldPath:'__name__'}]},from:[{collectionId:'finanzas_'+name}],limit:1},readTime}});result.coleccionesFinancieras['finanzas_'+name]={existeAlgunDocumento:d.some(x=>x.document)};save();}
result.libroSinDocumentosPrevios=Object.values(result.metadataLibro).every(d=>!d.exists)&&Object.values(result.coleccionesFinancieras).every(d=>!d.existeAlgunDocumento);
if(!result.libroSinDocumentosPrevios)throw Error('Documentos financieros previos: detener sin inicializar');
try{const a=await request('identitytoolkit.googleapis.com','/admin/v2/projects/'+P+'/config?fields=authorizedDomains,signIn.email,recaptchaConfig.emailPasswordEnforcementState');result.auth={configLeida:true,authorizedDomains:a.authorizedDomains||[],emailPassword:a.signIn?.email?.enabled===true,recaptchaEmailPassword:a.recaptchaConfig?.emailPasswordEnforcementState??null};}catch(e){result.auth={configLeida:false,error:e.message};}
try{const a=await request('identitytoolkit.googleapis.com','/v1/projects/'+P+'/accounts:lookup?fields=users(localId,disabled,providerUserInfo(providerId))',{body:{localId:[uid]}});const u=(a.users||[]).find(x=>x.localId===uid);assert.ok(u&&!u.disabled,'Titular Auth ausente/deshabilitado');result.authTitular={vigente:true,providers:(u.providerUserInfo||[]).map(x=>x.providerId)};}catch(e){result.authTitular={verificado:false,error:e.message};}
result.completa=true;save();console.log(JSON.stringify({titular:result.titular,libroSinDocumentosPrevios:result.libroSinDocumentosPrevios,auth:result.auth,authTitular:result.authTitular,preparacionEjecutada:false}));
}
main().catch(e=>{result.completa=false;result.detencion=e.message;save();console.error('DETENIDO: '+e.message);process.exitCode=1;});
