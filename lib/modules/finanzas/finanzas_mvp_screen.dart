import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';

import 'finanzas_mvp_service.dart';
import '../../core/services/firebase_emulator_bootstrap.dart';

/// Presentación de la API financiera. Los permisos efectivos se vuelven a comprobar
/// en servidor en cada lectura/escritura, incluidos reintentos.
class FinanzasMvpScreen extends StatefulWidget {
  const FinanzasMvpScreen({super.key, this.servicio});
  final FinanzasMvpService? servicio;
  @override
  State<FinanzasMvpScreen> createState() => _FinanzasMvpScreenState();
}

class _FinanzasMvpScreenState extends State<FinanzasMvpScreen> {
  late final _servicio = widget.servicio ?? FinanzasMvpService();
  Map<String, dynamic>? _datos;
  String? _error;
  bool _cargando = false;
  bool _pendiente = false;
  String _estadoPendiente = 'INCIERTA';
  int _pagina = 0;
  int _revision = 0;
  StreamSubscription<dynamic>? _acceso;
  StreamSubscription<dynamic>? _perfil;
  String? _iglesiaObservada;
  Future<void>? _cargaEnCurso;
  bool _recargaPendiente = false;
  bool _cargandoHistorial = false;

  @override
  void initState() {
    super.initState();
    _cargar();
    if (widget.servicio == null) {
      final uid = FirebaseAuth.instance.currentUser?.uid;
      if (uid != null) {
        _perfil = FirebaseFirestore.instance
            .doc('usuarios_globales/$uid')
            .snapshots(includeMetadataChanges: true)
            .listen((_) => _cargar(), onError: (Object _) => _invalidar());
      }
    }
  }

  void _invalidar() {
    if (!mounted) {
      return;
    }
    _revision++;
    setState(() {
      _datos = null;
      _estadoPendiente = 'INCIERTA';
      _cargandoHistorial = false;
      _cargando = false;
      _error = 'Acceso no verificable. Actualiza o inicia sesión nuevamente.';
    });
  }

  @override
  void dispose() {
    _revision++;
    _acceso?.cancel();
    _perfil?.cancel();
    super.dispose();
  }

  Future<void> _cargar() {
    if (!mounted) {
      return Future<void>.value();
    }
    if (_cargaEnCurso != null) {
      _recargaPendiente = true;
      _revision++;
      setState(() {
        _datos = null;
        _error = null;
        _cargando = true;
      });
      return _cargaEnCurso!;
    }
    _cargaEnCurso = _recargarEnSerie().whenComplete(() => _cargaEnCurso = null);
    return _cargaEnCurso!;
  }

  Future<void> _recargarEnSerie() async {
    do {
      _recargaPendiente = false;
      await _consultar();
    } while (mounted && _recargaPendiente);
  }

  Future<void> _consultar() async {
    final revision = ++_revision;
    setState(() {
      _cargandoHistorial = false;
      _cargando = true;
      _datos = null;
      _error = null;
    });
    try {
      final anterior = await _servicio.pendiente();
      var estadoPendiente = 'INCIERTA';
      if (anterior != null) {
        try {
          estadoPendiente =
              (await _servicio.inspeccionarPendiente())['estado'] as String;
        } catch (_) {
          estadoPendiente = 'INCIERTA';
        }
      }
      final p = await _servicio.pendiente();
      if (mounted && revision == _revision) {
        setState(() {
          _pendiente = p != null;
          _estadoPendiente = estadoPendiente;
        });
      }
      final d = await _servicio.consultar();
      if (mounted && revision == _revision) {
        setState(() {
          _datos = d;
          _pendiente = p != null;
        });
        final iglesia = (d['contexto'] as Map)['iglesiaId'] as String;
        if (widget.servicio == null && iglesia != _iglesiaObservada) {
          _iglesiaObservada = iglesia;
          _acceso?.cancel();
          _acceso = FirebaseFirestore.instance
              .doc('iglesias/$iglesia/finanzas_config/acceso')
              .snapshots(includeMetadataChanges: true)
              .listen((_) => _cargar(), onError: (Object _) => _invalidar());
        }
      }
    } catch (e) {
      if (mounted && revision == _revision) {
        if (e is FirebaseFunctionsException &&
            ['permission-denied', 'unauthenticated'].contains(e.code)) {
          _invalidar();
        } else {
          setState(() => _error = _mensajeError(e));
        }
      }
    } finally {
      if (mounted && revision == _revision) {
        setState(() => _cargando = false);
      }
    }
  }

  bool _permiso(String p) => (_datos?['permisos'] as Map?)?[p] == true;

  String get _mensajePendiente => switch (_estadoPendiente) {
    'REQUIERE_NUEVA' => 'Las condiciones o el período cambiaron. Esta solicitud no se ejecutará al recuperar. Descártala mediante el servidor y revisa una operación nueva con fecha vigente.',
    'NO_CONFIRMADA' => 'Aún no hay recibo confirmado. Puedes recuperar la misma solicitud. Para crear otra, primero confirma su descarte en el servidor.',
    _ => 'No se pudo verificar el resultado. Conserva la solicitud y su identificador. Si tu acceso fue revocado o cambiaste de iglesia, pide ayuda al titular; no vuelvas a registrar la operación.',
  };

  Future<void> _descartarPendiente() async {
    final aceptar = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Resolver solicitud pendiente'),
        content: const Text(
          'El servidor comprobará si fue confirmada. Si no lo fue, impedirá definitivamente su ejecución. Después podrás crear una operación nueva; no se copiará ni enviará automáticamente.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Confirmar descarte seguro'),
          ),
        ],
      ),
    );
    if (aceptar != true || !mounted) return;
    await _accion(() async {
      final r = await _servicio.inspeccionarPendiente(descartar: true);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              r['estado'] == 'CONFIRMADA'
                  ? 'Se recuperó el recibo original. No registres otra vez esta operación.'
                  : 'Solicitud descartada sin contabilizar. Puedes crear una operación nueva y revisar su fecha.',
            ),
          ),
        );
      }
    });
  }

  Future<void> _cargarMasHistorial() async {
    final anterior = _datos;
    final historial = anterior?['historial'] as Map?;
    final cursor = historial?['cursorSiguiente'] as String?;
    if (anterior == null || cursor == null || _cargandoHistorial || _cargando) {
      return;
    }
    final revision = _revision;
    setState(() => _cargandoHistorial = true);
    try {
      final siguiente = await _servicio.consultarPagina(
        cursor,
        historial!['limite'] as int,
      );
      if (!mounted || revision != _revision || !identical(_datos, anterior)) {
        return;
      }
      final contexto = siguiente['contexto'] as Map;
      final original = anterior['contexto'] as Map;
      if (contexto['iglesiaId'] != original['iglesiaId'] ||
          contexto['pertenenciaId'] != original['pertenenciaId'] ||
          (siguiente['historial'] as Map)['corte'] != historial['corte']) {
        throw StateError('La consulta cambió. Actualiza el historial.');
      }
      final movimientos = [
        ...(anterior['movimientos'] as List),
        ...(siguiente['movimientos'] as List),
      ];
      final ids = movimientos.map((m) => (m as Map)['id']).toSet();
      if (ids.length != movimientos.length) {
        throw StateError(
          'La página repitió movimientos. Actualiza el historial.',
        );
      }
      movimientos.sort(
        (a, b) => ((a as Map)['secuencia'] as int).compareTo(
          (b as Map)['secuencia'] as int,
        ),
      );
      setState(() => _datos = {...siguiente, 'movimientos': movimientos});
    } catch (e) {
      if (mounted && revision == _revision) {
        if (e is FirebaseFunctionsException &&
            ['permission-denied', 'unauthenticated'].contains(e.code)) {
          _invalidar();
        } else {
          setState(() => _error = _mensajeError(e));
        }
      }
    } finally {
      if (mounted && revision == _revision) {
        setState(() => _cargandoHistorial = false);
      }
    }
  }

  List<Map<String, dynamic>> _lista(String campo) =>
      ((_datos?[campo] as List?) ?? [])
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList();
  Map<String, dynamic> get _contexto =>
      Map<String, dynamic>.from(_datos!['contexto'] as Map);

  String _mensajeError(Object error) {
    if (error is FirebaseFunctionsException) {
      switch (error.code) {
        case 'permission-denied':
        case 'unauthenticated':
          return 'No tienes acceso a Finanzas. Actualiza o inicia sesión nuevamente.';
        case 'deadline-exceeded':
        case 'unavailable':
        case 'internal':
          return 'No se pudo confirmar la respuesta. Actualiza la consulta. Si hay una solicitud pendiente, recupera la misma solicitud.';
        case 'failed-precondition':
          if (error.message == 'SALDO_INSUFICIENTE') {
            return 'La cuenta no tiene saldo suficiente. Conserva la solicitud pendiente para revisar su resultado.';
          }
          return 'No se pudo completar la operación. Revisa los datos y conserva cualquier solicitud pendiente.';
      }
    }
    return error.toString();
  }

  Future<void> _accion(Future<void> Function() fn) async {
    if (_cargando) {
      return;
    }
    setState(() {
      _cargando = true;
      _error = null;
    });
    try {
      await fn();
    } catch (e) {
      if (mounted) {
        setState(() => _error = _mensajeError(e));
      }
    } finally {
      if (mounted) {
        final error = _error;
        await _cargar();
        if (mounted && error != null) {
          setState(() => _error = error);
        }
      }
    }
  }

  String _hoy() {
    final n = DateTime.now();
    final mes = _datos?['periodoId'] as String?;
    final actual = '${n.year}-${n.month.toString().padLeft(2, '0')}';
    if (mes != null && mes != actual) return '$mes-01';
    return '${n.year}-${n.month.toString().padLeft(2, '0')}-${n.day.toString().padLeft(2, '0')}';
  }

  Future<void> _formulario(String operacion, {String? originalId}) async {
    final cuentas = _lista('cuentas')
        .where((c) => c['estado'] == 'activa')
        .toList();
    final categorias = _lista('categorias')
        .where((c) => c['estado'] == 'activa' && c['naturaleza'] == operacion)
        .toList();
    final catalogo =
        operacion == 'crearCuenta' || operacion == 'crearCategoria';
    final reversion = operacion == 'reversion';
    if (!catalogo && !reversion && cuentas.isEmpty) {
      setState(() => _error = 'Crea una cuenta primero.');
      return;
    }
    if ((operacion == 'ingreso' || operacion == 'gasto') &&
        categorias.isEmpty) {
      setState(
        () =>
            _error = 'El administrador debe crear una categoría de $operacion.',
      );
      return;
    }
    final controles = <String, TextEditingController>{
      for (final k in [
        'codigo',
        'nombre',
        'monto',
        'fecha',
        'motivo',
        'referencia',
      ])
        k: TextEditingController(text: k == 'fecha' ? _hoy() : ''),
    };
    String? cuenta = cuentas.firstOrNull?['id'] as String?;
    String? destino = cuentas.length > 1 ? cuentas[1]['id'] as String : cuenta;
    String? categoria = categorias.firstOrNull?['id'] as String?;
    var tipo = 'caja';
    var naturaleza = 'ingreso';
    var tipoIngreso = 'diezmos';
    final form = GlobalKey<FormState>();
    final rutaFormulario = DialogRoute<Map<String, dynamic>>(
      context: context,
      themes: InheritedTheme.capture(
        from: context,
        to: Navigator.of(context, rootNavigator: true).context,
      ),
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, change) {
          Widget texto(
            String key,
            String label, {
            bool numero = false,
          }) => Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: TextFormField(
              controller: controles[key],
              decoration: InputDecoration(
                labelText: label,
                helperText: key == 'fecha' ? 'Formato: AAAA-MM-DD' : null,
                errorMaxLines: 3,
              ),
              keyboardType: numero
                  ? const TextInputType.numberWithOptions(signed: true)
                  : TextInputType.text,
              validator: (v) {
                if (v == null || v.trim().isEmpty) {
                  return 'Campo requerido';
                }
                if (numero &&
                    (int.tryParse(v) == null ||
                        int.parse(v).abs() > 9007199254740991 ||
                        (operacion == 'ajuste'
                            ? int.parse(v) == 0
                            : int.parse(v) <= 0))) {
                  return 'Ingresa pesos enteros válidos';
                }
                if (key == 'codigo' &&
                    !RegExp(r'^[A-Z][A-Z0-9_]{0,31}$').hasMatch(v)) {
                  return 'Usa mayúsculas, números o guion bajo';
                }
                if (key == 'fecha') {
                  final date = DateTime.tryParse(v);
                  if (date == null ||
                      date.toIso8601String().substring(0, 10) != v ||
                      !v.startsWith('${_datos!['periodoId']}-')) {
                    return 'Fecha del período abierto: ${_datos!['periodoId']}';
                  }
                }
                return null;
              },
            ),
          );
          Widget opciones(
            String label,
            String? value,
            List<Map<String, dynamic>> opciones,
            ValueChanged<String?> onChanged,
          ) => DropdownButtonFormField<String>(
            initialValue: value,
            isExpanded: true,
            decoration: InputDecoration(labelText: label),
            items: opciones
                .map(
                  (c) => DropdownMenuItem(
                    value: c['id'] as String,
                    child: Text(c['nombre'] as String),
                  ),
                )
                .toList(),
            onChanged: onChanged,
          );
          return AlertDialog(
            title: Text(_titulos[operacion] ?? operacion),
            content: SizedBox(
              width: 420,
              child: SingleChildScrollView(
                child: Form(
                  key: form,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (catalogo) ...[
                        texto('codigo', 'Código'),
                        texto('nombre', 'Nombre'),
                      ],
                      if (operacion == 'crearCuenta')
                        opciones('Tipo', tipo, [
                          {'id': 'caja', 'nombre': 'Caja'},
                          {'id': 'banco', 'nombre': 'Banco'},
                        ], (v) => change(() => tipo = v!)),
                      if (operacion == 'crearCategoria') ...[
                        opciones('Naturaleza', naturaleza, [
                          {'id': 'ingreso', 'nombre': 'Ingreso'},
                          {'id': 'gasto', 'nombre': 'Gasto'},
                        ], (v) => change(() => naturaleza = v!)),
                        if (naturaleza == 'ingreso')
                          opciones('Tipo de ingreso', tipoIngreso, [
                            for (final t in [
                              'diezmos',
                              'ofrendas',
                              'donaciones',
                              'otros',
                            ])
                              {'id': t, 'nombre': t},
                          ], (v) => change(() => tipoIngreso = v!)),
                      ],
                      if (!catalogo && !reversion)
                        opciones(
                          operacion == 'transferencia' ? 'Origen' : 'Cuenta',
                          cuenta,
                          cuentas,
                          (v) => cuenta = v,
                        ),
                      if (operacion == 'transferencia')
                        opciones(
                          'Destino',
                          destino,
                          cuentas,
                          (v) => destino = v,
                        ),
                      if (operacion == 'ingreso' || operacion == 'gasto')
                        opciones(
                          'Categoría',
                          categoria,
                          categorias,
                          (v) => categoria = v,
                        ),
                      if (!catalogo && !reversion)
                        texto(
                          'monto',
                          operacion == 'ajuste'
                              ? 'Ajuste en CLP (+ / -)'
                              : 'Monto en CLP',
                          numero: true,
                        ),
                      if (!catalogo)
                        texto('fecha', 'Fecha contable AAAA-MM-DD'),
                      if (operacion == 'ajuste' || reversion) ...[
                        texto('motivo', 'Motivo administrativo'),
                        texto('referencia', 'Referencia de auditoría'),
                      ],
                    ],
                  ),
                ),
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(dialogContext),
                child: const Text('Cancelar'),
              ),
              FilledButton(
                onPressed: () {
                  if (_datos == null) {
                    Navigator.pop(dialogContext);
                    _invalidar();
                    return;
                  }
                  if (!form.currentState!.validate()) {
                    return;
                  }
                  if (operacion == 'transferencia' && cuenta == destino) {
                    return;
                  }
                  final campos = <String, dynamic>{};
                  if (operacion == 'crearCuenta') {
                    campos['cuenta'] = {
                      'codigo': controles['codigo']!.text.trim(),
                      'nombre': controles['nombre']!.text.trim(),
                      'tipo': tipo,
                    };
                  } else if (operacion == 'crearCategoria') {
                    campos['categoria'] = {
                      'codigo': controles['codigo']!.text.trim(),
                      'nombre': controles['nombre']!.text.trim(),
                      'naturaleza': naturaleza,
                      'tipoIngreso': naturaleza == 'ingreso'
                          ? tipoIngreso
                          : null,
                    };
                  } else {
                    campos['fechaContable'] = controles['fecha']!.text.trim();
                    if (reversion) {
                      campos['originalId'] = originalId;
                    } else {
                      if (operacion == 'transferencia') {
                        campos['origenId'] = cuenta;
                        campos['destinoId'] = destino;
                      } else {
                        campos['cuentaId'] = cuenta;
                      }
                      campos[operacion == 'ajuste'
                          ? 'deltaMinor'
                          : 'montoMinor'] = int.parse(
                        controles['monto']!.text,
                      );
                      if (operacion == 'ingreso' || operacion == 'gasto') {
                        campos['categoriaId'] = categoria;
                      }
                    }
                    if (operacion == 'ajuste' || reversion) {
                      campos['motivo'] = controles['motivo']!.text.trim();
                      campos['referenciaAuditoria'] = controles['referencia']!
                          .text
                          .trim();
                    }
                  }
                  Navigator.pop(dialogContext, campos);
                },
                child: const Text('Confirmar'),
              ),
            ],
          );
        },
      ),
    );
    final resultado = await Navigator.of(
      context,
      rootNavigator: true,
    ).push(rutaFormulario);
    // El resultado llega al hacer pop; la ruta puede seguir usando los campos
    // durante su animación de salida, especialmente si se demora un cuadro.
    await rutaFormulario.completed;
    for (final controller in controles.values) {
      controller.dispose();
    }
    if (resultado != null && mounted) {
      if (_datos == null) {
        _invalidar();
        return;
      }
      await _accion(() async {
        await _servicio.enviar(_contexto, operacion, resultado);
      });
    }
  }

  static const _titulos = {
    'crearCuenta': 'Nueva cuenta',
    'crearCategoria': 'Nueva categoría',
    'apertura': 'Saldo inicial',
    'ingreso': 'Nuevo ingreso',
    'gasto': 'Nuevo gasto',
    'transferencia': 'Transferencia',
    'ajuste': 'Ajuste',
    'reversion': 'Reversión',
  };

  Widget _boton(String op, String permiso) => Padding(
    padding: const EdgeInsets.only(right: 8, bottom: 8),
    child: FilledButton.tonal(
      onPressed:
          !_permiso(permiso) ||
              _cargando ||
              _pendiente ||
              _datos?['protocolo'] != 'operativo_v1'
          ? null
          : () => _formulario(op),
      child: Text(_titulos[op]!),
    ),
  );

  @override
  Widget build(BuildContext context) {
    final d = _datos;
    return Scaffold(
      appBar: AppBar(
        title: const Text(finanzasEmuladores ? 'Finanzas · demo' : 'Finanzas'),
        actions: [
          IconButton(
            tooltip: 'Actualizar',
            onPressed: _cargando ? null : _cargar,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: _cargando
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(20),
              children: [
                if (_error != null)
                  SelectableText(
                    _error!,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                    ),
                  ),
                if (_pendiente)
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Solicitud pendiente de confirmación'),
                          Text(_mensajePendiente),
                          Wrap(
                            spacing: 8,
                            children: [
                              TextButton(
                                onPressed: () => _accion(() async {
                                  await _servicio.recuperar();
                                }),
                                child: const Text('Recuperar'),
                              ),
                              TextButton(
                                onPressed: _descartarPendiente,
                                child: const Text(
                                  'Descartar pendiente para crear otra',
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                if (d != null) ...[
                  if (finanzasEmuladores)
                    const Text(
                      'Entorno local demo-fesync · CLP · sin datos de producción',
                    ),
                  if (d['configurada'] != true) ...[
                    const Text(
                      'Configuración inicial: CLP, pesos enteros, America/Santiago.',
                    ),
                    const Text(
                      'La preparación financiera requiere un operador autorizado.',
                    ),
                  ] else ...[
                    Text(
                      'Período abierto: ${d['periodoId']} · ${d['protocolo']}',
                    ),
                    LayoutBuilder(
                      builder: (context, constraints) {
                        const paginas = [
                          'Resumen',
                          'Cuentas',
                          'Categorías',
                          'Historial',
                        ];
                        if (constraints.maxWidth < 480) {
                          return Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              for (var i = 0; i < paginas.length; i++)
                                ChoiceChip(
                                  label: Text(paginas[i]),
                                  selected: _pagina == i,
                                  onSelected: (_) =>
                                      setState(() => _pagina = i),
                                ),
                            ],
                          );
                        }
                        return SegmentedButton<int>(
                          segments: [
                            for (var i = 0; i < paginas.length; i++)
                              ButtonSegment(value: i, label: Text(paginas[i])),
                          ],
                          selected: {_pagina},
                          onSelectionChanged: (v) =>
                              setState(() => _pagina = v.first),
                        );
                      },
                    ),
                    const SizedBox(height: 16),
                    if (_pagina == 0) ...[
                      Text(
                        'Saldo total: CLP ${d['saldoTotalMinor']}',
                        style: Theme.of(context).textTheme.headlineSmall,
                      ),
                      Text(
                        'Ingresos del mes: CLP ${(d['resumen'] as Map)['ingresosNetosMinor']}',
                      ),
                      Text(
                        'Gastos del mes: CLP ${(d['resumen'] as Map)['gastosNetosMinor']}',
                      ),
                      Wrap(
                        children: [
                          _boton('ingreso', 'registrarIngresosGastos'),
                          _boton('gasto', 'registrarIngresosGastos'),
                          _boton('transferencia', 'transferir'),
                          _boton('ajuste', 'registrarAjustes'),
                        ],
                      ),
                    ],
                    if (_pagina == 1) ...[
                      Wrap(
                        children: [
                          _boton('crearCuenta', 'administrarCatalogos'),
                          _boton('apertura', 'registrarAjustes'),
                        ],
                      ),
                      for (final c in _lista('cuentas'))
                        Card(
                          child: ListTile(
                            title: Text('${c['nombre']} (${c['tipo']})'),
                            subtitle: Text(c['codigo'] as String),
                            trailing: Text(
                              'CLP ${(d['saldos'] as Map)[c['id']] ?? 0}',
                            ),
                          ),
                        ),
                    ],
                    if (_pagina == 2) ...[
                      _boton('crearCategoria', 'administrarCatalogos'),
                      for (final c in _lista('categorias'))
                        ListTile(
                          title: Text(c['nombre'] as String),
                          subtitle: Text(
                            '${c['naturaleza']} · ${c['tipoIngreso'] ?? c['codigo']}',
                          ),
                        ),
                    ],
                    if (_pagina == 3) ...[
                      if (d['historial'] is Map)
                        Text(
                          'Historial hasta #${(d['historial'] as Map)['corte']}',
                        ),
                      if (_lista('movimientos').isEmpty)
                        const Text('Aún no hay movimientos.'),
                      for (final m in _lista('movimientos').reversed)
                        Card(
                          child: ListTile(
                            title: Text(
                              '#${m['secuencia']} ${m['clase']}${m['reversaDe'] != null ? ' · reversión' : ''}',
                            ),
                            subtitle: Text(m['fechaContable'] as String),
                            onTap: () => showDialog<void>(
                              context: context,
                              builder: (c) => AlertDialog(
                                title: Text('Movimiento #${m['secuencia']}'),
                                content: SingleChildScrollView(
                                  child: Column(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      SelectableText(
                                        'ID: ${m['id']}\nFecha: ${m['fechaContable']}\nClase: ${m['clase']}\n${m['descripcion'] ?? ''}',
                                      ),
                                      for (final a in m['asientos'] as List)
                                        Text(
                                          '${a['cuentaId']}: CLP ${a['deltaMinor']}',
                                        ),
                                    ],
                                  ),
                                ),
                                actions: [
                                  TextButton(
                                    onPressed: () => Navigator.pop(c),
                                    child: const Text('Cerrar'),
                                  ),
                                  if (_permiso('anularMovimientos') &&
                                      m['reversaDe'] == null &&
                                      !_pendiente &&
                                      d['protocolo'] == 'operativo_v1')
                                    TextButton(
                                      onPressed: () {
                                        Navigator.pop(c);
                                        _formulario(
                                          'reversion',
                                          originalId: m['id'] as String,
                                        );
                                      },
                                      child: const Text('Revertir'),
                                    ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      if ((d['historial'] as Map?)?['hayMas'] == true)
                        TextButton(
                          onPressed: _cargandoHistorial
                              ? null
                              : _cargarMasHistorial,
                          child: Text(
                            _cargandoHistorial
                                ? 'Cargando historial…'
                                : 'Cargar más movimientos',
                          ),
                        ),
                    ],
                  ],
                ],
              ],
            ),
    );
  }
}

/// Descubrimiento validado por servidor; no usa un rol suministrado por UI.
class AccesoFinanzasMvp extends StatefulWidget {
  const AccesoFinanzasMvp({super.key});
  @override
  State<AccesoFinanzasMvp> createState() => _AccesoFinanzasMvpState();
}

class _AccesoFinanzasMvpState extends State<AccesoFinanzasMvp> {
  late Future<Map<String, dynamic>> _consulta = _consultar();
  StreamSubscription<DocumentSnapshot<Map<String, dynamic>>>? _acceso;
  bool _sinAcceso = false;

  void _ocultar() {
    if (mounted && !_sinAcceso) {
      setState(() => _sinAcceso = true);
    }
  }

  Future<Map<String, dynamic>> _consultar() async {
    final datos = await FinanzasMvpService().consultar();
    if (mounted) {
      _sinAcceso = false;
      if (_acceso == null) {
        final iglesiaId = (datos['contexto'] as Map)['iglesiaId'];
        final uid = FirebaseAuth.instance.currentUser?.uid;
        final titular =
            (datos['permisos'] as Map)['administrarConfiguracion'] == true;
        _acceso = FirebaseFirestore.instance
            .doc('iglesias/$iglesiaId/finanzas_config/acceso')
            .snapshots()
            .listen((snapshot) {
              if (snapshot.metadata.isFromCache ||
                  snapshot.metadata.hasPendingWrites) {
                return;
              }
              final acceso = snapshot.data();
              if (acceso?['moduloHabilitado'] != true ||
                  (!titular && acceso?['encargadoUid'] != uid)) {
                _ocultar();
              }
            }, onError: (Object _) => _ocultar());
      }
    }
    return datos;
  }

  @override
  void dispose() {
    _acceso?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<Map<String, dynamic>>(
    future: _consulta,
    builder: (context, snapshot) =>
        !_sinAcceso &&
            snapshot.connectionState == ConnectionState.done &&
            snapshot.hasData
        ? Card(
            child: ListTile(
              leading: const Icon(Icons.account_balance_wallet),
              title: const Text('Finanzas'),
              subtitle: const Text('Cuentas, ingresos, gastos e historial'),
              onTap: () async {
                await Navigator.push(
                  context,
                  MaterialPageRoute<void>(
                    builder: (_) => FinanzasMvpScreen(
                      key: ValueKey(FirebaseAuth.instance.currentUser?.uid),
                    ),
                  ),
                );
                if (mounted) {
                  setState(() {
                    _consulta = _consultar();
                  });
                }
              },
            ),
          )
        : const SizedBox.shrink(),
  );
}
