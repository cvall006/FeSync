import 'package:flutter/material.dart';

import '../../core/models/app_models.dart';
import 'adora_agenda_screen.dart';
import 'adora_inicio_screen.dart';
import 'adora_repertorio_screen.dart';

class AdoraLiveScreen extends StatefulWidget {
  final UsuarioModel usuario;

  const AdoraLiveScreen({super.key, required this.usuario});

  @override
  State<AdoraLiveScreen> createState() => _AdoraLiveScreenState();
}

class _AdoraLiveScreenState extends State<AdoraLiveScreen> {
  int _indiceActual = 0;

  late final List<Widget> _pantallas;

  @override
  void initState() {
    super.initState();

    _pantallas = [
      AdoraInicioScreen(usuario: widget.usuario),
      AdoraAgendaScreen(usuario: widget.usuario),
      AdoraRepertorioScreen(usuario: widget.usuario),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.music_note, color: Color(0xFF8B5CF6)),
            SizedBox(width: 8),
            Text('Adora Live', style: TextStyle(fontWeight: FontWeight.bold)),
          ],
        ),
      ),
      body: SafeArea(
        top: false,
        child: IndexedStack(index: _indiceActual, children: _pantallas),
      ),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _indiceActual,
        onTap: (index) {
          setState(() {
            _indiceActual = index;
          });
        },
        backgroundColor: theme.colorScheme.surface,
        selectedItemColor: const Color(0xFF8B5CF6),
        unselectedItemColor: theme.colorScheme.onSurfaceVariant,
        type: BottomNavigationBarType.fixed,
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.home), label: 'Inicio'),
          BottomNavigationBarItem(
            icon: Icon(Icons.calendar_month),
            label: 'Agenda',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.library_music),
            label: 'Repertorio',
          ),
        ],
      ),
    );
  }
}
