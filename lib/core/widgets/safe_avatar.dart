import 'package:flutter/material.dart';

class SafeAvatar extends StatelessWidget {
  final String? imageUrl;
  final String nombre;
  final double radius;
  final Color? backgroundColor;

  const SafeAvatar({
    super.key,
    required this.nombre,
    this.imageUrl,
    this.radius = 22,
    this.backgroundColor,
  });

  String get _inicial {
    final limpio = nombre.trim();

    if (limpio.isEmpty) {
      return '?';
    }

    return limpio.substring(0, 1).toUpperCase();
  }

  bool _esFotoGoogle(String url) {
    final lower = url.toLowerCase();

    return lower.contains('googleusercontent.com') ||
        lower.contains('ggpht.com');
  }

  @override
  Widget build(BuildContext context) {
    final url = imageUrl?.trim() ?? '';

    final fondo =
        backgroundColor ??
        Theme.of(context).colorScheme.surfaceContainerHighest;

    final texto = Theme.of(context).colorScheme.onSurface;

    Widget fallback() {
      return Container(
        color: fondo,
        alignment: Alignment.center,
        child: Text(
          _inicial,
          style: TextStyle(
            color: texto,
            fontWeight: FontWeight.bold,
            fontSize: radius * 0.85,
          ),
        ),
      );
    }

    final usarImagenRemota = url.isNotEmpty && !_esFotoGoogle(url);

    return ClipOval(
      child: SizedBox(
        width: radius * 2,
        height: radius * 2,
        child: !usarImagenRemota
            ? fallback()
            : Image.network(
                url,
                fit: BoxFit.cover,
                errorBuilder: (context, error, stackTrace) {
                  return fallback();
                },
              ),
      ),
    );
  }
}
