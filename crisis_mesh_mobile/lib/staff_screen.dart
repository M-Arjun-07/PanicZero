import 'package:flutter/material.dart';
import 'dart:async';
import 'services/alert_service.dart';
import 'services/haptic_service.dart';
import 'services/heartbeat_service.dart';
import 'main.dart'; // To get the navigatorKey

class StaffScreen extends StatefulWidget {
  const StaffScreen({super.key});

  @override
  State<StaffScreen> createState() => _StaffScreenState();
}

class _StaffScreenState extends State<StaffScreen> {
  // Mock task list
  List<Map<String, dynamic>> activeTasks = [
    {
      "id": "T-101",
      "type": "Fire Outbreak",
      "location": "Room 302, 3rd Floor",
      "resolved": false,
    },
    {
      "id": "T-102",
      "type": "Medical Emergency",
      "location": "Lobby Restroom",
      "resolved": false,
    },
  ];

  StreamSubscription<Map<String, dynamic>>? _alertSubscription;

  @override
  void initState() {
    super.initState();
    // Ensure staff also listen for alerts upon login.
    AlertService.instance.initialize(navigatorKey);

    // Subscribe to incoming FCM alerts from backend
    _alertSubscription = AlertService.instance.alertStream.listen((data) {
      if (!mounted) return;

      // Haptic alert for incoming task
      HapticService.instance.triggerHapticPattern('danger');

      setState(() {
        activeTasks.insert(0, {
          "id":
              data['id'] ??
              "T-${DateTime.now().millisecondsSinceEpoch.toString().substring(8)}",
          "type": data['threat_type'] ?? data['type'] ?? "Emergency Alert",
          "location": data['location'] ?? "Unknown Location",
          "resolved": false,
        });
      });
    });
  }

  @override
  void dispose() {
    _alertSubscription?.cancel();
    super.dispose();
  }

  void _markResolved(int index) {
    setState(() {
      activeTasks[index]["resolved"] = true;
    });

    // Success haptic feedback
    HapticService.instance.triggerHapticPattern('success');

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('✅ Task marked as resolved. Updating War Room...'),
        backgroundColor: Colors.green,
      ),
    );
  }

  void _simulateIncomingTask() {
    // Haptic alert for incoming task
    HapticService.instance.triggerHapticPattern('danger');

    setState(() {
      activeTasks.insert(0, {
        "id":
            "T-SIM-${DateTime.now().millisecondsSinceEpoch.toString().substring(10)}",
        "type": "Intruder Detected",
        "location": "Pool Area",
        "resolved": false,
      });
    });

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('🚨 New emergency task assigned!'),
        backgroundColor: Colors.red,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Staff Dashboard'),
        backgroundColor: Colors.redAccent,
        actions: [
          // Add the real-time status indicator here for consistency
          ValueListenableBuilder<bool>(
            valueListenable: HeartbeatService.instance.isConnected,
            builder: (context, isConnected, child) {
              return Padding(
                padding: const EdgeInsets.only(right: 8.0),
                child: Row(
                  children: [
                    Container(
                      width: 12,
                      height: 12,
                      decoration: BoxDecoration(
                        color: isConnected ? Colors.greenAccent : Colors.red,
                        shape: BoxShape.circle,
                        border: Border.all(color: Colors.white, width: 1.5),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      isConnected ? 'ONLINE' : 'OFFLINE',
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
          // The original action button
          IconButton(
            icon: const Icon(Icons.add_alert),
            tooltip: 'Simulate Task',
            onPressed: _simulateIncomingTask,
          ),
        ],
      ),
      body: Column(
        children: [
          // Static Map Placeholder with InteractiveViewer
          Container(
            height: 250,
            width: double.infinity,
            decoration: BoxDecoration(
              color: Colors.grey.shade200,
              border: Border(
                bottom: BorderSide(color: Colors.grey.shade400, width: 2),
              ),
            ),
            child: Stack(
              children: [
                InteractiveViewer(
                  panEnabled: true,
                  scaleEnabled: true,
                  minScale: 0.5,
                  maxScale: 3.0,
                  child: Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          Icons.map_outlined,
                          size: 80,
                          color: Colors.blueGrey.shade300,
                        ),
                        const SizedBox(height: 10),
                        Text(
                          "Resort Floor Plan\n(Pinch to zoom, drag to pan)",
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            color: Colors.blueGrey.shade600,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        // Simulated room blocks to make it look like a floor plan
                        const SizedBox(height: 20),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            _buildMapRoom(
                              "Room 302",
                              Colors.red.shade200,
                            ), // Fire outbreak mock
                            const SizedBox(width: 5),
                            _buildMapRoom(
                              "Lobby",
                              Colors.orange.shade200,
                            ), // Medical emergency mock
                            const SizedBox(width: 5),
                            _buildMapRoom("Pool", Colors.blue.shade100),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
                Positioned(
                  top: 8,
                  right: 8,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.black54,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Text(
                      "LIVE MAP",
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const Padding(
            padding: EdgeInsets.all(12.0),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(
                "Active Emergency Tasks",
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
              ),
            ),
          ),
          Expanded(
            child: activeTasks.where((t) => !t["resolved"]).isEmpty
                ? const Center(
                    child: Text(
                      "No active emergencies. Great job!",
                      style: TextStyle(color: Colors.green, fontSize: 16),
                    ),
                  )
                : ListView.builder(
                    itemCount: activeTasks.length,
                    itemBuilder: (context, index) {
                      final task = activeTasks[index];
                      if (task["resolved"]) {
                        return const SizedBox.shrink(); // Hide resolved tasks
                      }

                      return Card(
                        margin: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 6,
                        ),
                        elevation: 3,
                        shape: RoundedRectangleBorder(
                          side: BorderSide(
                            color: Colors.red.shade200,
                            width: 1,
                          ),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: ListTile(
                          contentPadding: const EdgeInsets.all(12),
                          leading: const CircleAvatar(
                            backgroundColor: Colors.red,
                            radius: 25,
                            child: Icon(
                              Icons.warning_amber_rounded,
                              color: Colors.white,
                              size: 30,
                            ),
                          ),
                          title: Text(
                            task["type"],
                            style: const TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 18,
                            ),
                          ),
                          subtitle: Padding(
                            padding: const EdgeInsets.only(top: 8.0),
                            child: Row(
                              children: [
                                const Icon(
                                  Icons.location_on,
                                  size: 16,
                                  color: Colors.grey,
                                ),
                                const SizedBox(width: 4),
                                Expanded(
                                  child: Text(
                                    task['location'],
                                    style: const TextStyle(fontSize: 14),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          trailing: ElevatedButton.icon(
                            style: ElevatedButton.styleFrom(
                              backgroundColor: Colors.green,
                              foregroundColor: Colors.white,
                              elevation: 0,
                            ),
                            onPressed: () => _markResolved(index),
                            icon: const Icon(
                              Icons.check_circle_outline,
                              size: 18,
                            ),
                            label: const Text("Resolve"),
                          ),
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildMapRoom(String name, Color color) {
    return Container(
      width: 80,
      height: 60,
      decoration: BoxDecoration(
        color: color,
        border: Border.all(color: Colors.blueGrey),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Center(
        child: Text(
          name,
          style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold),
        ),
      ),
    );
  }
}
