import 'package:flutter_test/flutter_test.dart';
import 'package:fesync/main.dart';

void main() {
  testWidgets('FeSync inicia correctamente', (WidgetTester tester) async {
    await tester.pumpWidget(const FeSyncApp());

    expect(find.text('FeSync'), findsWidgets);
  });
}