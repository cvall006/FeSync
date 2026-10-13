const { before, after, beforeEach, test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, setDoc, getDoc, getDocs, collection, Timestamp, updateDoc, deleteDoc } = require('firebase/firestore');
const { ref, uploadBytes, getMetadata, deleteObject } = require('firebase/storage');

let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-fesync',
    firestore: { host: '127.0.0.1', port: 8088, rules: fs.readFileSync(path.join(__dirname, '..', '..', 'firestore.rules'), 'utf8') },
    storage: { host: '127.0.0.1', port: 9198, rules: fs.readFileSync(path.join(__dirname, '..', '..', 'storage.rules'), 'utf8') },
  });
});
after(async () => { if (env) await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (context) => {
    for (const [uid, rolGlobal, iglesiaId] of [ ['admin', 'admin_iglesia', 'a'], ['lider', 'lider_area', 'a'], ['miembro', 'servidor', 'a'], ['otro', 'admin_iglesia', 'b'] ]) {
      await setDoc(doc(context.firestore(), 'usuarios_globales', uid), { iglesiaId, rolGlobal });
    }
  });
});
const categoria = () => ({ nombre: 'Liderazgo', descripcion: 'Tema', orden: 1, activa: true, fechaCreacion: Timestamp.now(), creadorUid: 'admin' });
const categoriaRef = (uid, iglesia = 'a') => doc(env.authenticatedContext(uid).firestore(), `iglesias/${iglesia}/capacitaciones_categorias/c`);
const archivoRef = (uid, nombre = 'material.pdf', iglesia = 'a') => ref(env.authenticatedContext(uid).storage(), `capacitaciones/${iglesia}/general/c/${nombre}`);
const pdf = new Uint8Array([37, 80, 68, 70, 45]);
const metadata = { contentType: 'application/pdf', contentDisposition: 'attachment; filename="material.pdf"' };

test('Admin/líder administran categorías; miembro solo lee y no accede a otra iglesia', async () => {
  await assertSucceeds(setDoc(categoriaRef('admin'), categoria()));
  await assertSucceeds(updateDoc(categoriaRef('lider'), { nombre: 'Familia', orden: 2, activa: false }));
  await assertSucceeds(getDoc(categoriaRef('miembro')));
  await assertSucceeds(getDocs(collection(env.authenticatedContext('miembro').firestore(), 'iglesias/a/capacitaciones_categorias')));
  await assertFails(updateDoc(categoriaRef('miembro'), { activa: true }));
  await assertFails(getDoc(categoriaRef('otro')));
  await assertFails(setDoc(categoriaRef('admin', 'b'), categoria()));
  await assertSucceeds(deleteDoc(categoriaRef('lider')));
});
test('Categorías validan campos y protegen autor/fecha', async () => {
  await assertFails(setDoc(categoriaRef('miembro'), categoria()));
  await assertFails(setDoc(categoriaRef('admin'), { ...categoria(), creadorUid: 'otro' }));
  await assertFails(setDoc(categoriaRef('admin'), { ...categoria(), orden: 'primero' }));
  await assertSucceeds(setDoc(categoriaRef('admin'), categoria()));
  await assertFails(updateDoc(categoriaRef('lider'), { creadorUid: 'lider' }));
});
test('Líder crea categorías con su propia identidad', async () => {
  await assertSucceeds(setDoc(categoriaRef('lider'), { ...categoria(), creadorUid: 'lider' }));
  await assertFails(setDoc(categoriaRef('otro'), { ...categoria(), creadorUid: 'otro' }));
});
test('DOCX admite MIME canónico y lectura solo de la iglesia', async () => {
  const metadataDocx = { contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
  await assertSucceeds(uploadBytes(archivoRef('lider', 'Plan_Presentacion_FeSync.docx'), new Uint8Array([80, 75, 3, 4]), metadataDocx));
  await assertSucceeds(getMetadata(archivoRef('miembro', 'Plan_Presentacion_FeSync.docx')));
  await assertFails(getMetadata(archivoRef('otro', 'Plan_Presentacion_FeSync.docx')));
  await assertFails(uploadBytes(archivoRef('admin', 'falso.docx'), pdf, metadata));
});
test('Colección de capacitaciones conserva reglas heredadas', async () => {
  const ruta = 'iglesias/a/capacitaciones/vieja';
  await assertSucceeds(setDoc(doc(env.authenticatedContext('lider').firestore(), ruta), { tipo: 'texto', contenido: 'Literal' }));
  await assertSucceeds(getDoc(doc(env.authenticatedContext('miembro').firestore(), ruta)));
  await assertFails(updateDoc(doc(env.authenticatedContext('miembro').firestore(), ruta), { titulo: 'No' }));
  await assertFails(getDoc(doc(env.authenticatedContext('otro').firestore(), ruta)));
});
test('Archivos: lectura por iglesia y administración exclusiva', async () => {
  await assertSucceeds(uploadBytes(archivoRef('admin'), pdf, metadata));
  await assertSucceeds(getMetadata(archivoRef('miembro')));
  await assertFails(getMetadata(archivoRef('otro')));
  await assertFails(uploadBytes(archivoRef('miembro', 'otro.pdf'), pdf, metadata));
  await assertFails(uploadBytes(archivoRef('admin', 'cruzado.pdf', 'b'), pdf, metadata));
  await assertFails(deleteObject(archivoRef('miembro')));
  await assertSucceeds(deleteObject(archivoRef('lider')));
});
test('Storage rechaza ejecutables, MIME falso y archivos mayores que 25 MiB', async () => {
  await assertFails(uploadBytes(archivoRef('admin', 'a.exe'), pdf, metadata));
  await assertFails(uploadBytes(archivoRef('admin'), pdf, { contentType: 'application/x-msdownload' }));
  await assertFails(uploadBytes(archivoRef('admin'), new Uint8Array(25 * 1024 * 1024 + 1), metadata));
});
test('HTML exige descarga como adjunto y no admite JS independiente', async () => {
  const html = new TextEncoder().encode('<html>Material</html>');
  await assertFails(uploadBytes(archivoRef('admin', 'a.html'), html, { contentType: 'text/html' }));
  await assertSucceeds(uploadBytes(archivoRef('lider', 'a.html'), html, { contentType: 'text/html', contentDisposition: 'attachment; filename="a.html"' }));
  await assertFails(uploadBytes(archivoRef('admin', 'a.js'), html, { contentType: 'text/javascript' }));
});
