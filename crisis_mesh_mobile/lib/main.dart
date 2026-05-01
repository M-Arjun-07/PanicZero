import 'package:http/http.dart' as http;
import 'dart:convert';
import 'dart:developer' as developer;
import 'package:flutter/material.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:sensors_plus/sensors_plus.dart';
import 'package:vibration/vibration.dart';
import 'dart:async';
import 'dart:math';
import 'services/alert_service.dart';
import 'services/haptic_service.dart';
import 'services/mesh_network_service.dart';
import 'services/heartbeat_service.dart';
import 'staff_screen.dart';

final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp();
  await MeshNetworkService.instance.initialize();
  HeartbeatService.instance.initialize();
  runApp(const CrisisMeshApp());
}

class CrisisMeshApp extends StatelessWidget {
  const CrisisMeshApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      navigatorKey: navigatorKey,
      title: 'Hotel Guest App',
      theme: ThemeData(primarySwatch: Colors.blue),
      home: const RoleSelectorScreen(),
      debugShowCheckedModeBanner: false,
    );
  }
}

class GuestScreen extends StatefulWidget {
  const GuestScreen({super.key});

  @override
  State<GuestScreen> createState() => _GuestScreenState();
}

class _GuestScreenState extends State<GuestScreen> {
  // Shake Detection Variables
  static const double shakeThresholdGravity = 2.7;
  StreamSubscription<AccelerometerEvent>? _accelerometerSubscription;
  DateTime? _lastShakeTime;

  // Heartbeat Variables
  bool _isConnectedToServer = false;
  Timer? _heartbeatTimer;
  final String _healthEndpoint = 'http://192.168.137.135:8000/api/health';

  @override
  void initState() {
    super.initState();
    _startShakeDetection();

    // Initialize the real-time FCM Alert Service
    AlertService.instance.initialize(navigatorKey);

    // Start Heartbeat Check
    _startHeartbeat();
  }

  void _startHeartbeat() {
    _heartbeatTimer = Timer.periodic(const Duration(seconds: 5), (_) async {
      await _checkServerHealth();
    });
    _checkServerHealth();
  }

  Future<void> _checkServerHealth() async {
    try {
      final response = await http
          .get(Uri.parse(_healthEndpoint))
          .timeout(const Duration(seconds: 3));

      if (response.statusCode == 200) {
        if (!_isConnectedToServer) {
          setState(() {
            _isConnectedToServer = true;
          });
        }
      } else {
        if (_isConnectedToServer) {
          setState(() {
            _isConnectedToServer = false;
          });
        }
      }
    } catch (e) {
      if (_isConnectedToServer) {
        setState(() {
          _isConnectedToServer = false;
        });
      }
    }
  }

  @override
  void dispose() {
    _accelerometerSubscription?.cancel();
    _heartbeatTimer?.cancel();
    super.dispose();
  }

  // 1. Shake Detection Logic -> Silent SOS
  void _startShakeDetection() {
    _accelerometerSubscription = accelerometerEventStream().listen((
      AccelerometerEvent event,
    ) {
      double gX = event.x / 9.80665;
      double gY = event.y / 9.80665;
      double gZ = event.z / 9.80665;

      // Calculate g-force
      double gForce = sqrt(gX * gX + gY * gY + gZ * gZ);

      if (gForce > shakeThresholdGravity) {
        final now = DateTime.now();
        if (_lastShakeTime == null ||
            now.difference(_lastShakeTime!) > const Duration(seconds: 2)) {
          _lastShakeTime = now;
          _triggerSOS("Silent Shake Detected!");
        }
      }
    });
  }

  void _triggerSOS(String source) async {
    // Trigger SOS haptic feedback
    HapticService.instance.triggerHapticPattern('sos');

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('🚨 SOS TRIGGERED via $source 🚨'),
        backgroundColor: Colors.red,
        duration: const Duration(seconds: 3),
      ),
    );

    // Orchestration: Sending data to Person 3's backend [cite: 156, 253]
    final crisisPayload = {
      "source": "Guest Mobile App",
      "location": "Lobby", // Defaulting to Lobby for demo purposes
      "severity": 5, // Default severity
      "description": "SOS Trigger: $source.",
      "metadata": {"trigger_type": source},
    };

    try {
      final response = await http.post(
        // Note: For physical devices, use Person 3's Wi-Fi IPv4 Address
        Uri.parse('http://192.168.137.135:8000/api/crisis/detect'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode(crisisPayload),
      );

      // Using developer.log instead of print [cite: 208]
      developer.log(
        'SOS sent successfully. Status: ${response.statusCode}',
        name: 'CrisisMesh.SOS',
      );
    } catch (e) {
      developer.log(
        'Network error: Backend unreachable. Initiating Mesh Fallback.',
        error: e,
        name: 'CrisisMesh.SOS',
      );

      // Fallback: Save to SQLite and Broadcast via Google Nearby Connections
      await MeshNetworkService.instance.storePendingCrisis(crisisPayload);

      if (!mounted) return;

      var connectivityResult = await Connectivity().checkConnectivity();
      bool isOffline =
          connectivityResult.contains(ConnectivityResult.none) ||
          connectivityResult.isEmpty;
      bool hasNetwork =
          !isOffline &&
          connectivityResult.any(
            (r) =>
                r == ConnectivityResult.wifi || r == ConnectivityResult.mobile,
          );

      if (!hasNetwork) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              '⚠️ Offline: Crisis saved & broadcasting to nearby devices...',
            ),
            backgroundColor: Colors.orange,
            duration: Duration(seconds: 4),
          ),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              '⚠️ Backend unreachable. Broadcasting via mesh network...',
            ),
            backgroundColor: Colors.orange,
            duration: Duration(seconds: 4),
          ),
        );
      }
    }
  }

  // Local Mock/Simulation Function for Demo
  void _simulateIncomingAlert() async {
    // 1. Vibrate with a strong pattern to signify a high alert
    try {
      bool? hasVibrator = await Vibration.hasVibrator();
      if (hasVibrator == true) {
        // A long, strong vibration for urgency.
        await Vibration.vibrate(duration: 750);
      }
    } catch (e) {
      debugPrint("Vibration not supported on this device: $e");
    }

    // 2. Show a high-priority, bright red SnackBar
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: const Text(
          '🚨 CRISIS ALERT: Fire detected in Room 302 🚨',
          style: TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.bold,
            fontSize: 16,
          ),
        ),
        backgroundColor: Colors.red.shade800,
        duration: const Duration(seconds: 4),
        behavior: SnackBarBehavior.floating,
        margin: const EdgeInsets.all(12),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Guest Dashboard'),
        backgroundColor: Colors.indigo,
        actions: [
          // Add the real-time status indicator here
          Padding(
            padding: const EdgeInsets.only(right: 12.0),
            child: Row(
              children: [
                Container(
                  width: 12,
                  height: 12,
                  decoration: BoxDecoration(
                    color: _isConnectedToServer
                        ? Colors.greenAccent
                        : Colors.red,
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.white, width: 1.5),
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  _isConnectedToServer ? 'ONLINE' : 'OFFLINE',
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
      // Floating Action Button to trigger the local simulation
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _simulateIncomingAlert,
        backgroundColor: Colors.red,
        icon: const Icon(Icons.crisis_alert, color: Colors.white),
        label: const Text(
          'SIMULATE ALERT',
          style: TextStyle(color: Colors.white),
        ),
        tooltip: 'Simulate Crisis Alert',
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // 2. The Masked Long-Press Button
            GestureDetector(
              onLongPress: () => _triggerSOS("Masked Button Long-Press"),
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 40),
                decoration: BoxDecoration(
                  color: Colors.amber.shade100,
                  borderRadius: BorderRadius.circular(15),
                  border: Border.all(color: Colors.amber, width: 2),
                ),
                child: const Column(
                  children: [
                    Icon(Icons.room_service, size: 50, color: Colors.orange),
                    SizedBox(height: 10),
                    Text(
                      "Order Room Service",
                      style: TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    Text(
                      "(Hold for SOS)",
                      style: TextStyle(color: Colors.grey),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class RoleSelectorScreen extends StatelessWidget {
  const RoleSelectorScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Demo Role Selector')),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                padding: const EdgeInsets.all(20),
                backgroundColor: Colors.green, // Changed to Green
                foregroundColor: Colors.white, // Ensures text is white
              ),
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (context) => const GuestScreen()),
              ),
              child: const Text(
                "Login as GUEST",
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
              ),
            ),
            const SizedBox(height: 30),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                padding: const EdgeInsets.all(20),
                backgroundColor: Colors.blue, // Changed to Blue
                foregroundColor: Colors.white, // Ensures text is white
              ),
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (context) => const StaffScreen()),
              ),
              child: const Text(
                "Login as STAFF",
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
