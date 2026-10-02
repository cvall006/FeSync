const {
  onDocumentCreated,
  onDocumentUpdated,
} = require('firebase-functions/v2/firestore');

const {
  setGlobalOptions,
} = require('firebase-functions/v2');

const {
  initializeApp,
} = require('firebase-admin/app');

const {
  getFirestore,
  FieldValue,
} = require('firebase-admin/firestore');

const {
  getMessaging,
} = require('firebase-admin/messaging');

initializeApp();

setGlobalOptions({
  region: 'southamerica-west1',
  memory: '256MiB',
});

const db = getFirestore();

/*
 * ============================================================
 * USUARIOS
 * ============================================================
 */

function limpiarUids(uids) {
  return [
    ...new Set(
      (uids ?? [])
        .map((uid) => String(uid ?? '').trim())
        .filter((uid) => uid.length > 0),
    ),
  ];
}

async function obtenerUsuariosIglesia(iglesiaId) {
  const snapshot = await db
    .collection('usuarios_globales')
    .where('iglesiaId', '==', iglesiaId)
    .get();

  return snapshot.docs;
}

async function obtenerUsuariosPorUids(
  iglesiaId,
  uids,
) {
  const uidsUnicos = limpiarUids(uids);

  if (uidsUnicos.length === 0) {
    return [];
  }

  const resultados = await Promise.all(
    uidsUnicos.map(async (uid) => {
      const doc = await db
        .collection('usuarios_globales')
        .doc(uid)
        .get();

      if (!doc.exists) {
        console.log(
          `Usuario ${uid} no existe.`,
        );

        return null;
      }

      const data = doc.data();

      if (
        data?.iglesiaId?.toString() !==
        iglesiaId
      ) {
        console.log(
          `Usuario ${uid} no pertenece a iglesia ${iglesiaId}.`,
        );

        return null;
      }

      return doc;
    }),
  );

  return resultados.filter(
    (doc) => doc !== null,
  );
}

/*
 * ============================================================
 * CONTADORES PENDIENTES
 * ============================================================
 */

async function incrementarContadores({
  usuarios,
  modulo,
  cantidad = 1,
}) {
  if (
    !usuarios ||
    usuarios.length === 0
  ) {
    return;
  }

  /*
   * Firestore admite hasta 500 operaciones
   * por batch. Dejamos margen usando 400.
   */
  const tamanoBloque = 400;

  for (
    let inicio = 0;
    inicio < usuarios.length;
    inicio += tamanoBloque
  ) {
    const bloque = usuarios.slice(
      inicio,
      inicio + tamanoBloque,
    );

    const batch = db.batch();

    for (const usuarioDoc of bloque) {
      batch.update(
        usuarioDoc.ref,
        {
          [`notificacionesPendientes.${modulo}`]:
            FieldValue.increment(cantidad),
        },
      );
    }

    await batch.commit();
  }

  console.log(
    `Pendientes ${modulo}: +${cantidad} para ${usuarios.length} usuario(s).`,
  );
}

async function incrementarPendientesIglesia(
  iglesiaId,
  modulo,
) {
  const usuarios =
    await obtenerUsuariosIglesia(
      iglesiaId,
    );

  await incrementarContadores({
    usuarios,
    modulo,
  });
}

async function incrementarPendientesUsuarios(
  iglesiaId,
  uids,
  modulo,
) {
  const usuarios =
    await obtenerUsuariosPorUids(
      iglesiaId,
      uids,
    );

  await incrementarContadores({
    usuarios,
    modulo,
  });
}

/*
 * ============================================================
 * TOKENS FCM
 * ============================================================
 */

async function agregarTokensUsuario(
  usuarioDoc,
  tokens,
) {
  const usuario = usuarioDoc.data();

  if (!usuario) {
    return;
  }

  const dispositivosSnapshot =
    await usuarioDoc.ref
      .collection('dispositivos')
      .where('activo', '==', true)
      .get();

  for (
    const dispositivoDoc
    of dispositivosSnapshot.docs
  ) {
    const dispositivo =
      dispositivoDoc.data();

    const token =
      dispositivo.token
        ?.toString()
        .trim();

    if (!token) {
      continue;
    }

    tokens.set(
      token,
      {
        token,
        dispositivoRef:
          dispositivoDoc.ref,
        usuarioRef:
          usuarioDoc.ref,
        legacy: false,
      },
    );
  }

  /*
   * Compatibilidad temporal con
   * instalaciones antiguas.
   */
  const legacyToken =
    usuario.fcmToken
      ?.toString()
      .trim();

  if (
    legacyToken &&
    !tokens.has(legacyToken)
  ) {
    tokens.set(
      legacyToken,
      {
        token: legacyToken,
        dispositivoRef: null,
        usuarioRef:
          usuarioDoc.ref,
        legacy: true,
      },
    );
  }
}

async function obtenerDestinatarios(
  iglesiaId,
) {
  const usuarios =
    await obtenerUsuariosIglesia(
      iglesiaId,
    );

  const tokens = new Map();

  await Promise.all(
    usuarios.map(
      async (usuarioDoc) => {
        await agregarTokensUsuario(
          usuarioDoc,
          tokens,
        );
      },
    ),
  );

  return [...tokens.values()];
}

async function obtenerDestinatariosPorUids(
  iglesiaId,
  uids,
) {
  const usuarios =
    await obtenerUsuariosPorUids(
      iglesiaId,
      uids,
    );

  const tokens = new Map();

  await Promise.all(
    usuarios.map(
      async (usuarioDoc) => {
        await agregarTokensUsuario(
          usuarioDoc,
          tokens,
        );
      },
    ),
  );

  return [...tokens.values()];
}

/*
 * ============================================================
 * LIMPIEZA DE TOKENS INVÁLIDOS
 * ============================================================
 */

function tokenDebeEliminarse(errorCode) {
  return (
    errorCode ===
      'messaging/registration-token-not-registered' ||
    errorCode ===
      'messaging/invalid-registration-token'
  );
}

async function limpiarTokenInvalido(
  destino,
) {
  if (destino.dispositivoRef) {
    await destino.dispositivoRef.delete();
  }

  if (destino.legacy) {
    const snapshot =
      await destino.usuarioRef.get();

    const data =
      snapshot.data();

    if (
      data?.fcmToken ===
      destino.token
    ) {
      await destino.usuarioRef.update({
        fcmToken:
          FieldValue.delete(),
        fcmTokenActualizado:
          FieldValue.delete(),
      });
    }
  }
}

/*
 * ============================================================
 * ENVÍO FCM
 * ============================================================
 */

async function enviarNotificacionDestinos({
  destinos,
  iglesiaId,
  titulo,
  cuerpo,
  data,
}) {
  if (destinos.length === 0) {
    console.log(
      `No hay tokens FCM para iglesia ${iglesiaId}.`,
    );

    return {
      successCount: 0,
      failureCount: 0,
    };
  }

  const respuesta =
    await getMessaging()
      .sendEachForMulticast({
        tokens:
          destinos.map(
            (destino) =>
              destino.token,
          ),

        notification: {
          title: titulo,
          body: cuerpo,
        },

        data: {
          iglesiaId,
          ...data,
        },

        android: {
          priority: 'high',
        },

        webpush: {
          notification: {
            icon:
              '/icons/Icon-192.png',
            badge:
              '/icons/Icon-192.png',
          },
        },
      });

  console.log(
    `Éxito: se enviaron ${respuesta.successCount} notificaciones.`,
  );

  if (
    respuesta.failureCount > 0
  ) {
    console.log(
      `Fallaron ${respuesta.failureCount} notificaciones.`,
    );

    const limpiezas = [];

    respuesta.responses.forEach(
      (
        resultado,
        index,
      ) => {
        if (resultado.success) {
          return;
        }

        const errorCode =
          resultado.error?.code ??
          'error desconocido';

        console.log(
          `Token ${index}: ${errorCode}`,
        );

        if (
          tokenDebeEliminarse(
            errorCode,
          )
        ) {
          limpiezas.push(
            limpiarTokenInvalido(
              destinos[index],
            ),
          );
        }
      },
    );

    await Promise.all(
      limpiezas,
    );
  }

  return respuesta;
}

async function enviarNotificacionIglesia({
  iglesiaId,
  titulo,
  cuerpo,
  data,
}) {
  const destinos =
    await obtenerDestinatarios(
      iglesiaId,
    );

  return enviarNotificacionDestinos({
    destinos,
    iglesiaId,
    titulo,
    cuerpo,
    data,
  });
}

async function enviarNotificacionUsuarios({
  iglesiaId,
  uids,
  titulo,
  cuerpo,
  data,
}) {
  const destinos =
    await obtenerDestinatariosPorUids(
      iglesiaId,
      uids,
    );

  return enviarNotificacionDestinos({
    destinos,
    iglesiaId,
    titulo,
    cuerpo,
    data,
  });
}

/*
 * ============================================================
 * UTILIDADES
 * ============================================================
 */

function recortarTexto(
  valor,
  maximo = 120,
) {
  const texto =
    String(valor ?? '').trim();

  if (!texto) {
    return '';
  }

  if (texto.length <= maximo) {
    return texto;
  }

  return `${texto.substring(
    0,
    maximo - 3,
  )}...`;
}

function obtenerUidsAsignados(
  turno,
) {
  const asignaciones =
    Array.isArray(
      turno?.asignaciones,
    )
      ? turno.asignaciones
      : [];

  return limpiarUids(
    asignaciones.map(
      (asignacion) =>
        asignacion?.usuarioUid,
    ),
  );
}

function obtenerNuevosUidsAsignados(
  turnoAntes,
  turnoDespues,
) {
  const antes =
    new Set(
      obtenerUidsAsignados(
        turnoAntes,
      ),
    );

  return obtenerUidsAsignados(
    turnoDespues,
  ).filter(
    (uid) => !antes.has(uid),
  );
}

function obtenerClasesNuevas(
  moduloAntes,
  moduloDespues,
) {
  const clasesAntes =
    Array.isArray(
      moduloAntes?.clases,
    )
      ? moduloAntes.clases
      : [];

  const clasesDespues =
    Array.isArray(
      moduloDespues?.clases,
    )
      ? moduloDespues.clases
      : [];

  const idsAntes =
    new Set(
      clasesAntes
        .map(
          (clase) =>
            clase?.id
              ?.toString()
              .trim() ??
            '',
        )
        .filter(
          (id) => id.length > 0,
        ),
    );

  return clasesDespues.filter(
    (clase) => {
      const id =
        clase?.id
          ?.toString()
          .trim() ??
        '';

      return (
        id.length > 0 &&
        !idsAntes.has(id)
      );
    },
  );
}

/*
 * ============================================================
 * COMUNIDAD
 * ============================================================
 */

exports.notificarNuevoMuro =
  onDocumentCreated(
    'iglesias/{iglesiaId}/muro_comunidad/{publicacionId}',
    async (event) => {
      const snapshot =
        event.data;

      if (!snapshot) {
        return;
      }

      const publicacion =
        snapshot.data();

      const iglesiaId =
        event.params.iglesiaId;

      const publicacionId =
        event.params.publicacionId;

      const autorNombre =
        publicacion.autorNombre
          ?.toString() ??
        'Un miembro';

      const autorUid =
        publicacion.autorUid
          ?.toString() ??
        '';

      const contenido =
        recortarTexto(
          publicacion.contenido,
        );

      const tipo =
        publicacion.tipo
          ?.toString() ??
        'publicacion';

      let titulo =
        'Nueva publicación';

      if (tipo === 'aviso') {
        titulo =
          'Nuevo aviso';
      }

      if (tipo === 'peticion') {
        titulo =
          'Nueva petición';
      }

      await incrementarPendientesIglesia(
        iglesiaId,
        'comunidades',
      );

      await enviarNotificacionIglesia({
        iglesiaId,
        titulo:
          `${titulo} · ${autorNombre}`,
        cuerpo:
          contenido ||
          'Hay una nueva publicación en Comunidad.',
        data: {
          tipo:
            'muro_comunidad',
          publicacionId,
          autorUid,
        },
      });
    },
  );

/*
 * ============================================================
 * AGENDA
 * ============================================================
 */

exports.notificarNuevoEventoAgenda =
  onDocumentCreated(
    'iglesias/{iglesiaId}/agenda_eventos/{eventoId}',
    async (event) => {
      const snapshot =
        event.data;

      if (!snapshot) {
        return;
      }

      const evento =
        snapshot.data();

      const iglesiaId =
        event.params.iglesiaId;

      const eventoId =
        event.params.eventoId;

      const tituloEvento =
        evento.titulo
          ?.toString() ??
        'Nuevo evento';

      const fecha =
        evento.fecha
          ?.toString() ??
        '';

      const hora =
        evento.hora
          ?.toString() ??
        '';

      const lugar =
        evento.lugar
          ?.toString() ??
        '';

      const detalles = [
        fecha,
        hora,
        lugar,
      ]
        .filter(
          (valor) =>
            valor.trim().length > 0,
        )
        .join(' · ');

      await incrementarPendientesIglesia(
        iglesiaId,
        'agenda',
      );

      await enviarNotificacionIglesia({
        iglesiaId,
        titulo:
          `Nuevo evento · ${tituloEvento}`,
        cuerpo:
          detalles.length > 0
            ? detalles
            : 'Hay una nueva actividad en la agenda.',
        data: {
          tipo: 'agenda',
          eventoId,
        },
      });
    },
  );

/*
 * ============================================================
 * SERVIDORES
 * ============================================================
 */

exports.notificarNuevoTurno =
  onDocumentCreated(
    'iglesias/{iglesiaId}/turnos_servicio/{turnoId}',
    async (event) => {
      const snapshot =
        event.data;

      if (!snapshot) {
        return;
      }

      const turno =
        snapshot.data();

      const iglesiaId =
        event.params.iglesiaId;

      const turnoId =
        event.params.turnoId;

      const tituloTurno =
        turno.titulo
          ?.toString() ??
        'Nuevo turno';

      const fecha =
        turno.fecha
          ?.toString() ??
        '';

      const uidsAsignados =
        obtenerUidsAsignados(
          turno,
        );

      if (
        uidsAsignados.length === 0
      ) {
        console.log(
          'Turno sin usuarios asignados.',
        );

        return;
      }

      await incrementarPendientesUsuarios(
        iglesiaId,
        uidsAsignados,
        'servidores',
      );

      await enviarNotificacionUsuarios({
        iglesiaId,
        uids:
          uidsAsignados,
        titulo:
          'Nuevo turno de servicio',
        cuerpo:
          fecha.length > 0
            ? `${tituloTurno} · ${fecha}`
            : tituloTurno,
        data: {
          tipo:
            'servidores',
          turnoId,
        },
      });
    },
  );

exports.notificarNuevaAsignacionTurno =
  onDocumentUpdated(
    'iglesias/{iglesiaId}/turnos_servicio/{turnoId}',
    async (event) => {
      const before =
        event.data?.before;

      const after =
        event.data?.after;

      if (
        !before ||
        !after
      ) {
        return;
      }

      const turnoAntes =
        before.data();

      const turnoDespues =
        after.data();

      const nuevosUids =
        obtenerNuevosUidsAsignados(
          turnoAntes,
          turnoDespues,
        );

      if (
        nuevosUids.length === 0
      ) {
        return;
      }

      const iglesiaId =
        event.params.iglesiaId;

      const turnoId =
        event.params.turnoId;

      const tituloTurno =
        turnoDespues.titulo
          ?.toString() ??
        'Turno de servicio';

      const fecha =
        turnoDespues.fecha
          ?.toString() ??
        '';

      await incrementarPendientesUsuarios(
        iglesiaId,
        nuevosUids,
        'servidores',
      );

      await enviarNotificacionUsuarios({
        iglesiaId,
        uids:
          nuevosUids,
        titulo:
          'Nueva asignación de servicio',
        cuerpo:
          fecha.length > 0
            ? `${tituloTurno} · ${fecha}`
            : tituloTurno,
        data: {
          tipo:
            'servidores',
          turnoId,
        },
      });
    },
  );

/*
 * ============================================================
 * CAPACITACIONES
 * ============================================================
 */

exports.notificarNuevaCapacitacion =
  onDocumentCreated(
    'iglesias/{iglesiaId}/capacitaciones/{capacitacionId}',
    async (event) => {
      const snapshot =
        event.data;

      if (!snapshot) {
        return;
      }

      const capacitacion =
        snapshot.data();

      const iglesiaId =
        event.params.iglesiaId;

      const capacitacionId =
        event.params.capacitacionId;

      const tituloCapacitacion =
        capacitacion.titulo
          ?.toString()
          .trim() ||
        'Nueva capacitación';

      const descripcion =
        recortarTexto(
          capacitacion.descripcion,
        );

      const tipo =
        capacitacion.tipo
          ?.toString()
          .trim() ??
        '';

      let cuerpo =
        descripcion;

      if (!cuerpo) {
        if (tipo === 'video') {
          cuerpo =
            'Hay un nuevo video de capacitación disponible.';
        } else if (
          tipo === 'texto'
        ) {
          cuerpo =
            'Hay una nueva lectura de capacitación disponible.';
        } else {
          cuerpo =
            'Hay nuevo material de capacitación disponible.';
        }
      }

      await incrementarPendientesIglesia(
        iglesiaId,
        'capacitaciones',
      );

      await enviarNotificacionIglesia({
        iglesiaId,
        titulo:
          `Nueva capacitación · ${tituloCapacitacion}`,
        cuerpo,
        data: {
          tipo:
            'capacitaciones',
          capacitacionId,
        },
      });
    },
  );

/*
 * ============================================================
 * ESCUELA BÍBLICA
 * ============================================================
 */

exports.notificarNuevoModuloEscuela =
  onDocumentCreated(
    'iglesias/{iglesiaId}/escuela_modulos/{moduloId}',
    async (event) => {
      const snapshot =
        event.data;

      if (!snapshot) {
        return;
      }

      const modulo =
        snapshot.data();

      const iglesiaId =
        event.params.iglesiaId;

      const moduloId =
        event.params.moduloId;

      const tituloModulo =
        modulo.titulo
          ?.toString()
          .trim() ||
        'Nuevo módulo';

      const descripcion =
        recortarTexto(
          modulo.descripcion,
        );

      await incrementarPendientesIglesia(
        iglesiaId,
        'escuela',
      );

      await enviarNotificacionIglesia({
        iglesiaId,
        titulo:
          `Escuela Bíblica · ${tituloModulo}`,
        cuerpo:
          descripcion ||
          'Hay un nuevo módulo disponible en Escuela Bíblica.',
        data: {
          tipo:
            'escuela',
          accion:
            'nuevo_modulo',
          moduloId,
        },
      });
    },
  );

exports.notificarNuevaClaseEscuela =
  onDocumentUpdated(
    'iglesias/{iglesiaId}/escuela_modulos/{moduloId}',
    async (event) => {
      const before =
        event.data?.before;

      const after =
        event.data?.after;

      if (
        !before ||
        !after
      ) {
        return;
      }

      const moduloAntes =
        before.data();

      const moduloDespues =
        after.data();

      const clasesNuevas =
        obtenerClasesNuevas(
          moduloAntes,
          moduloDespues,
        );

      if (
        clasesNuevas.length === 0
      ) {
        return;
      }

      const iglesiaId =
        event.params.iglesiaId;

      const moduloId =
        event.params.moduloId;

      const tituloModulo =
        moduloDespues.titulo
          ?.toString()
          .trim() ||
        'Escuela Bíblica';

      const primeraClase =
        clasesNuevas[0];

      const claseId =
        primeraClase.id
          ?.toString()
          .trim() ??
        '';

      const tituloClase =
        primeraClase.titulo
          ?.toString()
          .trim() ||
        'Nueva clase';

      let cuerpo;

      if (
        clasesNuevas.length === 1
      ) {
        cuerpo =
          `${tituloModulo} · ${tituloClase}`;
      } else {
        cuerpo =
          `${tituloModulo} · `
          + `${clasesNuevas.length} nuevas clases disponibles`;
      }

      await incrementarPendientesIglesia(
        iglesiaId,
        'escuela',
      );

      await enviarNotificacionIglesia({
        iglesiaId,
        titulo:
          'Nueva clase · Escuela Bíblica',
        cuerpo,
        data: {
          tipo:
            'escuela',
          accion:
            'nueva_clase',
          moduloId,
          claseId,
        },
      });
    },
  );

/*
 * ============================================================
 * ADORA LIVE
 * ============================================================
 */

exports.notificarNuevoEventoAdora =
  onDocumentCreated(
    'iglesias/{iglesiaId}/adora_eventos/{eventoId}',
    async (event) => {
      const snapshot =
        event.data;

      if (!snapshot) {
        return;
      }

      const evento =
        snapshot.data();

      const iglesiaId =
        event.params.iglesiaId;

      const eventoId =
        event.params.eventoId;

      const tituloEvento =
        evento.titulo
          ?.toString() ??
        'Nuevo evento';

      const tipoEvento =
        evento.tipo
          ?.toString() ??
        '';

      await incrementarPendientesIglesia(
        iglesiaId,
        'adoraLive',
      );

      await enviarNotificacionIglesia({
        iglesiaId,
        titulo:
          `Adora Live · ${tituloEvento}`,
        cuerpo:
          tipoEvento.length > 0
            ? tipoEvento
            : 'Hay un nuevo evento del equipo de alabanza.',
        data: {
          tipo:
            'adora_live',
          eventoId,
        },
      });
    },
  );
  /*
 * ============================================================
 * ONBOARDING SEGURO
 * ============================================================
 */

const {
  onCall,
  HttpsError,
} = require('firebase-functions/v2/https');

/*
 * Transfiere la administración principal y ambos roles
 * de forma atómica, validando al titular dentro de la transacción.
 */
exports.transferirAdministracionIglesia = onCall(
  async (request) => {
    const uid = request.auth?.uid;

    if (!uid) {
      throw new HttpsError(
        'unauthenticated',
        'Debes iniciar sesión.',
      );
    }

    const iglesiaId = request.data?.iglesiaId;
    const nuevoAdminUid = request.data?.nuevoAdminUid;

    if (
      typeof iglesiaId !== 'string' ||
      iglesiaId.trim().length === 0 ||
      iglesiaId.includes('/') ||
      typeof nuevoAdminUid !== 'string' ||
      nuevoAdminUid.trim().length === 0 ||
      nuevoAdminUid.includes('/')
    ) {
      throw new HttpsError(
        'invalid-argument',
        'Debes indicar una congregación y un miembro válidos.',
      );
    }

    if (nuevoAdminUid === uid) {
      throw new HttpsError(
        'invalid-argument',
        'No puedes transferirte la administración a ti mismo.',
      );
    }

    const iglesiaRef = db.collection('iglesias').doc(iglesiaId);
    const adminActualRef = db.collection('usuarios_globales').doc(uid);
    const nuevoAdminRef = db.collection('usuarios_globales').doc(nuevoAdminUid);

    await db.runTransaction(async (transaction) => {
      const iglesiaSnapshot = await transaction.get(iglesiaRef);
      const adminActualSnapshot = await transaction.get(adminActualRef);
      const nuevoAdminSnapshot = await transaction.get(nuevoAdminRef);

      if (!iglesiaSnapshot.exists) {
        throw new HttpsError('not-found', 'La congregación no existe.');
      }

      if (iglesiaSnapshot.data().adminUid !== uid) {
        throw new HttpsError(
          'permission-denied',
          'Solo el administrador principal puede transferir la administración.',
        );
      }

      if (!adminActualSnapshot.exists || !nuevoAdminSnapshot.exists) {
        throw new HttpsError(
          'not-found',
          'El perfil del administrador actual o del nuevo administrador no existe.',
        );
      }

      if (
        adminActualSnapshot.data().iglesiaId !== iglesiaId ||
        nuevoAdminSnapshot.data().iglesiaId !== iglesiaId
      ) {
        throw new HttpsError(
          'permission-denied',
          'Ambos usuarios deben pertenecer a esta congregación.',
        );
      }

      transaction.update(iglesiaRef, { adminUid: nuevoAdminUid });
      transaction.update(nuevoAdminRef, { rolGlobal: 'admin_iglesia' });
      transaction.update(adminActualRef, { rolGlobal: 'lider_area' });
    });

    return { ok: true, nuevoAdminUid };
  },
);

/*
 * Vincula al usuario autenticado con una iglesia
 * mediante código de acceso.
 */
exports.vincularUsuarioConCodigo = onCall(
  async (request) => {
    const uid = request.auth?.uid;

    if (!uid) {
      throw new HttpsError(
        'unauthenticated',
        'Debes iniciar sesión.',
      );
    }

    const codigo =
      String(
        request.data?.codigo ?? '',
      )
        .trim()
        .toUpperCase();

    const nombre =
      String(
        request.data?.nombre ?? '',
      ).trim();

    const email =
      String(
        request.data?.email ?? '',
      ).trim();

    const fotoUrl =
      String(
        request.data?.fotoUrl ?? '',
      ).trim();

    const descripcion =
      String(
        request.data?.descripcion ?? '',
      ).trim();

    if (!codigo) {
      throw new HttpsError(
        'invalid-argument',
        'Debes ingresar un código de congregación.',
      );
    }

    const usuarioRef =
      db
        .collection('usuarios_globales')
        .doc(uid);

    const usuarioSnapshot =
      await usuarioRef.get();

    if (
      usuarioSnapshot.exists &&
      usuarioSnapshot.data()?.iglesiaId
    ) {
      throw new HttpsError(
        'failed-precondition',
        'Tu cuenta ya pertenece a una congregación.',
      );
    }

    const iglesiasSnapshot =
      await db
        .collection('iglesias')
        .where(
          'codigoAcceso',
          '==',
          codigo,
        )
        .limit(1)
        .get();

    if (iglesiasSnapshot.empty) {
      throw new HttpsError(
        'not-found',
        'El código ingresado no existe.',
      );
    }

    const iglesiaDoc =
      iglesiasSnapshot.docs[0];

    const datosUsuario = {
      email,
      nombre:
        nombre || 'Servidor',
      iglesiaId:
        iglesiaDoc.id,
      rolGlobal:
        'servidor',
      fotoUrl:
        fotoUrl || null,
      descripcion:
        descripcion || null,
    };

    await usuarioRef.set(
      datosUsuario,
      {
        merge: true,
      },
    );

    return {
      ok: true,
      iglesiaId:
        iglesiaDoc.id,
    };
  },
);

/*
 * Crea una nueva congregación y deja al
 * usuario autenticado como administrador.
 */
exports.registrarNuevaIglesiaSegura = onCall(
  async (request) => {
    const uid = request.auth?.uid;

    if (!uid) {
      throw new HttpsError(
        'unauthenticated',
        'Debes iniciar sesión.',
      );
    }

    const nombreAdmin =
      String(
        request.data?.nombreAdmin ?? '',
      ).trim();

    const email =
      String(
        request.data?.email ?? '',
      ).trim();

    const nombreIglesia =
      String(
        request.data?.nombreIglesia ?? '',
      ).trim();

    const codigo =
      String(
        request.data?.codigo ?? '',
      )
        .trim()
        .toUpperCase();

    const descripcionIglesia =
      String(
        request.data?.descripcionIglesia ?? '',
      ).trim();

    const fotoUrl =
      String(
        request.data?.fotoUrl ?? '',
      ).trim();

    const descripcionAdmin =
      String(
        request.data?.descripcionAdmin ?? '',
      ).trim();

    if (
      !nombreIglesia ||
      !codigo
    ) {
      throw new HttpsError(
        'invalid-argument',
        'Debes completar nombre y código de la congregación.',
      );
    }

    const usuarioRef =
      db
        .collection('usuarios_globales')
        .doc(uid);

    const usuarioSnapshot =
      await usuarioRef.get();

    if (
      usuarioSnapshot.exists &&
      usuarioSnapshot.data()?.iglesiaId
    ) {
      throw new HttpsError(
        'failed-precondition',
        'Tu cuenta ya pertenece a una congregación.',
      );
    }

    const codigoExistente =
      await db
        .collection('iglesias')
        .where(
          'codigoAcceso',
          '==',
          codigo,
        )
        .limit(1)
        .get();

    if (!codigoExistente.empty) {
      throw new HttpsError(
        'already-exists',
        'Ese código ya está en uso.',
      );
    }

    const iglesiaRef =
      db
        .collection('iglesias')
        .doc();

    const batch =
      db.batch();

    batch.set(
      iglesiaRef,
      {
        nombre:
          nombreIglesia,
        descripcion:
          descripcionIglesia,
        codigoAcceso:
          codigo,
        adminUid:
          uid,
        logoUrl:
          '',
        modulosActivos: {
          servidores:
            true,
          adoraLive:
            true,
          agenda:
            true,
          escuela:
            false,
          comunidades:
            false,
          capacitaciones:
            true,
        },
        fechaCreacion:
          FieldValue.serverTimestamp(),
      },
    );

    batch.set(
      usuarioRef,
      {
        email,
        nombre:
          nombreAdmin ||
          'Pastor / Administrador',
        iglesiaId:
          iglesiaRef.id,
        rolGlobal:
          'admin_iglesia',
        fotoUrl:
          fotoUrl || null,
        descripcion:
          descripcionAdmin || null,
      },
      {
        merge: true,
      },
    );

    await batch.commit();

    return {
      ok: true,
      iglesiaId:
        iglesiaRef.id,
    };
  },
);
/*
 * ============================================================
 * ACCIONES SEGURAS DE MIEMBROS
 * Servidores + Adora Live
 * ============================================================
 */

/*
 * Un miembro confirma o rechaza únicamente
 * la asignación que le corresponde.
 *
 * Admin/líder también puede utilizar esta función
 * sobre una asignación determinada.
 */
exports.actualizarEstadoTurnoSeguro = onCall(
  async (request) => {
    const uid = request.auth?.uid;

    if (!uid) {
      throw new HttpsError(
        'unauthenticated',
        'Debes iniciar sesión.',
      );
    }

    const iglesiaId = String(
      request.data?.iglesiaId ?? '',
    ).trim();

    const turnoId = String(
      request.data?.turnoId ?? '',
    ).trim();

    const puesto = String(
      request.data?.puesto ?? '',
    ).trim();

    const usuarioUidObjetivo = String(
      request.data?.usuarioUid ?? '',
    ).trim();

    const nuevoEstado = String(
      request.data?.estado ?? '',
    ).trim();

    if (
      !iglesiaId ||
      !turnoId ||
      !puesto ||
      !usuarioUidObjetivo
    ) {
      throw new HttpsError(
        'invalid-argument',
        'Faltan datos de la asignación.',
      );
    }

    if (
      nuevoEstado !== 'confirmado' &&
      nuevoEstado !== 'rechazado'
    ) {
      throw new HttpsError(
        'invalid-argument',
        'Estado no permitido.',
      );
    }

    const usuarioRef = db
      .collection('usuarios_globales')
      .doc(uid);

    const turnoRef = db
      .collection('iglesias')
      .doc(iglesiaId)
      .collection('turnos_servicio')
      .doc(turnoId);

    await db.runTransaction(
      async (transaction) => {
        const usuarioSnapshot =
          await transaction.get(usuarioRef);

        if (!usuarioSnapshot.exists) {
          throw new HttpsError(
            'permission-denied',
            'El perfil del usuario no existe.',
          );
        }

        const usuarioData =
          usuarioSnapshot.data() ?? {};

        if (
          usuarioData.iglesiaId !==
          iglesiaId
        ) {
          throw new HttpsError(
            'permission-denied',
            'No perteneces a esta congregación.',
          );
        }

        const rol =
          String(
            usuarioData.rolGlobal ?? '',
          );

        const puedeGestionar =
          rol === 'admin_iglesia' ||
          rol === 'lider_area';

        if (
          !puedeGestionar &&
          usuarioUidObjetivo !== uid
        ) {
          throw new HttpsError(
            'permission-denied',
            'Solo puedes modificar tu propia asignación.',
          );
        }

        const turnoSnapshot =
          await transaction.get(turnoRef);

        if (!turnoSnapshot.exists) {
          throw new HttpsError(
            'not-found',
            'El turno ya no existe.',
          );
        }

        const turnoData =
          turnoSnapshot.data() ?? {};

        const asignacionesRaw =
          Array.isArray(
            turnoData.asignaciones,
          )
            ? turnoData.asignaciones
            : [];

        let encontrada = false;

        const nuevasAsignaciones =
          asignacionesRaw.map(
            (asignacion) => {
              if (
                !asignacion ||
                typeof asignacion !==
                  'object'
              ) {
                return asignacion;
              }

              const puestoActual =
                String(
                  asignacion.puesto ?? '',
                );

              const uidActual =
                String(
                  asignacion.usuarioUid ??
                    '',
                );

              if (
                puestoActual === puesto &&
                uidActual ===
                  usuarioUidObjetivo
              ) {
                encontrada = true;

                /*
                 * La interfaz actual solamente
                 * ofrece confirmar/rechazar
                 * cuando el estado es pendiente.
                 */
                if (
                  asignacion.estado !==
                  'pendiente'
                ) {
                  throw new HttpsError(
                    'failed-precondition',
                    'Esta asignación ya fue respondida.',
                  );
                }

                return {
                  ...asignacion,
                  estado: nuevoEstado,
                };
              }

              return asignacion;
            },
          );

        if (!encontrada) {
          throw new HttpsError(
            'not-found',
            'No se encontró la asignación.',
          );
        }

        transaction.update(
          turnoRef,
          {
            asignaciones:
              nuevasAsignaciones,
          },
        );
      },
    );

    return {
      ok: true,
      estado: nuevoEstado,
    };
  },
);

/*
 * El usuario autenticado modifica únicamente
 * SU PROPIA asistencia en un evento de Adora.
 */
exports.actualizarAsistenciaAdoraSegura = onCall(
  async (request) => {
    const uid = request.auth?.uid;

    if (!uid) {
      throw new HttpsError(
        'unauthenticated',
        'Debes iniciar sesión.',
      );
    }

    const iglesiaId = String(
      request.data?.iglesiaId ?? '',
    ).trim();

    const eventoId = String(
      request.data?.eventoId ?? '',
    ).trim();

    const asistir =
      request.data?.asistir;

    if (
      !iglesiaId ||
      !eventoId ||
      typeof asistir !== 'boolean'
    ) {
      throw new HttpsError(
        'invalid-argument',
        'Datos de asistencia no válidos.',
      );
    }

    const usuarioRef = db
      .collection('usuarios_globales')
      .doc(uid);

    const eventoRef = db
      .collection('iglesias')
      .doc(iglesiaId)
      .collection('adora_eventos')
      .doc(eventoId);

    await db.runTransaction(
      async (transaction) => {
        const usuarioSnapshot =
          await transaction.get(
            usuarioRef,
          );

        if (!usuarioSnapshot.exists) {
          throw new HttpsError(
            'permission-denied',
            'El perfil del usuario no existe.',
          );
        }

        const usuarioData =
          usuarioSnapshot.data() ?? {};

        if (
          usuarioData.iglesiaId !==
          iglesiaId
        ) {
          throw new HttpsError(
            'permission-denied',
            'No perteneces a esta congregación.',
          );
        }

        const eventoSnapshot =
          await transaction.get(
            eventoRef,
          );

        if (!eventoSnapshot.exists) {
          throw new HttpsError(
            'not-found',
            'El evento ya no existe.',
          );
        }

        const eventoData =
          eventoSnapshot.data() ?? {};

        const nuevaLista =
          Array.isArray(
            eventoData.asistentesUids,
          )
            ? eventoData.asistentesUids.map(
                (valor) =>
                  String(valor),
              )
            : [];

        const nombreUsuario =
          String(
            usuarioData.nombre ?? '',
          );

        /*
         * También quitamos el nombre porque
         * versiones antiguas de FeSync podían
         * guardar el nombre en vez del UID.
         */
        const limpia =
          nuevaLista.filter(
            (valor) =>
              valor !== uid &&
              (
                nombreUsuario.length ===
                  0 ||
                valor !==
                  nombreUsuario
              ),
          );

        if (asistir) {
          limpia.push(uid);
        }

        transaction.update(
          eventoRef,
          {
            asistentesUids:
              limpia,
          },
        );
      },
    );

    return {
      ok: true,
      asistir,
    };
  },
);
       