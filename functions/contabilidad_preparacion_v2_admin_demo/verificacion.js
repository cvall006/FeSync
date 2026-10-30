'use strict';
const { exigir, ErrorContable } = require('../finanzas_core/dinero');
const { parametros } = require('../contabilidad_generaciones_v2_demo/util');
const { leerFuente } = require('../contabilidad_generaciones_v2_demo/fuente');
const { contexto } = require('./preparacion');
const { referencias, subcolecciones, comprobar, destino, comprobarEvidencia, comprobarOtros } = require('./estado');
function crearVerificador(opciones) {
  const { db } = opciones, { identidad: runtime, guardas } = contexto(opciones);
  async function verificar(entrada) {
    guardas(true); const p = parametros(entrada), r = referencias(db, p);
    try {
      await subcolecciones(r);
      return await db.runTransaction(async tx => {
        guardas();
        const [es, cs, gs, evidencia] = await Promise.all([r.ejecucion, r.cerrojo, r.generacion, r.evidencia].map(ref => tx.get(ref)));
        exigir(es.exists, 'E_EJECUCION_AUSENTE');
        await comprobarOtros(tx, db, p);
        const e = es.data(), f = await leerFuente(tx, db, p);
        comprobar(e, p, runtime, f, cs, gs);
        const d = await destino(tx, db, r, e, p, f, gs);
        const sello = comprobarEvidencia(e, p, runtime, f, d.documentos, evidencia);
        guardas();
        // Este modulo no llama create/update/set/delete, tampoco fuera de tx.
        return Object.freeze({ estado: 'DATOS_Y_VINCULO_VERIFICADOS', activa: false,
          acreditacionAdministrativa: runtime.acreditacionAdministrativa, runtimeCreacion: runtime,
          runtimeVerificador: runtime, elegibleActivacion: false, sello: sello.sello });
      });
    } catch (e) {
      if (e instanceof ErrorContable || e.message === 'E_RUNTIME_NO_AUTORIZADO') throw e;
      throw new ErrorContable('E_LECTURA_INCIERTA');
    }
  }
  return Object.freeze({ verificar });
}
module.exports = Object.freeze({ crearVerificador });
