import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/models/app_models.dart';
import '../../core/services/coordinador_desvinculacion.dart';
import '../../core/services/desvinculacion_pendiente_service.dart';
import '../../core/services/desvinculacion_service.dart';
import '../../core/services/roles_service.dart';
import '../../core/services/miembros_legacy_service.dart';
import '../../core/widgets/safe_avatar.dart';
import 'exportar_miembros.dart';

/// Editor aislado e inyectable. La descripción y el rol tienen commits y
/// resultados separados. Cerrar/reabrir recupera el payload cifrado original.
class EditorRolMiembro extends StatefulWidget {
  const EditorRolMiembro({
    super.key,
    required this.servicio,
    required this.iglesiaId,
    required this.uidObjetivo,
    required this.descripcion,
    required this.permitirRol,
    required this.guardarDescripcion,
  });
  final RolesService servicio;
  final String iglesiaId, uidObjetivo, descripcion;
  final bool permitirRol; // Solo presentación; el backend acredita titularidad.
  final Future<void> Function(String) guardarDescripcion;
  @override
  State<EditorRolMiembro> createState() => _EditorRolMiembroState();
}

class _EditorRolMiembroState extends State<EditorRolMiembro> {
  late final TextEditingController _descripcion;
  late final int _revision;
  ContextoCambioRol? _contexto;
  SolicitudRol? _solicitud;
  String? _rol;
  String _mensajeRol = 'Verificando solicitud guardada…';
  String _mensajeDescripcion = '';
  bool _ocupado = true, _guardando = false, _bloqueado = false;
  bool get _vigente => mounted && widget.servicio.vigente(_revision);
  @override
  void initState() {
    super.initState();
    _revision = widget.servicio.revision;
    _descripcion = TextEditingController(text: widget.descripcion);
    widget.servicio.addListener(_sesionCambio);
    unawaited(_cargar());
  }

  void _sesionCambio() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    widget.servicio.removeListener(_sesionCambio);
    _descripcion.dispose();
    super.dispose();
  }

  String _error(Object e) {
    final codigo = e is ErrorRoles
        ? e.codigo
        : e is FirebaseFunctionsException
        ? e.code
        : 'general';
    return switch (codigo) {
      'aborted' =>
        'El contexto cambió. Revisa nuevamente antes de decidir otro cambio.',
      'permission-denied' => 'No tienes autorización para cambiar este rol.',
      'failed-precondition' =>
        'Se requiere migración de pertenencia o revisión administrativa.',
      'sesion-cambiada' ||
      'unauthenticated' => 'La sesión cambió. Cierra el editor.',
      'unavailable' || 'deadline-exceeded' =>
        'No se pudo conectar. Conserva la solicitud y reintenta.',
      'resultado-incierto' =>
        'Resultado incierto. Recupera la misma solicitud; no inicies otra.',
      _ => 'No se pudo verificar el resultado. Conserva la solicitud guardada.',
    };
  }

  Future<void> _cargar() async {
    try {
      final s = await widget.servicio.recuperar(widget.uidObjetivo);
      if (!_vigente) return;
      if (s != null && s.parametros['iglesiaId'] != widget.iglesiaId) {
        throw const ErrorRoles('registro-incompatible');
      }
      _solicitud = s;
      _contexto = null;
      _mensajeRol = s?.estado == EstadoSolicitudRol.incierta
          ? 'Solicitud incierta guardada. Reintentar usa los parámetros originales.'
          : s?.estado == EstadoSolicitudRol.confirmada
          ? 'Operación original confirmada. No acredita el rol vigente; solicita nueva revisión.'
          : 'Revisa el contexto del servidor antes de elegir un rol.';
    } catch (e) {
      _bloqueado = true;
      _mensajeRol = _error(e);
    } finally {
      if (mounted) setState(() => _ocupado = false);
    }
  }

  Future<void> _revisar() async {
    setState(() => _ocupado = true);
    try {
      final c = await widget.servicio.obtenerContexto(
        widget.iglesiaId,
        widget.uidObjetivo,
      );
      if (!_vigente) return;
      _contexto = c;
      _rol = c.rolActual;
      _mensajeRol =
          'Rol consultado: ${c.rolActual}. El contexto puede cambiar.';
    } catch (e) {
      if (_vigente) _mensajeRol = _error(e);
    } finally {
      if (mounted) setState(() => _ocupado = false);
    }
  }

  Future<void> _cambiar({bool reintentar = false}) async {
    if (!_vigente || _ocupado) return;
    setState(() => _ocupado = true);
    try {
      final confirmado = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text(
            reintentar
                ? 'Reintentar solicitud original'
                : 'Confirmar cambio de rol',
          ),
          content: Text(
            reintentar
                ? 'Se repetirá exactamente la operación guardada. Una confirmación puede ser histórica.'
                : 'Cambiar el rol a $_rol. La descripción se guarda por separado.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancelar'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Confirmar'),
            ),
          ],
        ),
      );
      if (confirmado != true || !_vigente) return;
      if (reintentar) {
        await widget.servicio.reintentar(widget.uidObjetivo);
      } else {
        await widget.servicio.cambiar(
          widget.iglesiaId,
          widget.uidObjetivo,
          _contexto!,
          _rol!,
          confirmado: true,
        );
      }
      if (!_vigente) return;
      await _cargar();
    } catch (e) {
      if (!_vigente) return;
      // Leer solo el registro ORIGINAL; nunca refrescar versiones tras incertidumbre.
      await _cargar();
      if (_vigente) _mensajeRol = _error(e);
    } finally {
      if (mounted) setState(() => _ocupado = false);
    }
  }

  Future<void> _guardarDescripcion() async {
    if (!_vigente || _guardando) return;
    setState(() => _guardando = true);
    try {
      await widget.guardarDescripcion(_descripcion.text.trim());
      if (_vigente) {
        _mensajeDescripcion =
            'Descripción guardada. El rol se gestiona por separado.';
      }
    } catch (_) {
      if (_vigente) _mensajeDescripcion = 'No se confirmó el guardado de descripción. El resultado del rol es independiente.';
    } finally {
      if (mounted) setState(() => _guardando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final incierta = _solicitud?.estado == EstadoSolicitudRol.incierta;
    final disponible = _vigente && !_ocupado && !_guardando;
    return Padding(
      padding: EdgeInsets.fromLTRB(
        20,
        24,
        20,
        MediaQuery.viewInsetsOf(context).bottom + 24,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Editar Miembro',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _descripcion,
              enabled: disponible,
              decoration: const InputDecoration(
                labelText: 'Descripción / Área',
              ),
            ),
            TextButton(
              onPressed: disponible ? _guardarDescripcion : null,
              child: const Text('Guardar descripción'),
            ),
            Text(_mensajeDescripcion),
            const Divider(),
            if (!_vigente)
              const Text('La sesión cambió. Cierra el editor.')
            else if (!widget.permitirRol)
              const Text('Rol gestionado por transferencia administrativa.')
            else ...[
              Text(_mensajeRol),
              if (incierta)
                FilledButton(
                  onPressed: disponible && !_bloqueado
                      ? () => _cambiar(reintentar: true)
                      : null,
                  child: const Text('Reintentar solicitud original'),
                )
              else ...[
                TextButton(
                  onPressed: disponible && !_bloqueado ? _revisar : null,
                  child: const Text('Revisar contexto actual'),
                ),
                DropdownButtonFormField<String>(
                  key: ValueKey(_contexto),
                  initialValue: _rol,
                  decoration: const InputDecoration(
                    labelText: 'Rol en la iglesia',
                  ),
                  items: const [
                    DropdownMenuItem(
                      value: 'servidor',
                      child: Text('Servidor'),
                    ),
                    DropdownMenuItem(
                      value: 'lider_area',
                      child: Text('Líder de Área'),
                    ),
                  ],
                  onChanged: disponible && _contexto != null && !_bloqueado
                      ? (v) => setState(() => _rol = v)
                      : null,
                ),
                FilledButton(
                  onPressed:
                      disponible &&
                          _contexto != null &&
                          _rol != null &&
                          !_bloqueado
                      ? _cambiar
                      : null,
                  child: const Text('Confirmar cambio de rol'),
                ),
              ],
            ],
            if (_ocupado || _guardando) const LinearProgressIndicator(),
            const Text(
              'Descripción y rol se guardan por separado. Las confirmaciones de solicitudes son históricas.',
            ),
          ],
        ),
      ),
    );
  }
}

class MiembroGestion {
  const MiembroGestion(this.id, this.datos);
  final String id;
  final Map<String, dynamic> datos;
  Map<String, dynamic> data() => datos;
}

class _ExpulsionVisible {
  _ExpulsionVisible(this.solicitudId);
  final String solicitudId;
  ContextoDesvinculacion? contexto;
  String estado = 'Pendiente: consultar resultado';
  bool ocupada = false;
}

class GestionMiembrosScreen extends StatefulWidget {
  final UsuarioModel usuario;

  const GestionMiembrosScreen({
    super.key,
    required this.usuario,
    this.uidActual,
    this.cambiosSesion,
    this.persistencia,
    this.remoto,
    this.observarIglesia,
    this.observarMiembros,
    this.leerPerfilServidor,
    this.leerIglesiaServidor,
  });
  final String? Function()? uidActual;
  final Stream<String?>? cambiosSesion;
  final DesvinculacionPendienteService? persistencia;
  final DesvinculacionService? remoto;
  final Stream<Map<String, dynamic>?> Function()? observarIglesia;
  final Stream<List<MiembroGestion>> Function()? observarMiembros;
  final Future<Map<String, dynamic>?> Function(String uid)? leerPerfilServidor;
  final Future<Map<String, dynamic>?> Function()? leerIglesiaServidor;

  @override
  State<GestionMiembrosScreen> createState() => _GestionMiembrosScreenState();
}

class _GestionMiembrosScreenState extends State<GestionMiembrosScreen> {
  late final FirebaseFunctions _functions = FirebaseFunctions.instanceFor(
    region: 'southamerica-west1',
  );

  bool _transfiriendo = false;
  final _sesiones = StreamController<String?>.broadcast(sync: true);
  StreamSubscription<String?>? _authSubscription;
  late final CoordinadorDesvinculacion _coordinador;
  late final DesvinculacionPendienteService _persistencia;
  late final Stream<Map<String, dynamic>?> _iglesiaFlujo;
  late final Stream<List<MiembroGestion>> _miembrosFlujo;
  final _operaciones = <String, _ExpulsionVisible>{};
  final _objetivosOcupados = <String>{};
  String? _uidSesion;
  int _revision = 0;
  bool _indiceListo = false;
  bool _cargandoIndice = false;
  String? _errorIndice;
  String? _adminPrincipalUid;

  String? _uidActual() =>
      widget.uidActual?.call() ??
      (widget.uidActual == null
          ? FirebaseAuth.instance.currentUser?.uid
          : null);
  bool _vigente(int revision) {
    try {
      return mounted &&
          revision == _revision &&
          _uidSesion == widget.usuario.uid &&
          _uidActual() == widget.usuario.uid;
    } catch (_) {
      return false;
    }
  }

  @override
  void initState() {
    super.initState();
    _uidSesion = _uidActual();
    final remoto =
        widget.remoto ?? DesvinculacionService(uidActual: _uidActual);
    _persistencia =
        widget.persistencia ??
        DesvinculacionPendienteService(uidActual: _uidActual, remoto: remoto);
    _coordinador = CoordinadorDesvinculacion(
      uidActual: _uidActual,
      cambiosSesion: _sesiones.stream,
      persistencia: _persistencia,
      remoto: remoto,
    );
    _iglesiaFlujo =
        widget.observarIglesia?.call() ??
        _iglesiaRef
            .snapshots(includeMetadataChanges: true)
            .where((s) => !s.metadata.isFromCache)
            .map((s) => s.data());
    _miembrosFlujo =
        widget.observarMiembros?.call() ??
        _usuariosRef
            .where('iglesiaId', isEqualTo: widget.usuario.iglesiaId)
            .snapshots(includeMetadataChanges: true)
            .where((s) => !s.metadata.isFromCache)
            .map(
              (s) => s.docs.map((d) => MiembroGestion(d.id, d.data())).toList(),
            );
    _authSubscription =
        (widget.cambiosSesion ??
                FirebaseAuth.instance.authStateChanges().map((u) => u?.uid))
            .listen(
              (uid) {
                if (uid == _uidSesion) return;
                _uidSesion = uid;
                _revision++;
                _sesiones.add(uid);
                setState(() {
                  _operaciones.clear();
                  _objetivosOcupados.clear();
                  _indiceListo = false;
                  _cargandoIndice = false;
                });
                unawaited(_cargarPendientes());
              },
              onError: (Object _) {
                _invalidarSesion();
              },
              onDone: _invalidarSesion,
            );
    unawaited(_cargarPendientes());
  }

  void _invalidarSesion() {
    _revision++;
    _uidSesion = null;
    if (!_sesiones.isClosed) _sesiones.add(null);
    if (mounted) {
      setState(() {
        _operaciones.clear();
        _objetivosOcupados.clear();
        _indiceListo = false;
      });
    }
  }

  @override
  void dispose() {
    _revision++;
    unawaited(_authSubscription?.cancel());
    unawaited(_coordinador.dispose());
    unawaited(_sesiones.close());
    super.dispose();
  }

  Future<Map<String, dynamic>?> _leerPerfil(String uid) =>
      widget.leerPerfilServidor?.call(uid) ??
      _usuariosRef
          .doc(uid)
          .get(const GetOptions(source: Source.server))
          .then((s) => s.data());
  Future<Map<String, dynamic>?> _leerIglesia() =>
      widget.leerIglesiaServidor?.call() ??
      _iglesiaRef
          .get(const GetOptions(source: Source.server))
          .then((s) => s.data());

  Future<void> _cargarPendientes() async {
    final revision = _revision;
    if (!_vigente(revision) || _cargandoIndice) return;
    setState(() {
      _cargandoIndice = true;
      _indiceListo = false;
      _errorIndice = null;
    });
    try {
      final solicitudes = await _persistencia.recuperarExpulsionesActor(
        widget.usuario.uid,
      );
      if (!_vigente(revision)) return;
      setState(() {
        for (final s in solicitudes) {
          _operaciones.putIfAbsent(
            s.solicitudId,
            () => _ExpulsionVisible(s.solicitudId),
          );
        }
        _indiceListo = true;
      });
    } catch (_) {
      if (_vigente(revision)) {
        setState(
          () => _errorIndice = 'No se pueden recuperar las solicitudes. No se iniciarán nuevas expulsiones.',
        );
      }
    } finally {
      if (_vigente(revision)) setState(() => _cargandoIndice = false);
    }
  }

  Future<bool> _esTitularVigente(int revision) async {
    final datos = await Future.wait([
      _leerPerfil(widget.usuario.uid),
      _leerIglesia(),
    ]);
    return _vigente(revision) &&
        datos[0]?['iglesiaId'] == widget.usuario.iglesiaId &&
        datos[0]?['rolGlobal'] == 'admin_iglesia' &&
        datos[1]?['adminUid'] == widget.usuario.uid;
  }

  void _mostrarResultado(
    _ExpulsionVisible op,
    ResultadoCoordinacionDesvinculacion r,
  ) {
    op.estado = switch (r.estado) {
      EstadoCoordinacionDesvinculacion.confirmada =>
        'Confirmada (histórica): no acredita pertenencia actual.',
      EstadoCoordinacionDesvinculacion.rechazada =>
        'Rechazada esta llamada. Conserva la solicitud original.',
      EstadoCoordinacionDesvinculacion.incierta ||
      EstadoCoordinacionDesvinculacion.transitoria =>
        'Resultado pendiente: consulta antes de continuar.',
      _ => 'Bloqueada: no se pudo acreditar el resultado original.',
    };
  }

  Future<void> _consultarExpulsion(
    _ExpulsionVisible op, {
    bool reintentar = false,
  }) async {
    final revision = _revision;
    if (!_vigente(revision) || op.ocupada) return;
    setState(() => op.ocupada = true);
    try {
      ResultadoCoordinacionDesvinculacion r;
      if (reintentar && op.contexto != null) {
        if (!await _esTitularVigente(revision)) {
          if (_vigente(revision)) {
            op.estado = 'Bloqueada: administración no vigente.';
          }
          return;
        }
        r = await _coordinador.reintentar(contexto: op.contexto);
      } else {
        r = await _coordinador.recuperarContexto(solicitudId: op.solicitudId);
      }
      if (!_vigente(revision)) return;
      final c = r.contextoRecuperado;
      if (c != null) {
        if (c.actorUid != widget.usuario.uid ||
            c.accion != AccionDesvinculacion.expulsar ||
            c.uidObjetivo == c.actorUid) {
          op.estado =
              'Bloqueada: el recibo no corresponde a una expulsión propia.';
          return;
        }
        op.contexto = c;
      }
      _mostrarResultado(op, r);
    } catch (_) {
      if (_vigente(revision)) {
        op.estado = 'Bloqueada: conserva el registro para recuperarlo.';
      }
    } finally {
      if (_vigente(revision)) setState(() => op.ocupada = false);
    }
  }

  Widget _panelExpulsiones() => SizedBox(
    height: _operaciones.isEmpty ? 90 : 210,
    child: ListView(
      children: [
        const Text('Solicitudes de expulsión', textAlign: TextAlign.center),
        if (_errorIndice != null)
          Text(_errorIndice!, textAlign: TextAlign.center),
        TextButton(
          onPressed: _cargandoIndice ? null : _cargarPendientes,
          child: Text(
            _cargandoIndice
                ? 'Recuperando solicitudes…'
                : 'Recargar solicitudes',
          ),
        ),
        for (final op in _operaciones.values)
          ListTile(
            title: Text(op.estado),
            subtitle: Wrap(
              children: [
                TextButton(
                  onPressed: op.ocupada ? null : () => _consultarExpulsion(op),
                  child: const Text('Consultar expulsión'),
                ),
                if (op.contexto != null && _esAdmin)
                  TextButton(
                    onPressed: op.ocupada
                        ? null
                        : () => _consultarExpulsion(op, reintentar: true),
                    child: const Text('Reintentar misma solicitud'),
                  ),
              ],
            ),
          ),
      ],
    ),
  );

  DocumentReference<Map<String, dynamic>> get _iglesiaRef => FirebaseFirestore
      .instance
      .collection('iglesias')
      .doc(widget.usuario.iglesiaId);

  CollectionReference<Map<String, dynamic>> get _usuariosRef =>
      FirebaseFirestore.instance.collection('usuarios_globales');

  bool get _esAdmin => widget.usuario.rolGlobal == 'admin_iglesia';

  Future<void> _copiarCodigo(String codigo) async {
    await Clipboard.setData(ClipboardData(text: codigo));

    if (!mounted) {
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Código copiado al portapapeles.')),
    );
  }

  Future<void> _transferirAdministracion(
    String uid,
    Map<String, dynamic> miembro,
  ) async {
    if (!_esAdmin || uid == widget.usuario.uid || _transfiriendo) return;

    final messenger = ScaffoldMessenger.of(context);
    setState(() => _transfiriendo = true);

    try {
      final confirmar = await showDialog<bool>(
        context: context,
        barrierDismissible: false,
        builder: (ctx) => AlertDialog(
          title: const Text('Transferir administración'),
          content: Text(
            '¿Confirmas la transferencia a ${miembro['nombre'] ?? 'este miembro'}?\n\n'
            'El miembro seleccionado pasará a ser el administrador principal '
            'y tu cuenta quedará como líder de área.\n\n'
            'Perderás el acceso a la edición de miembros y configuración de la iglesia.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancelar'),
            ),
            ElevatedButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Confirmar transferencia'),
            ),
          ],
        ),
      );

      if (!mounted || confirmar != true) return;

      await _functions.httpsCallable('transferirAdministracionIglesia').call({
        'iglesiaId': widget.usuario.iglesiaId,
        'nuevoAdminUid': uid,
      });

      // RootGate puede cerrar esta pantalla antes de recibir la respuesta.
      if (messenger.mounted) {
        messenger.showSnackBar(
          const SnackBar(
            content: Text(
              'Administración transferida. Tu cuenta ahora es líder de área.',
            ),
          ),
        );
      }
    } on FirebaseFunctionsException catch (error) {
      if (messenger.mounted) {
        messenger.showSnackBar(
          SnackBar(
            content: Text(
              error.message ?? 'No fue posible transferir la administración.',
            ),
          ),
        );
      }
    } catch (_) {
      if (messenger.mounted) {
        messenger.showSnackBar(
          const SnackBar(
            content: Text('No fue posible transferir la administración.'),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _transfiriendo = false);
    }
  }

  Future<void> _editarMiembro(
    String uid,
    Map<String, dynamic> miembro, {
    required bool esAdminPrincipal,
  }) async {
    final revision = _revision;
    if (!_esAdmin ||
        !_vigente(revision) ||
        !_indiceListo ||
        _objetivosOcupados.contains(uid)) {
      return;
    }
    final messenger = ScaffoldMessenger.of(context);
    final roles = RolesService(
      uidActual: _uidActual,
      cambiosSesion: _sesiones.stream,
    );
    setState(() => _objetivosOcupados.add(uid));
    try {
      if (!miembro.containsKey('pertenenciaId') &&
          uid != widget.usuario.uid &&
          !esAdminPrincipal) {
        final pendiente = await roles.recuperar(uid);
        if (!_vigente(revision)) return;
        if (pendiente?.estado == EstadoSolicitudRol.incierta) {
          throw const ErrorRoles('resultado-incierto');
        }
        await _editarLegacy(uid, miembro, revision);
        return;
      }
      await showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        backgroundColor: Theme.of(context).colorScheme.surface,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        builder: (_) => EditorRolMiembro(
          servicio: roles,
          iglesiaId: widget.usuario.iglesiaId,
          uidObjetivo: uid,
          descripcion: miembro['descripcion']?.toString() ?? '',
          permitirRol: uid != widget.usuario.uid && !esAdminPrincipal,
          guardarDescripcion: (descripcion) async {
            if (!_vigente(revision)) throw const ErrorRoles('sesion-cambiada');
            await _usuariosRef.doc(uid).update({'descripcion': descripcion});
            if (!_vigente(revision)) throw const ErrorRoles('sesion-cambiada');
          },
        ),
      );
    } catch (_) {
      if (_vigente(revision)) {
        messenger.showSnackBar(
          const SnackBar(
            content: Text(
              'No se pudo verificar el miembro o su solicitud pendiente.',
            ),
          ),
        );
      }
    } finally {
      roles.dispose();
      if (_vigente(revision)) setState(() => _objetivosOcupados.remove(uid));
    }
  }

  MiembrosLegacyService get _legacy {
    final revision = _revision;
    return MiembrosLegacyService(
      firestore: FirebaseFirestore.instance,
      uidActual: () => _vigente(revision) ? _uidActual() : null,
    );
  }

  Future<void> _editarLegacy(
    String uid,
    Map<String, dynamic> miembro,
    int revision,
  ) async {
    final descripcion = TextEditingController(
      text: miembro['descripcion']?.toString() ?? '',
    );
    var rol = miembro['rolGlobal']?.toString() ?? '';
    if (!['servidor', 'lider_area'].contains(rol)) {
      descripcion.dispose();
      return;
    }
    bool ocupado = false, incierto = false;
    String? error;
    try {
      await showDialog<void>(
        context: context,
        builder: (ctx) => StatefulBuilder(
          builder: (ctx, estado) => AlertDialog(
            title: const Text('Editar miembro'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                DropdownButton<String>(
                  value: rol,
                  isExpanded: true,
                  items: const [
                    DropdownMenuItem(
                      value: 'servidor',
                      child: Text('Servidor'),
                    ),
                    DropdownMenuItem(
                      value: 'lider_area',
                      child: Text('Líder de área'),
                    ),
                  ],
                  onChanged: ocupado || incierto
                      ? null
                      : (v) => estado(() => rol = v!),
                ),
                TextField(
                  controller: descripcion,
                  enabled: !ocupado && !incierto,
                  decoration: const InputDecoration(labelText: 'Descripción'),
                ),
                if (error != null) Text(error!),
              ],
            ),
            actions: [
              TextButton(
                onPressed: ocupado ? null : () => Navigator.pop(ctx),
                child: const Text('Cerrar'),
              ),
              FilledButton(
                onPressed: ocupado || incierto
                    ? null
                    : () async {
                        if (!_vigente(revision)) return;
                        estado(() => ocupado = true);
                        try {
                          await _legacy.actualizar(
                            iglesiaId: widget.usuario.iglesiaId,
                            uidObjetivo: uid,
                            rolEsperado: miembro['rolGlobal'] as String,
                            nuevoRol: rol,
                            descripcion: descripcion.text.trim(),
                          );
                          if (ctx.mounted) Navigator.pop(ctx);
                        } catch (_) {
                          if (ctx.mounted) {
                            estado(() {
                              ocupado = false;
                              incierto = true;
                              error = 'No se confirmó el resultado. Cierra y revisa el miembro antes de otro cambio.';
                            });
                          }
                        }
                      },
                child: const Text('Confirmar cambios'),
              ),
            ],
          ),
        ),
      );
    } finally {
      // El diálogo puede seguir desmontando su campo al cerrar.
      WidgetsBinding.instance.addPostFrameCallback(
        (_) => descripcion.dispose(),
      );
    }
  }

  Future<void> _quitarMiembro(String uid, Map<String, dynamic> miembro) async {
    final revision = _revision;
    if (!_esAdmin ||
        !_indiceListo ||
        !_vigente(revision) ||
        _objetivosOcupados.contains(uid)) {
      return;
    }
    final messenger = ScaffoldMessenger.of(context);
    if (uid == widget.usuario.uid) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'No puedes quitarte a ti mismo '
            'desde esta pantalla.',
          ),
        ),
      );

      return;
    }

    if (uid == _adminPrincipalUid) return;
    final periodo = miembro['pertenenciaId'];
    final legacy = !miembro.containsKey('pertenenciaId');
    if (!legacy &&
        (periodo is! String || !RegExp(r'^[a-f0-9]{64}$').hasMatch(periodo))) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'El miembro requiere migración de pertenencia antes de expulsarlo.',
          ),
        ),
      );
      return;
    }
    setState(() => _objetivosOcupados.add(uid));
    try {
      final confirmar = await showDialog<bool>(
        context: context,
        builder: (ctx) {
          return AlertDialog(
            title: const Text('Quitar de la congregación'),
            content: Text(
              '¿Deseas quitar a '
              '${miembro['nombre'] ?? 'este miembro'} '
              'de esta congregación?\n\n'
              'Su cuenta no será eliminada.',
            ),
            actions: [
              TextButton(
                onPressed: () {
                  Navigator.pop(ctx, false);
                },
                child: const Text('Cancelar'),
              ),
              ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.redAccent,
                  foregroundColor: Colors.white,
                ),
                onPressed: () {
                  Navigator.pop(ctx, true);
                },
                child: const Text('Quitar'),
              ),
            ],
          );
        },
      );

      if (confirmar != true || !_vigente(revision)) {
        return;
      }

      if (legacy) {
        await _legacy.actualizar(
          iglesiaId: widget.usuario.iglesiaId,
          uidObjetivo: uid,
          rolEsperado: miembro['rolGlobal'] as String,
          expulsar: true,
        );
        if (_vigente(revision)) {
          messenger.showSnackBar(
            const SnackBar(content: Text('Miembro desvinculado.')),
          );
        }
        return;
      }

      final datos = await Future.wait([
        _leerPerfil(widget.usuario.uid),
        _leerIglesia(),
        _leerPerfil(uid),
      ]);
      if (!_vigente(revision)) return;
      if (datos[0]?['iglesiaId'] != widget.usuario.iglesiaId ||
          datos[0]?['rolGlobal'] != 'admin_iglesia' ||
          datos[1]?['adminUid'] != widget.usuario.uid ||
          datos[1]?['adminUid'] == uid ||
          datos[2]?['iglesiaId'] != widget.usuario.iglesiaId ||
          datos[2]?['pertenenciaId'] != periodo) {
        messenger.showSnackBar(
          const SnackBar(
            content: Text(
              'La administración o pertenencia cambió. No se inició otra solicitud.',
            ),
          ),
        );
        return;
      }
      final c = ContextoDesvinculacion(
        actorUid: widget.usuario.uid,
        uidObjetivo: uid,
        iglesiaId: widget.usuario.iglesiaId,
        accion: AccionDesvinculacion.expulsar,
        pertenenciaId: periodo as String,
      );
      _ExpulsionVisible? op;
      final resultado = await _coordinador.iniciarExpulsion(
        contexto: c,
        decisionConfirmada: true,
        alPreparar: (solicitud) {
          if (!_vigente(revision)) return;
          setState(() {
            op = _operaciones.putIfAbsent(
              solicitud.solicitudId,
              () => _ExpulsionVisible(solicitud.solicitudId),
            );
            op!.contexto = c;
            op!.ocupada = true;
          });
        },
      );
      if (!_vigente(revision)) return;
      if (op != null) {
        setState(() {
          op!.ocupada = false;
          _mostrarResultado(op!, resultado);
        });
      } else {
        await _cargarPendientes();
      }
    } catch (_) {
      if (_vigente(revision)) {
        setState(() {
          _indiceListo = false;
          _errorIndice = 'No se pudo confirmar la solicitud. Recupera el registro original.';
        });
      }
    } finally {
      if (_vigente(revision)) setState(() => _objetivosOcupados.remove(uid));
    }
  }

  Color _colorRol(String rol) {
    switch (rol) {
      case 'admin_iglesia':
        return const Color(0xFF3B82F6);

      case 'lider_area':
        return const Color(0xFFEF4444);

      default:
        return const Color(0xFF64748B);
    }
  }

  String _textoRol(String rol) {
    switch (rol) {
      case 'admin_iglesia':
        return 'ADMINISTRADOR';

      case 'lider_area':
        return 'LÍDER DE ÁREA';

      default:
        return 'SERVIDOR REGULAR';
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    final oscuro = theme.brightness == Brightness.dark;

    final tarjeta = theme.colorScheme.surface;

    final borde = oscuro ? const Color(0xFF334155) : const Color(0xFFE2E8F0);

    final textoPrincipal = theme.colorScheme.onSurface;

    final textoSecundario = theme.colorScheme.onSurfaceVariant;

    if (!_vigente(_revision)) {
      return const Scaffold(
        body: Center(
          child: Text('La sesión cambió. Vuelve a abrir la pantalla.'),
        ),
      );
    }
    if (!puedeExportarMiembros(widget.usuario)) {
      return Scaffold(
        body: Column(
          children: [
            _panelExpulsiones(),
            Expanded(
              child: Center(
                child: Text(
                  'No tienes permisos '
                  'para gestionar miembros.',
                  style: TextStyle(color: textoSecundario),
                ),
              ),
            ),
          ],
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Gestión de Miembros')),
      body: Column(
        children: [
          _panelExpulsiones(),
          Expanded(
            child: StreamBuilder<Map<String, dynamic>?>(
              stream: _iglesiaFlujo,
              builder: (context, iglesiaSnapshot) {
                if (iglesiaSnapshot.connectionState ==
                    ConnectionState.waiting) {
                  return const Center(child: CircularProgressIndicator());
                }

                if (!iglesiaSnapshot.hasData || iglesiaSnapshot.hasError) {
                  return Center(
                    child: Text(
                      'No se encontró la iglesia.',
                      style: TextStyle(color: textoSecundario),
                    ),
                  );
                }

                final iglesia = iglesiaSnapshot.data!;

                final adminPrincipalUid = iglesia['adminUid'];
                _adminPrincipalUid = adminPrincipalUid is String
                    ? adminPrincipalUid
                    : null;

                final codigo = iglesia['codigoAcceso']?.toString() ?? '';

                return Column(
                  children: [
                    if (_esAdmin)
                      Container(
                        margin: const EdgeInsets.all(16),
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: oscuro
                              ? const Color(0xFF111C2E)
                              : const Color(0xFFEFF6FF),
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: const Color(0xFF3B82F6)),
                        ),
                        child: Row(
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Text(
                                    'Código de Invitación',
                                    style: TextStyle(
                                      color: Color(0xFF3B82F6),
                                      fontSize: 12,
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    codigo,
                                    style: TextStyle(
                                      color: textoPrincipal,
                                      fontSize: 22,
                                      fontWeight: FontWeight.bold,
                                      letterSpacing: 1,
                                    ),
                                  ),
                                ],
                              ),
                            ),

                            ElevatedButton.icon(
                              style: ElevatedButton.styleFrom(
                                backgroundColor: const Color(0xFF3B82F6),
                                foregroundColor: Colors.white,
                              ),
                              onPressed: codigo.isEmpty
                                  ? null
                                  : () {
                                      _copiarCodigo(codigo);
                                    },
                              icon: const Icon(Icons.copy, size: 18),
                              label: const Text('Copiar'),
                            ),
                          ],
                        ),
                      ),

                    Expanded(
                      child: StreamBuilder<List<MiembroGestion>>(
                        stream: _miembrosFlujo,
                        builder: (context, snapshot) {
                          if (snapshot.connectionState ==
                              ConnectionState.waiting) {
                            return const Center(
                              child: CircularProgressIndicator(),
                            );
                          }

                          if (snapshot.hasError) {
                            return Center(
                              child: Text(
                                'No fue posible cargar '
                                'los miembros.',
                                textAlign: TextAlign.center,
                                style: const TextStyle(color: Colors.redAccent),
                              ),
                            );
                          }

                          final docs = snapshot.data ?? [];

                          final miembros = [...docs];

                          miembros.sort((a, b) {
                            final nombreA =
                                a.data()['nombre']?.toString().toLowerCase() ??
                                '';

                            final nombreB =
                                b.data()['nombre']?.toString().toLowerCase() ??
                                '';

                            return nombreA.compareTo(nombreB);
                          });

                          final lista = ListView.builder(
                            padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                            itemCount: miembros.length,
                            itemBuilder: (context, index) {
                              final doc = miembros[index];

                              final miembro = doc.data();

                              final nombre =
                                  miembro['nombre']?.toString() ?? 'Sin nombre';

                              final descripcion =
                                  miembro['descripcion']?.toString() ??
                                  'Sin descripción';

                              final fotoUrl =
                                  miembro['fotoUrl']?.toString() ?? '';

                              final rol =
                                  miembro['rolGlobal']?.toString() ??
                                  'servidor';

                              return Container(
                                margin: const EdgeInsets.only(bottom: 12),
                                padding: const EdgeInsets.all(14),
                                decoration: BoxDecoration(
                                  color: tarjeta,
                                  borderRadius: BorderRadius.circular(14),
                                  border: Border.all(color: borde),
                                ),
                                child: Row(
                                  children: [
                                    SafeAvatar(
                                      imageUrl: fotoUrl,
                                      nombre: nombre,
                                      radius: 22,
                                    ),

                                    const SizedBox(width: 14),

                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            nombre,
                                            style: TextStyle(
                                              color: textoPrincipal,
                                              fontWeight: FontWeight.bold,
                                              fontSize: 16,
                                            ),
                                          ),

                                          const SizedBox(height: 3),

                                          Text(
                                            descripcion,
                                            style: TextStyle(
                                              color: textoSecundario,
                                              fontSize: 12,
                                            ),
                                          ),

                                          const SizedBox(height: 7),

                                          Container(
                                            padding: const EdgeInsets.symmetric(
                                              horizontal: 8,
                                              vertical: 3,
                                            ),
                                            decoration: BoxDecoration(
                                              borderRadius:
                                                  BorderRadius.circular(5),
                                              border: Border.all(
                                                color: _colorRol(rol),
                                              ),
                                            ),
                                            child: Text(
                                              _textoRol(rol),
                                              style: TextStyle(
                                                color: _colorRol(rol),
                                                fontSize: 10,
                                                fontWeight: FontWeight.bold,
                                              ),
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),

                                    if (_esAdmin)
                                      IconButton(
                                        tooltip: 'Editar miembro',
                                        onPressed: _transfiriendo
                                            ? null
                                            : () {
                                                _editarMiembro(
                                                  doc.id,
                                                  miembro,
                                                  esAdminPrincipal:
                                                      doc.id ==
                                                      adminPrincipalUid,
                                                );
                                              },
                                        icon: Icon(
                                          Icons.manage_accounts,
                                          color: textoSecundario,
                                        ),
                                      ),

                                    if (_esAdmin &&
                                        adminPrincipalUid ==
                                            widget.usuario.uid &&
                                        doc.id != widget.usuario.uid)
                                      IconButton(
                                        tooltip: 'Transferir administración',
                                        onPressed: _transfiriendo
                                            ? null
                                            : () => _transferirAdministracion(
                                                doc.id,
                                                miembro,
                                              ),
                                        icon: Icon(
                                          Icons.swap_horiz,
                                          color: textoSecundario,
                                        ),
                                      ),

                                    if (_esAdmin)
                                      IconButton(
                                        tooltip: 'Quitar de la congregación',
                                        onPressed:
                                            _transfiriendo ||
                                                !_indiceListo ||
                                                _objetivosOcupados.contains(
                                                  doc.id,
                                                ) ||
                                                adminPrincipalUid !=
                                                    widget.usuario.uid ||
                                                doc.id == widget.usuario.uid ||
                                                doc.id == adminPrincipalUid
                                            ? null
                                            : () {
                                                _quitarMiembro(doc.id, miembro);
                                              },
                                        icon: const Icon(
                                          Icons.delete_outline,
                                          color: Colors.redAccent,
                                        ),
                                      ),
                                  ],
                                ),
                              );
                            },
                          );
                          return Column(
                            children: [
                              Padding(
                                padding: const EdgeInsets.all(12),
                                child: ExportarMiembrosButton(
                                  usuario: widget.usuario,
                                  miembros: docs.map((doc) => doc.data()),
                                  nombreIglesia: iglesia['nombre']?.toString(),
                                ),
                              ),
                              Expanded(
                                child: docs.isEmpty
                                    ? const Center(
                                        child: Text(
                                          'No hay miembros en esta congregación.',
                                        ),
                                      )
                                    : lista,
                              ),
                            ],
                          );
                        },
                      ),
                    ),
                  ],
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
