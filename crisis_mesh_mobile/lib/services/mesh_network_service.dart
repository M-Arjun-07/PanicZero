import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:nearby_connections/nearby_connections.dart';
import 'package:sqflite/sqflite.dart';
import 'package:path/path.dart';
import 'package:http/http.dart' as http;
import 'dart:async';
import 'package:permission_handler/permission_handler.dart';

class MeshNetworkService {
  MeshNetworkService._();
  static final MeshNetworkService instance = MeshNetworkService._();

  Database? _db;
  final Strategy _strategy =
      Strategy.P2P_STAR; // Best for many-to-many fallback
  final String _userName =
      "PanicZeroNode_${DateTime.now().millisecondsSinceEpoch.toString().substring(8)}";

  bool _isAdvertising = false;
  bool _isDiscovering = false;
  // ignore: unused_field
  StreamSubscription<List<ConnectivityResult>>? _connectivitySubscription;

  final Set<String> _connectedEndpoints = {};

  Future<void> initialize() async {
    // 1. Init SQLite DB
    _db = await _initDB();

    // 2. Ask Permissions (Needed for Nearby Connections)
    await _requestPermissions();

    // 3. Listen to network changes
    _connectivitySubscription = Connectivity().onConnectivityChanged.listen((
      List<ConnectivityResult> results,
    ) {
      bool isOffline = results.contains(ConnectivityResult.none);
      bool hasNetwork = results.any(
        (r) => r == ConnectivityResult.wifi || r == ConnectivityResult.mobile,
      );

      if (hasNetwork) {
        debugPrint(
          "🌐 MeshService: Online. Syncing and acting as Mesh Relay...",
        );
        // Do NOT stop the mesh network here so we can relay offline messages
        _syncPendingCrises();
        startMeshNetwork(); // Ensure we are listening to relay from offline devices
      } else if (isOffline || results.isEmpty) {
        debugPrint("📴 MeshService: Offline. Starting Mesh Broadcast...");
        startMeshNetwork();
      }
    });
  }

  Future<Database> _initDB() async {
    String dbPath = await getDatabasesPath();
    String path = join(dbPath, 'paniczero_crises.db');

    return await openDatabase(
      path,
      version: 1,
      onCreate: (Database db, int version) async {
        await db.execute('''
          CREATE TABLE pending_crises (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            payload TEXT,
            timestamp TEXT
          )
        ''');
      },
    );
  }

  Future<void> _requestPermissions() async {
    try {
      await [
        Permission.location,
        Permission.bluetooth,
        Permission.bluetoothAdvertise,
        Permission.bluetoothConnect,
        Permission.bluetoothScan,
        Permission.nearbyWifiDevices,
      ].request();
    } catch (e) {
      debugPrint("Error requesting permissions: $e");
    }
  }

  // ---------------- SQLite Storage ----------------

  Future<void> storePendingCrisis(Map<String, dynamic> crisisData) async {
    if (_db == null) return;

    String payload = jsonEncode(crisisData);
    await _db!.insert('pending_crises', {
      'payload': payload,
      'timestamp': DateTime.now().toIso8601String(),
    });

    debugPrint("💾 MeshService: Saved crisis locally (SQLite) for later sync.");

    // Also broadcast it immediately if we are offline to nearby devices
    _broadcastPayloadToMesh(payload);

    // If we happen to be online right now, sync immediately
    var connectivityResult = await Connectivity().checkConnectivity();
    bool hasNetwork =
        !connectivityResult.contains(ConnectivityResult.none) &&
        connectivityResult.any(
          (r) => r == ConnectivityResult.wifi || r == ConnectivityResult.mobile,
        );

    if (hasNetwork) {
      debugPrint("🌐 MeshService: We are online! Syncing immediately...");
      _syncPendingCrises();
    }
  }

  Future<void> _syncPendingCrises() async {
    if (_db == null) return;

    final List<Map<String, dynamic>> pendingCrises = await _db!.query(
      'pending_crises',
    );

    if (pendingCrises.isEmpty) return;

    debugPrint(
      "🔄 MeshService: Found ${pendingCrises.length} pending crises. Syncing...",
    );

    for (var row in pendingCrises) {
      try {
        final payload = jsonDecode(row['payload'] as String);

        final response = await http.post(
          Uri.parse('http://172.20.49.51:8000/api/crisis/detect'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode(payload),
        );

        if (response.statusCode == 200 || response.statusCode == 201) {
          // Success! Remove from DB
          await _db!.delete(
            'pending_crises',
            where: 'id = ?',
            whereArgs: [row['id']],
          );
          debugPrint(
            "✅ MeshService: Synced and removed crisis ID ${row['id']}",
          );
        }
      } catch (e) {
        debugPrint(
          "❌ MeshService: Failed to sync crisis ID ${row['id']}. Will retry later. Error: $e",
        );
      }
    }
  }

  // ---------------- Nearby Connections ----------------

  Future<void> startMeshNetwork() async {
    await _startAdvertising();
    await _startDiscovery();
  }

  Future<void> stopMeshNetwork() async {
    await Nearby().stopAdvertising();
    await Nearby().stopDiscovery();
    await Nearby().stopAllEndpoints();
    _isAdvertising = false;
    _isDiscovering = false;
    _connectedEndpoints.clear();
  }

  Future<void> _startAdvertising() async {
    if (_isAdvertising) return;
    try {
      bool a = await Nearby().startAdvertising(
        _userName,
        _strategy,
        onConnectionInitiated: _onConnectionInitiated,
        onConnectionResult: _onConnectionResult,
        onDisconnected: _onDisconnected,
      );
      _isAdvertising = a;
      debugPrint("📡 MeshService: Advertising started: $a");
    } catch (e) {
      debugPrint("MeshService Advertise Error: $e");
    }
  }

  Future<void> _startDiscovery() async {
    if (_isDiscovering) return;
    try {
      bool d = await Nearby().startDiscovery(
        _userName,
        _strategy,
        onEndpointFound: (id, name, serviceId) {
          debugPrint(
            "MeshService: Found endpoint $id ($name). Requesting connection...",
          );
          Nearby().requestConnection(
            _userName,
            id,
            onConnectionInitiated: _onConnectionInitiated,
            onConnectionResult: _onConnectionResult,
            onDisconnected: _onDisconnected,
          );
        },
        onEndpointLost: (id) {
          debugPrint("MeshService: Endpoint lost $id");
        },
      );
      _isDiscovering = d;
      debugPrint("🔍 MeshService: Discovery started: $d");
    } catch (e) {
      debugPrint("MeshService Discovery Error: $e");
    }
  }

  void _onConnectionInitiated(String endpointId, ConnectionInfo info) {
    debugPrint(
      "MeshService: Connection initiated with $endpointId (${info.endpointName}). Auto-accepting.",
    );
    Nearby().acceptConnection(
      endpointId,
      onPayLoadRecieved: (endpointId, payload) {
        if (payload.type == PayloadType.BYTES) {
          String receivedStr = String.fromCharCodes(payload.bytes!);
          debugPrint(
            "📥 MeshService: Received payload from $endpointId: $receivedStr",
          );
          _handleIncomingMeshPayload(receivedStr);
        }
      },
      onPayloadTransferUpdate: (endpointId, payloadTransferUpdate) {},
    );
  }

  void _onConnectionResult(String endpointId, Status status) {
    debugPrint("MeshService Connection result $endpointId: $status");
    if (status == Status.CONNECTED) {
      _connectedEndpoints.add(endpointId);
    } else {
      _connectedEndpoints.remove(endpointId);
    }
  }

  void _onDisconnected(String endpointId) {
    debugPrint("MeshService Disconnected $endpointId");
    _connectedEndpoints.remove(endpointId);
  }

  void _handleIncomingMeshPayload(String payloadStr) {
    try {
      // Basic check to see if it's a valid JSON crisis payload
      Map<String, dynamic> data = jsonDecode(payloadStr);
      if (data.containsKey('source') && data.containsKey('description')) {
        // Someone else's SOS. Store it locally so we can sync it when WE go online!
        storePendingCrisis(data);
      }
    } catch (e) {
      debugPrint("MeshService: Failed to parse incoming payload: $e");
    }
  }

  void _broadcastPayloadToMesh(String payload) async {
    debugPrint(
      "📤 MeshService: Attempting to broadcast to ${_connectedEndpoints.length} connected endpoints...",
    );
    for (String endpointId in _connectedEndpoints) {
      try {
        await Nearby().sendBytesPayload(
          endpointId,
          Uint8List.fromList(payload.codeUnits),
        );
      } catch (e) {
        debugPrint("MeshService: Failed to send to $endpointId: $e");
      }
    }
  }
}
