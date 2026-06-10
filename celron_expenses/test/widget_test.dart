import 'package:flutter_test/flutter_test.dart';
import 'package:celron_expenses/main.dart';

void main() {
  testWidgets('App smoke test', (WidgetTester tester) async {
    // Build our app and trigger a frame.
    await tester.pumpWidget(const CelronExpensesApp());

    // Verify that our app renders correctly.
    expect(find.byType(CelronExpensesApp), findsOneWidget);
  });
}
