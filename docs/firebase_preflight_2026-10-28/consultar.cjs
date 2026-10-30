'use strict';
// Auditoría autorizada: proyecto fijo, GET de configuración, nunca documentos ni invocaciones.
const fs = require('node:fs');
const path = require('node:path');
const project = 'fesync-app-2026';
const cli = 'C:/Users/igles/AppData/Roaming/npm/node_modules/firebase-tools/lib/';
const out = __dirname;
const audit = [];
const result = { project, startedAt: new Date().toISOString(), audit };
function save(name, value) { fs.writeFileSync(path.join(out, name), JSON.stringify(value, null, 2)); }
let token;
async function get(host, route, optional404 = false) {
  if (!['cloudresourcemanager.googleapis.com', 'firebaserules.googleapis.com',
    'cloudfunctions.googleapis.com', 'firebasehosting.googleapis.com',
    'cloudbilling.googleapis.com', 'serviceusage.googleapis.com'].includes(host)) throw Error('HOST_NO_AUTORIZADO');
  if (!route.includes(project) && !route.includes('/projects/336914296469/')) throw Error('PROYECTO_NO_AUTORIZADO');
  const url = `https://${host}${route}`;
  const response = await fetch(url, { method: 'GET', redirect: 'error',
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) });
  const data = await response.json();
  audit.push({ method: 'GET', host, route, http: response.status, at: new Date().toISOString() });
  save('resultado-remoto.json', result);
  if (optional404 && response.status === 404) return null;
  if (!response.ok) {
    result.blocked = { http: response.status, host, route, status: data.error?.status,
      reason: data.error?.details?.find(x => x.reason)?.reason,
      message: data.error?.message?.slice(0, 800) };
    throw Error(`LECTURA_RECHAZADA_HTTP_${response.status}`);
  }
  return data;
}
async function paged(host, route, field) {
  let pageToken, values = [], unreachable = [];
  do {
    const data = await get(host, route + (pageToken ? `${route.includes('?') ? '&' : '?'}pageToken=${encodeURIComponent(pageToken)}` : ''));
    values.push(...(data[field] || [])); unreachable.push(...(data.unreachable || []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return { values, unreachable };
}
async function main() {
  if (process.argv.length !== 2) throw Error('SIN_DESTINOS_ALTERNATIVOS');
  const credentials = require(cli + 'configstore').configstore.get('tokens');
  if (!credentials) throw Error('SIN_SESION_CLI');
  token = credentials.access_token;
  if (!token || credentials.expires_at < Date.now() + 60000) {
    // Renovación OAuth en memoria: no modifica la sesión almacenada ni recursos Firebase.
    const api = require(cli + 'api');
    const response = await fetch('https://www.googleapis.com/oauth2/v3/token', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: credentials.refresh_token,
        client_id: api.clientId(), client_secret: api.clientSecret() }) });
    const data = await response.json();
    audit.push({ method: 'POST', host: 'www.googleapis.com', route: '/oauth2/v3/token',
      purpose: 'autenticacion OAuth solo en memoria', http: response.status });
    if (!response.ok || !data.access_token) throw Error('SESION_OAUTH_NO_DISPONIBLE');
    token = data.access_token;
  }
  const identity = await get('cloudresourcemanager.googleapis.com', `/v1/projects/${project}`);
  if (identity.projectId !== project || String(identity.projectNumber) !== '336914296469') throw Error('IDENTIDAD_NO_COINCIDE');
  result.identity = { projectId: identity.projectId, projectNumber: identity.projectNumber, lifecycleState: identity.lifecycleState };
  console.log('Identidad del proyecto confirmada.');
  const releases = await paged('firebaserules.googleapis.com', `/v1/projects/${project}/releases?pageSize=100`, 'releases');
  result.rules = [];
  for (const release of releases.values) {
    if (!/\/releases\/(cloud\.firestore|firebase\.storage)(\/|$)/.test(release.name)) continue;
    if (!new RegExp(`^projects/(${project}|336914296469)/rulesets/[a-zA-Z0-9-]+$`).test(release.rulesetName)) throw Error('RULESET_FUERA_DE_PROYECTO');
    const ruleset = await get('firebaserules.googleapis.com', `/v1/${release.rulesetName}`);
    const index = result.rules.length;
    for (const [i, file] of (ruleset.source?.files || []).entries()) {
      fs.writeFileSync(path.join(out, `remoto-${index}-${i}.rules`), file.content);
    }
    result.rules.push({ name: release.name, rulesetName: release.rulesetName, updateTime: release.updateTime,
      files: (ruleset.source?.files || []).map((f, i) => ({ name: f.name, snapshot: `remoto-${index}-${i}.rules` })) });
  }
  console.log('Reglas desplegadas leídas.');
  const functions = [];
  for (const version of ['v1', 'v2']) {
    const route = `/${version}/projects/${project}/locations/-/functions` + (version === 'v2' ? '?filter=environment%3D%22GEN_2%22' : '');
    const listed = await paged('cloudfunctions.googleapis.com', route, 'functions');
    if (listed.unreachable.length) result.functionsUnreachable = listed.unreachable;
    for (const f of listed.values) {
      const vars = f.serviceConfig?.environmentVariables || f.environmentVariables || {};
      const financial = Object.fromEntries(['FINANZAS_V1_ENTORNO', 'FINANZAS_V1_SERVIDOR_HABILITADO', 'FINANZAS_V1_PROYECTO']
        .map(k => [k, vars[k] === undefined ? '(ausente)' : ['true','false','publicable','emulador',project].includes(vars[k]) ? vars[k] : '(valor no esperado omitido)']));
      functions.push({ api: version, name: f.name, state: f.state || f.status, runtime: f.buildConfig?.runtime || f.runtime,
        environment: f.environment, financialEnvironment: financial,
        secretBindingsCount: (f.serviceConfig?.secretEnvironmentVariables || f.secretEnvironmentVariables || []).length });
    }
  }
  result.functions = functions;
  console.log(`Functions listadas: ${functions.length}; sin consultar secretos ni invocar endpoints.`);
  const sites = await paged('firebasehosting.googleapis.com', `/v1beta1/projects/${project}/sites?pageSize=100`, 'sites');
  result.hosting = [];
  for (const site of sites.values) {
    const id = site.name.split('/').pop();
    if (!/^[a-z0-9-]+$/.test(id)) throw Error('SITE_INVALIDO');
    const live = await get('firebasehosting.googleapis.com', `/v1beta1/projects/${project}/sites/${id}/channels/live`, true);
    const version = live?.release?.version;
    let config = version?.config;
    if (version?.name && !config) {
      const parts = version.name.split('/'); const versionId = parts.pop();
      if (!/^[a-zA-Z0-9_-]+$/.test(versionId)) throw Error('VERSION_INVALIDA');
      config = (await get('firebasehosting.googleapis.com', `/v1beta1/projects/${project}/sites/${id}/versions/${versionId}`)).config;
    }
    result.hosting.push({ name: site.name, defaultUrl: site.defaultUrl, appId: site.appId,
      liveRelease: live?.release ? { name: live.release.name, releaseTime: live.release.releaseTime,
        versionName: version?.name, status: version?.status, config } : null });
  }
  console.log('Configuración Hosting leída.');
  const billing = await get('cloudbilling.googleapis.com', `/v1/projects/${project}/billingInfo`);
  result.billing = { billingEnabled: billing.billingEnabled };
  const services = await paged('serviceusage.googleapis.com', '/v1/projects/336914296469/services?filter=state%3AENABLED&pageSize=200', 'services');
  result.enabledServices = services.values.map(s => s.config?.name).filter(Boolean);
  result.complete = true;
}
main().catch(error => { result.complete = false; result.failure = error.message; process.exitCode = 1;
  console.log(`Preflight detenido: ${error.message}.`);
}).finally(() => { result.finishedAt = new Date().toISOString(); token = undefined; save('resultado-remoto.json', result); });
