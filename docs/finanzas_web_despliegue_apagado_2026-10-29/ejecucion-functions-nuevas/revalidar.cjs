'use strict';
// Solo configuración GET y renovación de sesión existente en memoria.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const assert = require('node:assert/strict');
const base = path.resolve(__dirname, '..'), out = __dirname;
const project = 'fesync-app-2026', cli = 'C:/Users/igles/AppData/Roaming/npm/node_modules/firebase-tools/lib/';
const manifest = JSON.parse(fs.readFileSync(path.join(base, 'manifest.json')));
const previous = JSON.parse(fs.readFileSync(path.resolve(base, '../firebase_preflight_2026-10-28/resultado-remoto.json')));
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const canon = v => v === null || typeof v !== 'object' ? JSON.stringify(v) : Array.isArray(v)
  ? '[' + v.map(canon).join(',') + ']' : '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
let token;
const result = { proyecto: project, inicio: new Date().toISOString(), audit: [], desplegado: false, escriturasFirebase: 0 };
async function get(host, route) {
  assert.ok(['cloudfunctions.googleapis.com', 'serviceusage.googleapis.com'].includes(host));
  assert.ok(route.includes('/projects/' + project + '/') || route.includes('/projects/336914296469/'));
  const r = await fetch('https://' + host + route, { method: 'GET', redirect: 'error', headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(20000) });
  result.audit.push({ metodo: 'GET', host, route, http: r.status });
  if (!r.ok) throw Error('LECTURA_HTTP_' + r.status);
  return r.json();
}
async function inventory() {
  const functions = []; let next;
  do {
    const route = '/v2/projects/' + project + '/locations/-/functions?pageSize=100' + (next ? '&pageToken=' + encodeURIComponent(next) : '');
    const d = await get('cloudfunctions.googleapis.com', route);
    assert.ok(!d.unreachable?.length, 'Inventario incompleto');
    for (const f of d.functions || []) functions.push({ name: f.name, state: f.state, updateTime: f.updateTime,
      revision: f.serviceConfig?.revision ?? null, runtime: f.buildConfig?.runtime, environment: f.environment,
      configDigest: sha(canon(f)) });
    next = d.nextPageToken;
  } while (next);
  return functions.sort((a, b) => a.name.localeCompare(b.name));
}
(async () => {
  assert.equal(manifest.digest, sha(JSON.stringify(manifest.files)));
  for (const f of manifest.files) assert.equal(sha(fs.readFileSync(path.join(base, 'paquete', f.path))), f.sha256, f.path);
  const env = require(cli + 'functions/env').loadUserEnvs({ projectDir: path.join(base, 'paquete'), functionsSource: path.join(base, 'paquete/functions'), projectId: project, isEmulator: false });
  assert.equal(env.FINANZAS_V1_SERVIDOR_HABILITADO, 'false');
  result.paquete = { digest: manifest.digest, archivos: manifest.files.length, servidorHabilitado: false, clienteHabilitado: manifest.clienteHabilitado };
  const c = require(cli + 'configstore').configstore.get('tokens');
  if (!c) throw Error('SESION_AUSENTE');
  token = c.access_token;
  if (!token || c.expires_at < Date.now() + 60000) {
    const api = require(cli + 'api');
    const r = await fetch('https://www.googleapis.com/oauth2/v3/token', { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: c.refresh_token, client_id: api.clientId(), client_secret: api.clientSecret() }), signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw Error('SESION_NO_RENOVABLE');
    const d = await r.json(); if (!d.access_token) throw Error('TOKEN_AUSENTE'); token = d.access_token;
    result.audit.push({ operacion: 'Renovacion OAuth existente solo en memoria', http: r.status });
  }
  result.antes = await inventory();
  const names = result.antes.map(f => f.name.split('/').pop()).sort();
  assert.equal(names.length, 13);
  assert.deepEqual(names, previous.functions.map(f => f.name.split('/').pop()).sort());
  assert.ok(result.antes.every(f => f.state === 'ACTIVE' && f.runtime === 'nodejs24' && f.environment === 'GEN_2' && f.name.includes('/locations/southamerica-west1/')));
  assert.ok(manifest.plan.crear.every(n => !names.includes(n)), 'Function nueva ya existente');
  result.nuevasAusentes = manifest.plan.crear;
  result.apis = [];
  for (const service of ['cloudfunctions.googleapis.com', 'cloudbuild.googleapis.com', 'artifactregistry.googleapis.com', 'run.googleapis.com', 'eventarc.googleapis.com', 'pubsub.googleapis.com', 'storage.googleapis.com']) {
    const d = await get('serviceusage.googleapis.com', '/v1/projects/336914296469/services/' + service);
    result.apis.push({ nombre: service, estado: d.state });
    assert.equal(d.state, 'ENABLED', 'API requiere habilitacion: ' + service);
  }
  const fabricator = fs.readFileSync(cli + 'deploy/functions/release/fabricator.js', 'utf8');
  assert.ok(fabricator.includes('run.setInvokerCreate(endpoint.project, serviceName, ["public"])'));
  result.detencion = 'El CLI configura IAM de invocacion publica en los servicios Cloud Run nuevos. No se ejecuta deploy ante la condicion de detener por cambios IAM no aprobados.';
  result.despues = await inventory();
  assert.deepEqual(result.despues, result.antes, 'Cambio remoto durante revalidacion');
  result.treceIntactasDuranteConsulta = true;
  result.completa = true;
})().catch(e => { result.completa = false; result.error = e.message; process.exitCode = 1; })
  .finally(() => { token = undefined; result.fin = new Date().toISOString(); fs.writeFileSync(path.join(out, 'resultado.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ completa: result.completa, paquete: result.paquete, existentes: result.antes?.length, nuevasAusentes: result.nuevasAusentes, apis: result.apis, treceIntactas: result.treceIntactasDuranteConsulta, detencion: result.detencion, error: result.error, desplegado: false, escriturasFirebase: 0 })); });
