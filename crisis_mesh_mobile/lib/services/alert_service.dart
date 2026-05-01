import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
import 'dart:async';
import 'package:vibration/vibration.dart';
import 'evacuation_api_service.dart';

// Top-level function so it can handle both background and foreground haptics
Future<void> _playAutomatedHaptics(String? action) async {
  if (action == null) return;

  bool? hasVibrator = await Vibration.hasVibrator();
  if (hasVibrator != true) return;

  // Pattern format: [wait, vibrate, wait, vibrate, ...] in milliseconds
  switch (action) {
    case 'turn_left':
      // 2 short pulses
      await Vibration.vibrate(pattern: [0, 200, 200, 200]);
      break;
    case 'turn_right':
      // 3 short pulses
      await Vibration.vibrate(pattern: [0, 200, 200, 200, 200, 200]);
      break;
    case 'go_straight':
      // 1 long solid pulse
      await Vibration.vibrate(pattern: [0, 1000]);
      break;
    case 'stop_danger':
      // Rapid continuous SOS pulses
      await Vibration.vibrate(
        pattern: [
          0,
          100,
          50,
          100,
          50,
          100,
          50,
          100,
          50,
          100,
          50,
          100,
          50,
          100,
          50,
        ],
      );
      break;
  }
}

// This MUST be a top-level function to handle background tasks
@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  debugPrint("🚨 Background alert received: ${message.messageId}");
  if (message.data.containsKey('evacuation_action')) {
    await _playAutomatedHaptics(message.data['evacuation_action']);
  }
  // The OS will automatically show the system tray notification here
  // because we included the 'notification' block in the backend payload.
}

class AlertService {
  // Singleton pattern to ensure only one instance and one set of listeners.
  AlertService._privateConstructor();
  static final AlertService instance = AlertService._privateConstructor();

  final FirebaseMessaging _fcm = FirebaseMessaging.instance;
  GlobalKey<NavigatorState>? _navigatorKey;

  final _alertController = StreamController<Map<String, dynamic>>.broadcast();
  Stream<Map<String, dynamic>> get alertStream => _alertController.stream;

  Future<void> initialize(GlobalKey<NavigatorState> navigatorKey) async {
    // Prevent re-initialization
    if (_navigatorKey != null) return;

    _navigatorKey = navigatorKey;

    // 1. Request OS permissions (Crucial for iOS)
    await _fcm.requestPermission(alert: true, badge: true, sound: true);

    // 2. Register Background handler
    FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);

    // 3. Listen to Foreground messages
    FirebaseMessaging.onMessage.listen((RemoteMessage message) {
      debugPrint('🚨 Foreground alert received!');
      if (message.data.isNotEmpty) {
        _alertController.add(message.data);
        _showHighPriorityWarning(message.data);

        // Trigger automated "blind navigation" haptics
        _playAutomatedHaptics(message.data['evacuation_action']);
        
        // If it's a crisis alert, fetch the BFS evacuation route for our current location!
        // We'll mock the 'current_location' as Room 302 for the hackathon demo
        if (message.data['type'] == 'crisis_alert' || message.data.containsKey('threat_type')) {
           EvacuationApiService.instance.fetchEvacuationRoute("Room 302");
        }
      }
    });

    // 4. Retrieve FCM Token
    // You must send this token to POST /api/staff so the backend knows where to push alerts
    String? token = await _fcm.getToken();
    debugPrint("📱 DEVICE FCM TOKEN: $token");

    if (token != null) {
      try {
        await http.post(
          // Note: For physical devices, use Person 3's Wi-Fi IPv4 Address
          Uri.parse('http://172.20.49.51:8000/api/staff'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({
            "name": "Demo Staff Responder",
            "role": "Security",
            "medical_training": "Advanced",
            "current_zone": "Lobby",
            "status": "Available",
            "fcm_token": token,
          }),
        );
        debugPrint("✅ Staff FCM Token registered with backend successfully.");
      } catch (e) {
        debugPrint("❌ Failed to register FCM token with backend: $e");
      }
    }
  }

  void _showHighPriorityWarning(Map<String, dynamic> data) {
    // Use the navigatorKey's context to show the dialog over any screen.
    if (_navigatorKey?.currentContext != null) {
      showDialog(
        context: _navigatorKey!.currentContext!,
        barrierDismissible: false,
        builder: (context) => AlertDialog(
          title: Text(
            '🚨 ${data['threat_type'] ?? 'CRISIS'} ALERT 🚨',
            style: const TextStyle(
              color: Colors.red,
              fontWeight: FontWeight.bold,
              fontSize: 24,
            ),
          ),
          content: Text(
            '${data['description'] ?? 'Emergency detected'}\n\nLocation: ${data['location'] ?? 'Unknown'}\nSeverity: ${data['severity'] ?? 'High'}',
          ),
          actions: [
            ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
              onPressed: () => Navigator.of(context).pop(),
              child: const Text(
                'ACKNOWLEDGE',
                style: TextStyle(color: Colors.white),
              ),
            ),
          ],
        ),
      );
    }
  }
}
