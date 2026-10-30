'use strict';
const { entorno, crearApi } = require('./api');
entorno(); // Bloquea carga/despliegue fuera del emulador autorizado.
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
initializeApp({ projectId: 'demo-fesync' });
const api = crearApi({ db: getFirestore(), FieldValue, HttpsError });
const incremental = require('../../finanzas_v1/api').crearApiIncremental({ db: getFirestore(), FieldValue, HttpsError });
for (const [nombre, fn] of Object.entries({ finanzasMvpConsultar: api.consultar,
  finanzasMvpInicializar: api.inicializar, finanzasMvpEjecutar: api.ejecutar })) {
  exports[nombre] = onCall({ region: 'southamerica-west1', timeoutSeconds: 60 }, async request => {
    entorno();
    // Solo demo y únicamente después de la pausa/conciliación explícita del libro.
    if (nombre !== 'finanzasMvpInicializar' && request.auth?.uid) {
      const perfil = await getFirestore().doc(`usuarios_globales/${request.auth.uid}`).get();
      const iglesiaId = perfil.data()?.iglesiaId;
      if (typeof iglesiaId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(iglesiaId)) {
        const p = await getFirestore().doc(`iglesias/${iglesiaId}/finanzas_control/protocolo`).get();
        if (p.data()?.epoca === 2) return incremental[nombre === 'finanzasMvpConsultar' ? 'consultar' : 'ejecutar'](request);
      }
    }
    return fn(request);
  });
}
// Reutiliza configuración de acceso y autorización del backend existente.
for (const nombre of ['actualizarEncargadoFinanciero', 'actualizarEstadoModuloFinanzas']) {
  exports[nombre] = onCall({ region: 'southamerica-west1' }, request => {
    entorno(); return require('../../finanzas')[nombre](request, { db: getFirestore(), FieldValue, HttpsError });
  });
}
