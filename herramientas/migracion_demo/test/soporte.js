const { validarEntorno } = require('../entorno');
validarEntorno();
const { createRequire } = require('node:module');
const path = require('node:path');
const req = createRequire(path.join(__dirname, '../../../functions/package.json'));
const { Firestore, FieldValue } = req('firebase-admin/firestore');
const { GoogleAuth, OAuth2Client } = req('google-auth-library');
const { abrir } = require('../herramienta');
function cliente() {
  return new Firestore({ projectId: 'demo-fesync', databaseId: '(default)', host: '127.0.0.1:8088',
    ssl: false, auth: new GoogleAuth({ authClient: new OAuth2Client() }) });
}
const cp = (db, n = 'ensayo') => db.doc(`herramienta_migracion_demo/${n}`);
async function preparar(db, solo = false) {
  validarEntorno();
  const r = await fetch('http://127.0.0.1:8088/emulator/v1/projects/demo-fesync/databases/(default)/documents',
    { method: 'DELETE', signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error('Preparación demo fallida.');
  const b = db.batch();
  const perfil = { iglesiaId: 'iglesia_demo', rolGlobal: 'servidor',
    nombre: 'Persona ficticia', preferencias: { tema: 'oscuro' } };
  if (solo) b.set(db.doc('usuarios_globales/perfil_demo'), perfil);
  else {
    b.set(db.doc('usuarios_globales/titular_demo'), { ...perfil, rolGlobal: 'admin_iglesia' });
    b.set(db.doc('usuarios_globales/miembro_demo'), perfil);
    b.set(db.doc('usuarios_globales/lider_demo'), { ...perfil, rolGlobal: 'lider_area' });
    b.set(db.doc('usuarios_globales/sin_iglesia_demo'), { preferencias: { tema: 'claro' } });
    b.set(db.doc('usuarios_globales/existente_demo'), { ...perfil, pertenenciaId: 'a'.repeat(64) });
    b.set(db.doc('usuarios_globales/invalido_demo'), { ...perfil, pertenenciaId: null });
  }
  b.set(db.doc('iglesias/iglesia_demo'), { adminUid: 'titular_demo', auxiliar: 'conservar' });
  // Centinelas ficticios: demostrar que la herramienta NO modifica Finanzas.
  b.set(db.doc('iglesias/iglesia_demo/finanzas_config/acceso'), { encargadoUid: 'miembro_demo', moduloHabilitado: false });
  b.set(db.doc('iglesias/iglesia_demo/finanzas_movimientos/ficticio'), { centinela: 'NO_MODIFICAR' });
  await b.commit();
}
async function foto(db, controles = false) {
  const salida = [];
  async function visitar(c) {
    for (const ref of await c.listDocuments()) {
      const s = await ref.get();
      if (s.exists) salida.push({ ruta: ref.path, datos: s.data(),
        version: `${s.updateTime.seconds}:${s.updateTime.nanoseconds}` });
      for (const sub of await ref.listCollections()) await visitar(sub);
    }
  }
  for (const c of await db.listCollections()) if (controles || c.id !== 'herramienta_migracion_demo') await visitar(c);
  return salida.sort((a, b) => a.ruta.localeCompare(b.ruta));
}
async function usar(opciones, accion) {
  const t = abrir({ reservaMs: 60000, ...opciones });
  try { return await accion(t); } finally { await t.cerrar(); }
}
module.exports = { cliente, preparar, foto, cp, usar, FieldValue };
