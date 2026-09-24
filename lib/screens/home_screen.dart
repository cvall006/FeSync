import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  Future<String> _probarFirestore() async {
    final resultado = await FirebaseFirestore.instance
        .collection('iglesias')
        .limit(1)
        .get();

    if (resultado.docs.isEmpty) {
      return 'Conexión correcta, pero no se encontraron iglesias.';
    }

    final datos = resultado.docs.first.data();
    final nombre = datos['nombre']?.toString() ?? 'Sin nombre';

    return 'Firebase conectado correctamente.\nIglesia encontrada: $nombre';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('FeSync')),
      body: Center(
        child: FutureBuilder<String>(
          future: _probarFirestore(),
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const CircularProgressIndicator();
            }

            if (snapshot.hasError) {
              return Padding(
                padding: const EdgeInsets.all(24),
                child: Text(
                  'Error al leer Firestore:\n${snapshot.error}',
                  textAlign: TextAlign.center,
                ),
              );
            }

            return Padding(
              padding: const EdgeInsets.all(24),
              child: Text(
                snapshot.data ?? 'Sin resultado',
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 20),
              ),
            );
          },
        ),
      ),
    );
  }
}
