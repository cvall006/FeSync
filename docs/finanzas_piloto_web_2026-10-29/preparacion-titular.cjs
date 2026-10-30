'use strict';
const assert=require('node:assert/strict');
const {migrarPerfilPertenencia}=require('../../functions/migraciones/pertenencia_ejecucion');
const {pertenenciaIdValido}=require('../../functions/pertenencia');
const version=s=>`${s.updateTime.seconds}:${s.updateTime.nanoseconds}`;
async function aplicar({db,FieldValue,seleccion,versionIglesia,guardas}){
const {uid,iglesiaId}=seleccion;assert.equal(iglesiaId,'8IYVbD8z9U3noEYzkpUZ');
const profile=db.collection('usuarios_globales').doc(uid),church=db.collection('iglesias').doc(iglesiaId),receipt=db.collection('migraciones_pertenencia').doc(uid);
const protectedDb={collection:db.collection.bind(db),runTransaction:fn=>db.runTransaction(async tx=>{
await guardas(uid);const p=await tx.get(profile),i=await tx.get(church),r=await tx.get(receipt);
assert.ok(p.exists&&i.exists);assert.equal(i.data().adminUid,uid,'TITULAR_CAMBIO');assert.equal(version(i),versionIglesia,'IGLESIA_CAMBIO');assert.equal(p.data().iglesiaId,iglesiaId);assert.equal(p.data().rolGlobal,'admin_iglesia','SOLO_TITULAR');
if(pertenenciaIdValido(p.data().pertenenciaId)&&r.exists){assert.equal(r.data().pertenenciaId,p.data().pertenenciaId);assert.equal(r.data().origen,'migracion_pertenencia_v1');assert.equal(r.data().iglesiaId,iglesiaId);assert.equal(r.data().versionPerfilAnterior,seleccion.version);return{categoria:'omitido',motivo:'titular_preparado_verificado'};}
assert.ok(!Object.hasOwn(p.data(),'pertenenciaId'),'NO_REASIGNAR');assert.ok(!r.exists,'COMPROBANTE_PREVIO');assert.equal(version(p),seleccion.version,'PERFIL_CAMBIO');
const cache=new Map([[profile.path,p],[church.path,i],[receipt.path,r]]);
return fn({get:async ref=>{assert.ok(cache.has(ref.path));return cache.get(ref.path);},update:(ref,d)=>{assert.equal(ref.path,profile.path);assert.deepEqual(Object.keys(d),['pertenenciaId']);assert.ok(pertenenciaIdValido(d.pertenenciaId));tx.update(ref,d);},create:(ref,d)=>{assert.equal(ref.path,receipt.path);assert.deepEqual(Object.keys(d).sort(),['fechaCreacion','iglesiaId','origen','pertenenciaId','version','versionPerfilAnterior']);assert.equal(d.iglesiaId,iglesiaId);assert.equal(d.versionPerfilAnterior,seleccion.version);tx.create(ref,d);}});
})};
return migrarPerfilPertenencia({db:protectedDb,FieldValue,seleccion});
}
module.exports={aplicar,version};
