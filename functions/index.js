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
      .collection(
        'usuarios_globales',
      )
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
            .collection(
              'dispositivos',
            )
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

        // Compatibilidad con clientes antiguos que
        // aún solo poseen el campo fcmToken.
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

exports.notificarNuevoMuro =
  onDocumentCreated(
    'iglesias/{iglesiaId}/muro_comunidad/{publicacionId}',
    async (event) => {
      const snapshot =
        event.data;

      if (!snapshot) {
        console.log(
          'Evento recibido sin documento.',
        );
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
        publicacion.contenido
          ?.toString() ??
        '';

      const tipo =
        publicacion.tipo
          ?.toString() ??
        'publicacion';

      console.log(
        `Nueva publicación ${publicacionId} `
        + `en iglesia ${iglesiaId}.`,
      );

      const destinos =
        await obtenerDestinatarios(
          iglesiaId,
        );

      if (
        destinos.length === 0
      ) {
        console.log(
          'No hay tokens FCM disponibles para esta iglesia.',
        );
        return;
      }

      let titulo =
        'Nueva publicación';

      if (tipo === 'aviso') {
        titulo =
          'Nuevo aviso';
      }

      if (
        tipo === 'peticion'
      ) {
        titulo =
          'Nueva petición';
      }

      const cuerpo =
        contenido.length > 120
          ? `${contenido.substring(
              0,
              117,
            )}...`
          : contenido;

      const respuesta =
        await getMessaging()
          .sendEachForMulticast({
            tokens:
              destinos.map(
                (destino) =>
                  destino.token,
              ),

            notification: {
              title:
                `${titulo} · ${autorNombre}`,
              body:
                cuerpo ||
                'Hay una nueva publicación en Comunidad.',
            },

            data: {
              tipo:
                'muro_comunidad',
              iglesiaId,
              publicacionId,
              autorUid,
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
        respuesta.failureCount >
        0
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
            if (
              resultado.success
            ) {
              return;
            }

            const errorCode =
              resultado.error
                ?.code ??
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
    },
  );