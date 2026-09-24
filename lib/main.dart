import 'package:flutter/material.dart';

import 'screens/home_screen.dart';

void main() {
  runApp(const FeSyncApp());
}

class FeSyncApp extends StatelessWidget {
  const FeSyncApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'FeSync',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: Colors.blue,
        ),
        useMaterial3: true,
      ),
      home: const HomeScreen(),
    );
  }
}