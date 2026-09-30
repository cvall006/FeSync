const { onDocumentCreated } =
  require('firebase-functions/v2/firestore');

const { setGlobalOptions } =
  require('firebase-functions/v2');

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

async function obtenerDestinatarios(
  iglesiaId,
) {
  const usuariosSnapshot =
    await db
      .collection('usuarios_globales')
      .where(
        'iglesiaId',
        '==',
        iglesiaId,
      )
      .get();

  const tokens = new Map();

  await Promise.all(
    usuariosSnapshot.docs.map(
      async (usuarioDoc) => {
        const usuario =
          usuarioDoc.data();

        const dispositivosSnapshot =
          await usuarioDoc.ref
            .collection('dispositivos')
            .where(
              'activo',
              '==',
              true,
            )
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
      },
    ),
  );

  return [...tokens.values()];
}

function tokenDebeEliminarse(
  errorCode,
) {
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
    `Éxito: Se enviaron `
    + `${respuesta.successCount} notificaciones.`,
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

      console.log(
        `Nueva publicación ${publicacionId} `
        + `en iglesia ${iglesiaId}.`,
      );

      await enviarNotificacionIglesia({
        iglesiaId,
        titulo:
          `${titulo} · ${autorNombre}`,
        cuerpo:
          contenido ||
          'Hay una nueva publicación en Comunidad.',
        data: {
          tipo: 'muro_comunidad',
          publicacionId,
          autorUid,
        },
      });
    },
  );

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
              valor.trim().isNotEmpty,
          )
          .join(' · ');

      console.log(
        `Nuevo evento de agenda ${eventoId}.`,
      );

      await enviarNotificacionIglesia({
        iglesiaId,
        titulo:
          `Nuevo evento · ${tituloEvento}`,
        cuerpo:
          detalles.isNotEmpty
            ? detalles
            : 'Hay una nueva actividad en la agenda.',
        data: {
          tipo: 'agenda',
          eventoId,
        },
      });
    },
  );

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

      console.log(
        `Nuevo turno ${turnoId}.`,
      );

      await enviarNotificacionIglesia({
        iglesiaId,
        titulo:
          'Nuevo turno de servicio',
        cuerpo:
          fecha.isNotEmpty
            ? `${tituloTurno} · ${fecha}`
            : tituloTurno,
        data: {
          tipo: 'servidores',
          turnoId,
        },
      });
    },
  );

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

      console.log(
        `Nuevo evento Adora Live ${eventoId}.`,
      );

      await enviarNotificacionIglesia({
        iglesiaId,
        titulo:
          `Adora Live · ${tituloEvento}`,
        cuerpo:
          tipoEvento.isNotEmpty
            ? tipoEvento
            : 'Hay un nuevo evento del equipo de alabanza.',
        data: {
          tipo: 'adora_live',
          eventoId,
        },
      });
    },
  );