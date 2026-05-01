# Advanced Rule Engine (Deliverable 3)

## Overview
The Advanced Rule Engine is the decision-making core of the PanicZero backend. When the edge AI (Camera/Audio) detects a threat, the Rule Engine takes over to automatically triage the crisis, deploy the correct personnel, and prevent system failures.

## How We Achieved This

Instead of a simple 1-to-1 matching system, we built a **Threat Matrix Algorithm** in Python (`backend/rule_engine.py`) that operates in 4 distinct sequential phases:

### Phase 1: Threat Analysis Protocol
We analyze the incoming JSON payload's `description` and `severity`. Based on threat keywords, the engine outputs a dynamic response protocol:
- **Medical/Fall (Severity 4+)** -> Requires 1 Responder with `Advanced` medical training.
- **Fire/Smoke (Severity 4+)** -> Requires a team of 2 (`Security` and `Fire Warden`), auto-escalates to 911.
- **Violence/Weapon** -> Requires a massive team of 3 (`Security`), auto-escalates to Police.

### Phase 2: Availability Filtering
The engine streams the `staff` collection from Firebase Firestore. It strictly filters out any staff member whose database status is marked as `Busy`. This prevents double-assigning doctors or guards who are already handling another emergency. It then filters the remaining pool by the exact role and medical training required by Phase 1.

### Phase 3: The Scoring Algorithm
To find the absolute fastest response time, the engine dynamically scores the filtered staff list:
1. **Zone Proximity:** If a staff member's `current_zone` matches the crisis `location` exactly, they receive a massive priority bonus score (-50).
2. **Euclidean Distance:** The engine calculates the raw distance between the crisis coordinates and the staff's GPS coordinates.
The staff list is sorted by this final score, and the top `N` members are selected based on the required `team_size`.

### Phase 4: Execution & Locking
Once the optimal team is selected, the engine executes the response:
- **Targeted Pushes:** It builds Firebase Cloud Messaging (FCM) payloads for each specific team member to instantly alert their mobile app.
- **Database Locking:** It updates Firestore to change each deployed team member's status to `Busy`.
- **Fail-Safe Escalation:** If the system cannot find enough available staff to meet the matrix requirements, it automatically triggers a "Critical Warning" to simulate an external 911/Ambulance dispatch.
