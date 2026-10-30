import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import 'finanzas_configuracion_service.dart';
import 'finanzas_mvp_service.dart';

class FinanzasMantenimientoScreen extends StatefulWidget {
  const FinanzasMantenimientoScreen({
    super.key,
    required this.iglesiaId,
    this.servicio,
    this.servicioConfiguracion,
    this.contexto,
  });
  final String iglesiaId;
  final FinanzasMvpService? servicio;
  final FinanzasConfiguracionService? servicioConfiguracion;
  final Map<String, dynamic>? contexto;
  @override
  State<FinanzasMantenimientoScreen> createState() => _Estado();
}

class _Estado extends State<FinanzasMantenimientoScreen> {
  late final servicio = widget.servicio ?? FinanzasMvpService();
  Map<String, dynamic>? contexto;
  bool ocupado = true, pendiente = false;
  bool moduloActivado = false;
  String? mensaje;
  String accion = 'pausar';
  final periodo = TextEditingController();
  static const acciones = {
    'preparar': 'Preparar libro vacío',
    'pausar': 'Pausar operaciones',
    'verificar': 'Verificar consistencia',
    'inicializar': 'Inicializar proyecciones verificadas',
    'cambiarPeriodo': 'Cambiar al mes siguiente',
    'reanudar': 'Reanudar operaciones',
  };
  @override
  void initState() {
    super.initState();
    _cargar();
  }

  @override
  void dispose() {
    periodo.dispose();
    super.dispose();
  }

  Future<void> _cargar() async {
    try {
      var ctx = widget.contexto;
      if (ctx == null) {
        final uid = FirebaseAuth.instance.currentUser?.uid;
        if (uid == null) throw StateError('Inicia sesión.');
        final p = await FirebaseFirestore.instance
            .doc('usuarios_globales/$uid')
            .get(const GetOptions(source: Source.server));
        final i = await FirebaseFirestore.instance
            .doc('iglesias/${widget.iglesiaId}')
            .get(const GetOptions(source: Source.server));
        if (p.data()?['iglesiaId'] != widget.iglesiaId ||
            p.data()?['rolGlobal'] != 'admin_iglesia' ||
            i.data()?['adminUid'] != uid) {
          throw StateError(
            'Solo el titular vigente puede realizar mantenimiento.',
          );
        }
        ctx = {
          'iglesiaId': widget.iglesiaId,
          'pertenenciaId': p.data()?['pertenenciaId'],
        };
      }
      final p = await servicio.mantenimientoPendiente();
      if (mounted) {
        setState(() {
          contexto = ctx;
          pendiente = p != null;
          ocupado = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          ocupado = false;
          mensaje = 'No se pudo verificar la titularidad o el paso pendiente. Actualiza la sesión.';
        });
      }
    }
  }

  Future<void> _activarModulo() async {
    if (ocupado || contexto == null || moduloActivado) return;
    final aceptar = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Activar módulo de Finanzas'),
        content: const Text(
          'Se activará el módulo para esta iglesia. El libro conservará su pausa hasta verificar la consistencia y reanudar las operaciones.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(c, false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(c, true),
            child: const Text('Activar'),
          ),
        ],
      ),
    );
    if (aceptar != true || !mounted || ocupado) return;
    setState(() => ocupado = true);
    try {
      await (widget.servicioConfiguracion ?? FinanzasConfiguracionService())
          .actualizarEstadoModulo(widget.iglesiaId, true);
      if (mounted) {
        setState(() {
          moduloActivado = true;
          mensaje = 'Módulo activado. Verifica la consistencia y reanuda las operaciones.';
        });
      }
    } catch (_) {
      if (mounted) {
        setState(
          () => mensaje = 'No se pudo confirmar la activación. Puedes reintentar; el servidor comprobará tu titularidad.',
        );
      }
    } finally {
      if (mounted) setState(() => ocupado = false);
    }
  }

  Future<void> _ejecutar({
    bool recuperar = false,
    bool descartar = false,
  }) async {
    if (ocupado || contexto == null) return;
    if (!recuperar &&
        !descartar &&
        ['preparar', 'cambiarPeriodo'].contains(accion) &&
        !RegExp(r'^\d{4}-(0[1-9]|1[0-2])$').hasMatch(periodo.text.trim())) {
      setState(() => mensaje = 'Indica un período con formato AAAA-MM.');
      return;
    }
    final aceptar = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Confirmar mantenimiento financiero'),
        content: Text(
          descartar
              ? 'El servidor descartará el paso únicamente si no fue confirmado. Si ya se completó, recuperará su resultado original.'
              : recuperar
              ? 'Se recuperará el mismo paso con su identificador original.'
              : '${acciones[accion]}. Solo continúa si corresponde al procedimiento aprobado para esta iglesia.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(c, false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(c, true),
            child: const Text('Confirmar'),
          ),
        ],
      ),
    );
    if (aceptar != true || !mounted) return;
    setState(() {
      ocupado = true;
      mensaje = null;
    });
    try {
      final r = await servicio.mantener(
        contexto!,
        accion,
        periodoId: ['preparar', 'cambiarPeriodo'].contains(accion)
            ? periodo.text.trim()
            : null,
        recuperar: recuperar,
        descartar: descartar,
      );
      final resultado = r['resultado'] as Map?;
      if (mounted) {
        setState(() {
          mensaje = r['estado'] == 'RECHAZADA'
              ? 'Paso descartado sin ejecutar. Puedes elegir otro paso.'
              : resultado?['verificacion'] == 'DIVERGENCIAS'
              ? 'Se detectaron diferencias. Conserva la pausa y solicita revisión.'
              : 'Paso confirmado. Revisa el estado antes de continuar.';
        });
      }
    } catch (_) {
      if (mounted) {
        setState(
          () => mensaje = 'No se pudo confirmar el paso. Recupera la misma solicitud o solicita su descarte seguro. Si persiste, contacta al responsable del procedimiento.',
        );
      }
    } finally {
      await _cargar();
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Mantenimiento de Finanzas')),
    body: ListView(
      padding: const EdgeInsets.all(20),
      children: [
        const Text(
          'Solo el titular vigente. Requiere habilitación privada del servidor.',
        ),
        const Text(
          'Libro vacío: preparar e inicializar. Libro existente: pausar, verificar y luego inicializar o reanudar.',
        ),
        const Text(
          'Cambio de mes: pausar, verificar, cambiar al mes siguiente, verificar y reanudar. La verificación de consistencia no acredita el origen histórico.',
        ),
        if (mensaje != null) Text(mensaje!),
        if (ocupado) const LinearProgressIndicator(),
        if (contexto != null) ...[
          OutlinedButton.icon(
            onPressed: ocupado || moduloActivado ? null : _activarModulo,
            icon: const Icon(Icons.account_balance_wallet),
            label: Text(
              moduloActivado ? 'Módulo activado' : 'Activar módulo de Finanzas',
            ),
          ),
          if (pendiente) ...[
            const Text(
              'Hay un paso pendiente. No elijas otro hasta resolverlo.',
            ),
            TextButton(
              onPressed: ocupado ? null : () => _ejecutar(recuperar: true),
              child: const Text('Recuperar paso pendiente'),
            ),
            TextButton(
              onPressed: ocupado ? null : () => _ejecutar(descartar: true),
              child: const Text('Descartar paso no confirmado'),
            ),
          ] else ...[
            DropdownButtonFormField<String>(
              initialValue: accion,
              decoration: const InputDecoration(
                labelText: 'Paso de mantenimiento',
              ),
              items: acciones.entries
                  .map(
                    (e) => DropdownMenuItem(value: e.key, child: Text(e.value)),
                  )
                  .toList(),
              onChanged: ocupado ? null : (v) => setState(() => accion = v!),
            ),
            if (['preparar', 'cambiarPeriodo'].contains(accion))
              TextField(
                controller: periodo,
                decoration: const InputDecoration(labelText: 'Período AAAA-MM'),
              ),
            FilledButton(
              onPressed: ocupado ? null : _ejecutar,
              child: const Text('Revisar y ejecutar paso'),
            ),
          ],
        ],
      ],
    ),
  );
}
