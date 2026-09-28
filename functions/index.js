const { onDocumentCreated } =
  require('firebase-functions/v2/firestore');

const { setGlobalOptions } =
  require('firebase-functions/v2');

const {
  initializeApp,
} = require('firebase-admin/app');

const {
  getFirestore,
} = require('firebase-admin/firestore');

const {
  getMessaging,
} = require('firebase-admin/messaging');

initializeApp();

setGlobalOptions({
  region: 'southamerica-west1',
  memory: '256MiB',
});

exports.notificarNuevoMuro = onDocumentCreated(
  'iglesias/{iglesiaId}/muro_comunidad/{publicacionId}',
  async (event) => {
    const snapshot = event.data;

    if (!snapshot) {
      console.log(
        'Evento recibido sin documento.',
      );
      return;
    }

    const publicacion = snapshot.data();

    const iglesiaId =
      event.params.iglesiaId;

    const publicacionId =
      event.params.publicacionId;

    const autorNombre =
      publicacion.autorNombre?.toString() ??
      'Un miembro';

    const autorUid =
      publicacion.autorUid?.toString() ?? '';

    const contenido =
      publicacion.contenido?.toString() ?? '';

    const tipo =
      publicacion.tipo?.toString() ??
      'publicacion';

    console.log(
      `Nueva publicación ${publicacionId} `
      + `en iglesia ${iglesiaId}.`,
    );

    const usuariosSnapshot =
      await getFirestore()
        .collection('usuarios_globales')
        .where(
          'iglesiaId',
          '==',
          iglesiaId,
        )
        .get();

    const tokens = [];

    for (const usuarioDoc of
      usuariosSnapshot.docs) {
      const usuario =
        usuarioDoc.data();

      const token =
        usuario.fcmToken?.toString().trim();

      if (!token) {
        continue;
      }

      tokens.push(token);
    }

    const tokensUnicos =
      [...new Set(tokens)];

    if (tokensUnicos.length === 0) {
      console.log(
        'No hay tokens FCM disponibles para esta iglesia.',
      );

      return;
    }

    let titulo = 'Nueva publicación';

    if (tipo === 'aviso') {
      titulo = 'Nuevo aviso';
    }

    if (tipo === 'peticion') {
      titulo = 'Nueva petición';
    }

    const cuerpo =
      contenido.length > 120
        ? `${contenido.substring(0, 117)}...`
        : contenido;

    const respuesta =
      await getMessaging()
        .sendEachForMulticast({
          tokens: tokensUnicos,

          notification: {
            title:
              `${titulo} · ${autorNombre}`,
            body:
              cuerpo ||
              'Hay una nueva publicación en Comunidad.',
          },

          data: {
            tipo: 'muro_comunidad',
            iglesiaId,
            publicacionId,
            autorUid,
          },

          android: {
            priority: 'high',
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

      respuesta.responses.forEach(
        (resultado, index) => {
          if (!resultado.success) {
            console.log(
              `Token ${index}: `
              + `${resultado.error?.code ?? 'error desconocido'}`,
            );
          }
        },
      );
    }
  },
);