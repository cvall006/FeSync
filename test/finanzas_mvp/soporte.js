'use strict';
const { createRequire } = require('node:module');
const req = createRequire(require('node:path').join(__dirname, '../../functions/package.json'));
const { Firestore } = req('firebase-admin/firestore');
const { GoogleAuth, OAuth2Client } = req('google-auth-library');
const I = 'fin_mvp_demo', B = `iglesias/${I}`, P = 'a'.repeat(64);
function verificar() {
  if (process.env.GCLOUD_PROJECT !== 'demo-fesync' || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8088' ||
      process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9098' || process.env.GOOGLE_APPLICATION_CREDENTIALS) throw Error('Solo emulador demo.');
}
function abrir() { verificar(); return new Firestore({ projectId:'demo-fesync', host:'127.0.0.1:8088', ssl:false, auth:new GoogleAuth({authClient:new OAuth2Client()}) }); }
async function llamar(nombre, actor, data) {
  verificar();
  const r = await fetch(`http://127.0.0.1:5008/demo-fesync/southamerica-west1/${nombre}`, { method:'POST',
    headers:{'Content-Type':'application/json', ...(actor ? {Authorization:`Bearer ${actor.token}`} : {})}, body:JSON.stringify({data}), signal:AbortSignal.timeout(90000) });
  const result = await r.json();
  if (result.error) throw Object.assign(Error(result.error.message), { code:result.error.status, details:result.error.details });
  if (!Object.hasOwn(result,'result')) throw Error('Respuesta callable inválida'); return result.result;
}
async function preparar(db) {
  verificar(); const users = {};
  for (const nombre of ['admin','encargado','miembro','lider','ajeno']) {
    const email = `${nombre}@finanzas.demo`, password = 'SoloDemo123!';
    const r = await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo', { method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true}) });
    const data = await r.json(); if (!r.ok) throw Error(JSON.stringify(data));
    users[nombre] = {uid:data.localId, token:data.idToken, email};
  }
  const b = db.batch();
  b.create(db.doc(B), {adminUid:users.admin.uid,nombre:'FeSync Finanzas Demo',codigoAcceso:'FINDEMO',modulosActivos:{},estado:'activa'});
  b.create(db.doc('iglesias/fin_mvp_ajena'), {adminUid:users.ajeno.uid,nombre:'Iglesia ajena'});
  for (const [name,u] of Object.entries(users)) b.create(db.doc(`usuarios_globales/${u.uid}`), {
    iglesiaId:name==='ajeno'?'fin_mvp_ajena':I, rolGlobal:['admin','ajeno'].includes(name)?'admin_iglesia':name==='lider'?'lider_area':'servidor',
    pertenenciaId:P,nombre:name,email:u.email,notificacionesPendientes:{},temaOscuro:true });
  b.create(db.doc(`${B}/finanzas_config/acceso`), {moduloHabilitado:true,encargadoUid:users.encargado.uid});
  b.create(db.doc('iglesias/fin_mvp_ajena/finanzas_config/acceso'), {moduloHabilitado:true,encargadoUid:null});
  b.create(db.doc(`finanzas_mvp_fixtures/${I}`), {autorizado:true,adminUid:users.admin.uid});
  b.create(db.doc(`${B}/finanzas_elegibilidad/${users.encargado.uid}`), {habilitado:true,esEncargado:true,version:1});
  await b.commit(); return users;
}
module.exports = {abrir,preparar,llamar,I,B,P};
