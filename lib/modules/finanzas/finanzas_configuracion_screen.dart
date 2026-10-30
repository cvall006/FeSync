import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../../core/models/app_models.dart';
import 'finanzas_configuracion_model.dart';
import 'finanzas_configuracion_service.dart';
import 'finanzas_permisos.dart';

/// El integrador debe actualizar este contexto desde Auth y los documentos
/// vigentes de perfil/iglesia, y publicar null cuando no pueda confirmarlos.
/// No es una autoridad para el backend: los callables revalidan los permisos.
class ContextoAdministracionFinanzas {
  final String? uidAutenticado;
  final String? iglesiaIdSesion;
  final UsuarioModel? perfil;
  final IglesiaModel? iglesia;

  const ContextoAdministracionFinanzas({
    required this.uidAutenticado,
    required this.iglesiaIdSesion,
    required this.perfil,
    required this.iglesia,
  });

  PermisosFinanzas _permisos([FinanzasConfiguracionModel? configuracion]) =>
      PermisosFinanzas(
        uidAutenticado: uidAutenticado,
        uidPerfil: perfil?.uid,
        iglesiaIdSesion: iglesiaIdSesion,
        iglesiaIdPerfil: perfil?.iglesiaId,
        iglesiaIdDocumento: iglesia?.id,
        rolGlobal: perfil?.rolGlobal,
        adminUid: iglesia?.adminUid,
        encargadoUid: configuracion?.encargadoUid,
        moduloHabilitado: configuracion?.moduloHabilitado,
      );

  bool get esTitular => _permisos().puedeAdministrarConfiguracion;

  bool puedeGestionar(FinanzasConfiguracionModel configuracion) =>
      _permisos(configuracion).puedeAdministrarConfiguracion;
}

/// Pantalla aislada: no registra rutas ni se conecta al dashboard.
class FinanzasConfiguracionScreen extends StatefulWidget {
  final ValueListenable<ContextoAdministracionFinanzas?> contexto;
  final FinanzasConfiguracionService? servicio;
  final FirebaseFirestore? firestore;
  final Future<List<UsuarioModel>> Function(String iglesiaId)? cargarMiembros;

  const FinanzasConfiguracionScreen({
    super.key,
    required this.contexto,
    this.servicio,
    this.firestore,
    this.cargarMiembros,
  });

  @override
  State<FinanzasConfiguracionScreen> createState() =>
      _FinanzasConfiguracionScreenState();
}

class _FinanzasConfiguracionScreenState
    extends State<FinanzasConfiguracionScreen> {
  final _servicioDefecto = FinanzasConfiguracionService();
  StreamSubscription<FinanzasConfiguracionModel>? _suscripcion;
  FinanzasConfiguracionModel? _configuracion;
  String? _error;
  bool _ocupado = false;
  int _revision = 0;
  Route<dynamic>? _modal;

  FinanzasConfiguracionService get _servicio =>
      widget.servicio ?? _servicioDefecto;
  ContextoAdministracionFinanzas? get _contexto => widget.contexto.value;
  bool get _autorizado => _contexto?.esTitular == true;
  bool get _listo =>
      _autorizado &&
      _configuracion != null &&
      _contexto!.puedeGestionar(_configuracion!);

  @override
  void initState() {
    super.initState();
    widget.contexto.addListener(_vincular);
    _vincular();
  }

  @override
  void didUpdateWidget(covariant FinanzasConfiguracionScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.contexto != widget.contexto ||
        oldWidget.servicio != widget.servicio) {
      oldWidget.contexto.removeListener(_vincular);
      widget.contexto.addListener(_vincular);
      _vincular();
    }
  }

  void _cerrarModal() {
    final ruta = _modal;
    _modal = null;
    if (ruta == null) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (ruta.isActive) ruta.navigator?.removeRoute(ruta);
    });
  }

  void _vincular() {
    final revision = ++_revision;
    unawaited(_suscripcion?.cancel());
    _suscripcion = null;
    _cerrarModal();
    setState(() {
      _configuracion = null;
      _error = null;
    });
    if (!_autorizado) return;
    try {
      _suscripcion = _servicio
          .observarConfiguracion(_contexto!.iglesiaIdSesion!)
          .listen(
            (configuracion) {
              if (!_vigente(revision)) return;
              final anterior = _configuracion;
              if (anterior != null &&
                  (anterior.moduloHabilitado !=
                          configuracion.moduloHabilitado ||
                      anterior.encargadoUid != configuracion.encargadoUid ||
                      anterior.existe != configuracion.existe)) {
                _cerrarModal();
              }
              setState(() {
                _configuracion = configuracion;
                _error = null;
              });
            },
            onError: (Object error) {
              if (!_vigente(revision)) return;
              _cerrarModal();
              setState(() {
                _configuracion = null;
                _error = _mensajeError(error);
              });
            },
            onDone: () {
              if (!_vigente(revision)) return;
              _cerrarModal();
              setState(() {
                _configuracion = null;
                _error = 'No se pudo mantener la conexión. Vuelve a intentar.';
              });
            },
          );
    } catch (error) {
      _error = _mensajeError(error);
    }
  }

  bool _vigente(int revision) =>
      mounted && revision == _revision && _autorizado;

  static String _mensajeError(Object error) {
    if (error is FirebaseException) {
      if (error.code == 'permission-denied' ||
          error.code == 'unauthenticated') {
        return 'No tienes permisos para administrar Finanzas.';
      }
      if (error.code == 'unavailable' || error.code == 'deadline-exceeded') {
        return 'No se pudo conectar. Comprueba tu conexión e inténtalo nuevamente.';
      }
    }
    return 'No fue posible completar la operación. Inténtalo nuevamente.';
  }

  Future<bool> _confirmar(String titulo, String mensaje, int revision) async {
    if (!_vigente(revision) || !_listo) return false;
    var respondido = false;
    final resultado = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) {
        _modal = ModalRoute.of(ctx);
        void responder(bool valor) {
          if (respondido) return;
          respondido = true;
          Navigator.pop(ctx, valor && _vigente(revision) && _listo);
        }

        return AlertDialog(
          title: Text(titulo),
          content: Text(mensaje),
          actions: [
            TextButton(
              onPressed: () => responder(false),
              child: const Text('Cancelar'),
            ),
            FilledButton(
              onPressed: () => responder(true),
              child: const Text('Confirmar'),
            ),
          ],
        );
      },
    );
    _modal = null;
    return resultado == true && _vigente(revision) && _listo;
  }

  Future<List<UsuarioModel>> _miembros(String iglesiaId) async {
    final cargar = widget.cargarMiembros;
    if (cargar != null) return cargar(iglesiaId);
    // Mismo origen y filtro que los selectores de Servidores y Adora Live.
    // El ID del perfil es el UID; no se usan registros locales sin perfil.
    final snapshot = await (widget.firestore ?? FirebaseFirestore.instance)
        .collection('usuarios_globales')
        .where('iglesiaId', isEqualTo: iglesiaId)
        .get(const GetOptions(source: Source.server));
    return snapshot.docs
        .map((doc) => UsuarioModel.fromMap(doc.data(), doc.id))
        .toList();
  }

  Future<UsuarioModel?> _seleccionar(String iglesiaId, int revision) async {
    final miembros =
        (await _miembros(iglesiaId))
            .where(
              (miembro) =>
                  miembro.iglesiaId == iglesiaId &&
                  FinanzasConfiguracionModel.esEncargadoUidValido(miembro.uid),
            )
            .toList()
          ..sort(
            (a, b) => a.nombre.toLowerCase().compareTo(b.nombre.toLowerCase()),
          );
    if (!mounted || !_vigente(revision) || !_listo) return null;
    var busqueda = '';
    var seleccionado = false;
    final resultado = await showModalBottomSheet<UsuarioModel>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Theme.of(context).colorScheme.surface,
      builder: (ctx) {
        _modal = ModalRoute.of(ctx);
        return StatefulBuilder(
          builder: (ctx, cambiar) {
            final visibles = miembros
                .where((m) => m.nombre.toLowerCase().contains(busqueda))
                .toList();
            return SafeArea(
              child: Padding(
                padding: EdgeInsets.fromLTRB(
                  20,
                  20,
                  20,
                  MediaQuery.viewInsetsOf(ctx).bottom + 20,
                ),
                child: SizedBox(
                  height: MediaQuery.sizeOf(ctx).height * 0.55,
                  child: Column(
                    children: [
                      Text(
                        'Seleccionar encargado',
                        style: Theme.of(ctx).textTheme.titleLarge,
                      ),
                      TextField(
                        decoration: const InputDecoration(
                          labelText: 'Buscar miembro',
                          prefixIcon: Icon(Icons.search),
                        ),
                        onChanged: (valor) => cambiar(
                          () => busqueda = valor.trim().toLowerCase(),
                        ),
                      ),
                      Expanded(
                        child: visibles.isEmpty
                            ? const Center(
                                child: Text('No hay perfiles elegibles.'),
                              )
                            : ListView.builder(
                                itemCount: visibles.length,
                                itemBuilder: (ctx, indice) {
                                  final miembro = visibles[indice];
                                  return ListTile(
                                    title: Text(
                                      miembro.nombre.isEmpty
                                          ? 'Miembro'
                                          : miembro.nombre,
                                    ),
                                    subtitle: Text(miembro.rolGlobal),
                                    onTap: () {
                                      if (seleccionado ||
                                          !_vigente(revision) ||
                                          !_listo) {
                                        return;
                                      }
                                      seleccionado = true;
                                      Navigator.pop(ctx, miembro);
                                    },
                                  );
                                },
                              ),
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        );
      },
    );
    _modal = null;
    return _vigente(revision) && _listo ? resultado : null;
  }

  Future<void> _operar({bool? habilitar, bool designar = false}) async {
    if (_ocupado || !_listo) return;
    final revision = _revision;
    final iglesiaId = _contexto!.iglesiaIdSesion!;
    setState(() => _ocupado = true);
    try {
      UsuarioModel? candidato;
      if (designar) {
        candidato = await _seleccionar(iglesiaId, revision);
        if (candidato == null) return;
      }
      final titulo = designar
          ? 'Designar encargado'
          : habilitar == null
          ? 'Revocar encargado'
          : habilitar
          ? 'Activar Finanzas'
          : 'Desactivar Finanzas';
      final mensaje = designar
          ? '¿Designar a ${candidato!.nombre} como encargado financiero?'
          : habilitar == null
          ? '¿Revocar la designación del encargado actual?'
          : habilitar
          ? '¿Activar el módulo Finanzas para los usuarios autorizados?'
          : '¿Desactivar el módulo Finanzas? Los datos se conservarán.';
      if (!await _confirmar(titulo, mensaje, revision)) return;
      if (designar) {
        // El backend confirma otra vez la pertenencia dentro de su transacción.
        await _servicio.designarEncargado(iglesiaId, candidato!.uid);
      } else if (habilitar == null) {
        await _servicio.revocarEncargado(iglesiaId);
      } else {
        await _servicio.actualizarEstadoModulo(iglesiaId, habilitar);
      }
      // No se simula un estado nuevo: se espera el stream confirmado por servidor.
    } catch (error) {
      if (!_vigente(revision)) return;
      setState(() {
        _error = _mensajeError(error);
        if (error is FirebaseException &&
            (error.code == 'permission-denied' ||
                error.code == 'unauthenticated')) {
          _configuracion = null;
        }
      });
    } finally {
      if (mounted) setState(() => _ocupado = false);
    }
  }

  @override
  void dispose() {
    widget.contexto.removeListener(_vincular);
    _revision++;
    unawaited(_suscripcion?.cancel());
    _cerrarModal();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final configuracion = _configuracion;
    return Scaffold(
      appBar: AppBar(title: const Text('Configuración financiera')),
      body: !_autorizado
          ? const Center(
              child: Text('No tienes permisos para administrar Finanzas.'),
            )
          : configuracion == null
          ? Center(
              child: _error == null
                  ? const CircularProgressIndicator()
                  : Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Padding(
                          padding: const EdgeInsets.all(20),
                          child: Text(_error!, textAlign: TextAlign.center),
                        ),
                        TextButton(
                          onPressed: _ocupado ? null : _vincular,
                          child: const Text('Reintentar'),
                        ),
                      ],
                    ),
            )
          : ListView(
              padding: const EdgeInsets.all(20),
              children: [
                Text(
                  'Finanzas ${configuracion.moduloHabilitado ? 'activado' : 'desactivado'}',
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                const SizedBox(height: 16),
                Text(
                  configuracion.encargadoUid == null
                      ? 'Sin encargado designado'
                      : 'Encargado actual: ${configuracion.encargadoUid}',
                ),
                const SizedBox(height: 8),
                const Text(
                  'Solo el administrador titular y el encargado designado pueden acceder cuando Finanzas esté activado.',
                ),
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    child: Text(_error!),
                  ),
                const SizedBox(height: 16),
                FilledButton.icon(
                  key: const ValueKey('finanzas-estado'),
                  onPressed: _ocupado || !_listo
                      ? null
                      : () =>
                            _operar(habilitar: !configuracion.moduloHabilitado),
                  icon: const Icon(Icons.power_settings_new),
                  label: Text(
                    configuracion.moduloHabilitado
                        ? 'Desactivar Finanzas'
                        : 'Activar Finanzas',
                  ),
                ),
                OutlinedButton.icon(
                  key: const ValueKey('finanzas-designar'),
                  onPressed: _ocupado || !_listo
                      ? null
                      : () => _operar(designar: true),
                  icon: const Icon(Icons.person_add_alt),
                  label: const Text('Designar encargado'),
                ),
                OutlinedButton.icon(
                  key: const ValueKey('finanzas-revocar'),
                  onPressed:
                      _ocupado || !_listo || configuracion.encargadoUid == null
                      ? null
                      : () => _operar(),
                  icon: const Icon(Icons.person_remove),
                  label: const Text('Revocar encargado'),
                ),
                if (_ocupado)
                  const Padding(
                    padding: EdgeInsets.all(12),
                    child: Text('Operación en curso…'),
                  ),
              ],
            ),
    );
  }
}
