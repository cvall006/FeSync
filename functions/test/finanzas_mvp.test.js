'use strict';
const {test} = require('node:test'), assert = require('node:assert/strict');
const {entorno} = require('./finanzas_mvp_runtime/api');
const valido = {GCLOUD_PROJECT:'demo-fesync',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8088',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9098',FUNCTIONS_EMULATOR:'true'};
test('FIN-MVP: solo runtime local demo, nunca producción ni credenciales',()=>{
  assert.doesNotThrow(()=>entorno(valido));
  assert.doesNotThrow(()=>entorno({...valido,GOOGLE_CLOUD_PROJECT:'demo-fesync'}));
  for(const campo of Object.keys(valido)) assert.throws(()=>entorno({...valido,[campo]:undefined}),/SOLO_EMULADOR_DEMO/);
  for(const cambio of [{GCLOUD_PROJECT:'fesync-app-2026'},{FIRESTORE_EMULATOR_HOST:'firestore.googleapis.com:443'},
    {GOOGLE_CLOUD_PROJECT:'fesync-app-2026'},{GOOGLE_CLOUD_PROJECT:''},
    {FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099'},{GOOGLE_APPLICATION_CREDENTIALS:'archivo.json'},
    {FIREBASE_TOKEN:'no-permitido'},{GOOGLE_OAUTH_ACCESS_TOKEN:'no-permitido'}])
    assert.throws(()=>entorno({...valido,...cambio}),/SOLO_EMULADOR_DEMO/);
});
