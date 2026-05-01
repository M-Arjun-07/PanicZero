import 'dart:async';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'dart:developer' as developer;

class HeartbeatService {
  // Singleton pattern
  HeartbeatService._privateConstructor();
  static final HeartbeatService instance =
      HeartbeatService._privateConstructor();

  // Use a ValueNotifier for simple state management. Widgets can listen to this.
  final ValueNotifier<bool> isConnected = ValueNotifier(false);

  Timer? _heartbeatTimer;
  // Use the same base URL as in your SOS call, pointing to the new health endpoint.
  static const String _healthCheckUrl = 'http://172.20.49.51:8000/api/health';

  void initialize() {
    // Prevent multiple timers
    if (_heartbeatTimer?.isActive ?? false) return;

    // Start a periodic timer to check the connection every 5 seconds.
    // This is a great, simple approach for a hackathon.
    _heartbeatTimer = Timer.periodic(const Duration(seconds: 5), (timer) {
      _checkConnection();
    });
    // Perform an initial check immediately
    _checkConnection();
    developer.log(
      'Heartbeat service initialized.',
      name: 'CrisisMesh.Heartbeat',
    );
  }

  Future<void> _checkConnection() async {
    try {
      // Set a reasonable timeout for the request.
      final response = await http
          .get(Uri.parse(_healthCheckUrl))
          .timeout(const Duration(seconds: 3));

      if (response.statusCode == 200) {
        if (!isConnected.value) {
          developer.log(
            'Backend is reachable. Status: ONLINE.',
            name: 'CrisisMesh.Heartbeat',
          );
          isConnected.value = true;
        }
      } else {
        if (isConnected.value) {
          developer.log(
            'Backend returned non-200 status: ${response.statusCode}. Status: OFFLINE.',
            name: 'CrisisMesh.Heartbeat',
          );
          isConnected.value = false;
        }
      }
    } catch (e) {
      if (isConnected.value) {
        developer.log(
          'Heartbeat check failed. Backend is unreachable. Status: OFFLINE.',
          error: e,
          name: 'CrisisMesh.Heartbeat',
        );
        isConnected.value = false;
      }
    }
  }

  void dispose() {
    _heartbeatTimer?.cancel();
    isConnected.value = false;
    developer.log('Heartbeat service disposed.', name: 'CrisisMesh.Heartbeat');
  }
}
