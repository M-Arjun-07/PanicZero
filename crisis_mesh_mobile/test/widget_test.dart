// This is a basic Flutter widget test.
//
// To perform an interaction with a widget in your test, use the WidgetTester
// utility in the flutter_test package. For example, you can send tap and scroll
// gestures. You can also use WidgetTester to find child widgets in the widget
// tree, read text, and verify that the values of widget properties are correct.

import 'package:flutter_test/flutter_test.dart';

import 'package:crisis_mesh_mobile/main.dart';

void main() {
  testWidgets('App UI smoke test', (WidgetTester tester) async {
    // Build our app and trigger a frame.
    await tester.pumpWidget(const CrisisMeshApp());

    // Verify that the AppBar title exists.
    expect(find.text('Welcome to Grand Resort'), findsOneWidget);

    // Verify that the SOS button exists.
    expect(find.text('Order Room Service'), findsOneWidget);
  });
}
