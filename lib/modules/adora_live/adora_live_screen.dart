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
    return Scaffold(
      backgroundColor: const Color(0xFF0F1115),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1A1D24),
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
        backgroundColor: const Color(0xFF1A1D24),
        selectedItemColor: const Color(0xFF8B5CF6),
        unselectedItemColor: const Color(0xFF94A3B8),
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
