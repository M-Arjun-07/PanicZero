import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import '../evacuation_route_screen.dart';

class EvacuationApiService {
  EvacuationApiService._privateConstructor();
  static final EvacuationApiService instance = EvacuationApiService._privateConstructor();

  // Replace with your backend's actual IP address/domain
  final String _baseUrl = 'http://172.20.49.51:8000/api/crisis/route';
  
  // State to hold the current route
  ValueNotifier<EvacuationRoute?> currentRoute = ValueNotifier(null);

  Future<void> fetchEvacuationRoute(String currentRoom) async {
    try {
      debugPrint("🚀 Fetching BFS Evacuation Route from $_baseUrl for room: $currentRoom");
      
      final response = await http.post(
        Uri.parse(_baseUrl),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'current_location': currentRoom}),
      );

      if (response.statusCode == 200) {
        final Map<String, dynamic> data = jsonDecode(response.body);
        
        // Parse the JSON into our Dart Models
        final route = EvacuationRoute.fromJson(data);
        
        // Update the app's state
        currentRoute.value = route;
        debugPrint("✅ Successfully parsed and saved evacuation route: ${route.routeId}");
        
      } else {
        debugPrint("❌ Failed to fetch route. Status code: ${response.statusCode}");
      }
    } catch (e) {
      debugPrint("❌ Exception fetching evacuation route: $e");
    }
  }
}
