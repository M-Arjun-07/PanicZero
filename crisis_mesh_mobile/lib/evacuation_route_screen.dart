import 'package:flutter/material.dart';
import 'package:crisis_mesh_mobile/services/haptic_service.dart';

// --- API Models ---

class RouteStep {
  final int stepIndex;
  final String locationName;
  final String action;
  final String instruction;

  RouteStep({
    required this.stepIndex,
    required this.locationName,
    required this.action,
    required this.instruction,
  });

  factory RouteStep.fromJson(Map<String, dynamic> json) {
    return RouteStep(
      stepIndex: json['step_index'],
      locationName: json['location_name'],
      action: json['action'],
      instruction: json['instruction'],
    );
  }
}

class EvacuationRoute {
  final String routeId;
  final List<RouteStep> steps;

  EvacuationRoute({required this.routeId, required this.steps});

  factory EvacuationRoute.fromJson(Map<String, dynamic> json) {
    return EvacuationRoute(
      routeId: json['route_id'],
      steps: (json['steps'] as List)
          .map((stepJson) => RouteStep.fromJson(stepJson))
          .toList(),
    );
  }
}

// --- Mock Data ---

final mockRoute = EvacuationRoute(
  routeId: 'route_409',
  steps: [
    RouteStep(
      stepIndex: 0,
      locationName: 'Room 101',
      action: 'straight',
      instruction: 'Exit Room 101 and head straight down the hallway.',
    ),
    RouteStep(
      stepIndex: 1,
      locationName: 'North Hallway',
      action: 'left',
      instruction: 'Turn left at the end of the hallway.',
    ),
    RouteStep(
      stepIndex: 2,
      locationName: 'East Stairwell',
      action: 'straight',
      instruction: 'Go straight down the stairs to the ground floor.',
    ),
    RouteStep(
      stepIndex: 3,
      locationName: 'Main Lobby',
      action: 'right',
      instruction: 'Turn right towards the main exit.',
    ),
    RouteStep(
      stepIndex: 4,
      locationName: 'Emergency Exit A',
      action: 'arrive',
      instruction: 'You have safely arrived at the exit.',
    ),
  ],
);

// --- Screen ---

class EvacuationRouteScreen extends StatefulWidget {
  final EvacuationRoute? route;

  const EvacuationRouteScreen({Key? key, this.route}) : super(key: key);

  @override
  _EvacuationRouteScreenState createState() => _EvacuationRouteScreenState();
}

class _EvacuationRouteScreenState extends State<EvacuationRouteScreen> {
  late EvacuationRoute _route;
  int _currentStepIndex = 0;

  @override
  void initState() {
    super.initState();
    // Use the provided route or fallback to the mock data for hackathon demo
    _route = widget.route ?? mockRoute;

    // Trigger initial haptic immediately if we are at step 0
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_route.steps.isNotEmpty) {
        _triggerHapticForStep(_currentStepIndex);
      }
    });
  }

  void _triggerHapticForStep(int index) {
    if (index >= _route.steps.length) return;
    final action = _route.steps[index].action;
    HapticService.instance.triggerHapticPattern(action);
  }

  void _nextStep() {
    if (_currentStepIndex < _route.steps.length - 1) {
      setState(() {
        _currentStepIndex++;
      });
      _triggerHapticForStep(_currentStepIndex);
    }
  }

  IconData _getIconForAction(String action) {
    switch (action.toLowerCase()) {
      case 'left':
        return Icons.turn_left;
      case 'right':
        return Icons.turn_right;
      case 'straight':
        return Icons.arrow_upward;
      case 'arrive':
      case 'success':
        return Icons.check_circle;
      case 'stop':
      case 'danger':
        return Icons.warning;
      default:
        return Icons.navigation;
    }
  }

  Color _getColorForAction(String action) {
    switch (action.toLowerCase()) {
      case 'arrive':
      case 'success':
        return Colors.greenAccent;
      case 'stop':
      case 'danger':
        return Colors.redAccent;
      default:
        return Colors.blueAccent;
    }
  }

  @override
  Widget build(BuildContext context) {
    final isArrived = _currentStepIndex >= _route.steps.length - 1;

    return Scaffold(
      backgroundColor:
          Colors.grey[900], // Dark mode for better contrast/battery
      appBar: AppBar(
        title: const Text('Evacuation Route'),
        backgroundColor: Colors.black87,
        elevation: 0,
      ),
      body: SafeArea(
        child: Column(
          children: [
            // --- Live Map / Timeline UI ---
            Expanded(
              child: ListView.builder(
                padding: const EdgeInsets.symmetric(
                  horizontal: 20,
                  vertical: 24,
                ),
                itemCount: _route.steps.length,
                itemBuilder: (context, index) {
                  final step = _route.steps[index];
                  final isCurrent = index == _currentStepIndex;
                  final isPassed = index < _currentStepIndex;

                  final actionColor = isPassed
                      ? Colors.grey
                      : (isCurrent
                            ? _getColorForAction(step.action)
                            : Colors.white54);

                  return Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Node & Timeline line
                      Column(
                        children: [
                          Container(
                            width: 48,
                            height: 48,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: isCurrent
                                  ? actionColor.withOpacity(0.2)
                                  : Colors.transparent,
                              border: Border.all(
                                color: actionColor,
                                width: isCurrent ? 3 : 2,
                              ),
                            ),
                            child: Icon(
                              _getIconForAction(step.action),
                              color: actionColor,
                              size: 24,
                            ),
                          ),
                          if (index != _route.steps.length - 1)
                            Container(
                              width: 2,
                              height: 50,
                              color: isPassed
                                  ? Colors.grey[800]
                                  : (isCurrent
                                        ? actionColor
                                        : Colors.grey[800]),
                            ),
                        ],
                      ),
                      const SizedBox(width: 16),
                      // Text info
                      Expanded(
                        child: Padding(
                          padding: const EdgeInsets.only(top: 12.0),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                step.locationName,
                                style: TextStyle(
                                  color: isPassed ? Colors.grey : Colors.white,
                                  fontSize: 18,
                                  fontWeight: isCurrent
                                      ? FontWeight.bold
                                      : FontWeight.normal,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                step.instruction,
                                style: TextStyle(
                                  color: isCurrent
                                      ? Colors.white70
                                      : Colors.grey[600],
                                  fontSize: 14,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  );
                },
              ),
            ),

            // --- Massive Next Step / Haptic Trigger Button ---
            Container(
              width: double.infinity,
              height: 140, // Massive for blind/panic navigation
              padding: const EdgeInsets.all(16),
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: isArrived
                      ? Colors.green[700]
                      : Colors.blue[700],
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(24),
                  ),
                  elevation: 8,
                ),
                onPressed: isArrived ? null : _nextStep,
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      isArrived ? Icons.check_circle_outline : Icons.touch_app,
                      size: 40,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      isArrived ? 'DESTINATION REACHED' : 'NEXT STEP',
                      style: const TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 2.0,
                      ),
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
