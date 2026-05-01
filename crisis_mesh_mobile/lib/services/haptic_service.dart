import 'package:flutter/foundation.dart';
import 'package:vibration/vibration.dart';

class HapticService {
  HapticService._();
  static final HapticService instance = HapticService._();

  Future<void> triggerHapticPattern(String action) async {
    try {
      bool? hasVibrator = await Vibration.hasVibrator();
      if (hasVibrator != true) return;

      switch (action.toLowerCase()) {
        case 'left':
          // Two short pulses
          await Vibration.vibrate(pattern: [0, 150, 100, 150]);
          break;
        case 'right':
          // Three short pulses
          await Vibration.vibrate(pattern: [0, 150, 100, 150, 100, 150]);
          break;
        case 'straight':
          // One long continuous pulse
          await Vibration.vibrate(duration: 500);
          break;
        case 'stop':
        case 'danger':
          // Rapid staccato (urgent)
          await Vibration.vibrate(pattern: [0, 100, 50, 100, 50, 100, 50, 100]);
          break;
        case 'arrive':
        case 'success':
          // Ta-da! pattern
          await Vibration.vibrate(pattern: [0, 200, 100, 500]);
          break;
        case 'sos':
          // SOS pattern: 3 short, 3 long, 3 short
          await Vibration.vibrate(
            pattern: [
              0, 150, 100, 150, 100, 150, // 3 short
              300, 500, 100, 500, 100, 500, // 3 long
              300, 150, 100, 150, 100, 150, // 3 short
            ],
          );
          break;
        default:
          await Vibration.vibrate(duration: 200);
          break;
      }
    } catch (e) {
      debugPrint("Vibration error or not supported: $e");
    }
  }

  String getPatternDescription(String action) {
    switch (action.toLowerCase()) {
      case 'left':
        return 'Turn Left (2 Short Pulses)';
      case 'right':
        return 'Turn Right (3 Short Pulses)';
      case 'straight':
        return 'Go Straight (1 Long Pulse)';
      case 'stop':
      case 'danger':
        return 'STOP / DANGER (Rapid Pulses)';
      case 'arrive':
        return 'Arrived (Ta-da Pattern)';
      case 'sos':
        return 'SOS Triggered (Morse SOS)';
      default:
        return 'Unknown Pattern';
    }
  }
}
