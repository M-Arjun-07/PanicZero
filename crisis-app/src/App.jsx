import React, { useState, useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { HazardNode, EscapePath, CameraController, StaffMarker, roomCoordinates, crisisConfig, getEscapeRouteNodes, LayoutRoom, CameraOverlay, AudioOverlay } from './components/DigitalTwin';
import { Room }  from './components/Room';
import LoginPortal from './components/LoginPortal';
import TerminalFeed from './components/TerminalFeed';
import { API_URL, WS_URL } from './config';

import './App.css';

const FLOOR_HEIGHT = 3.5;
const MOVEMENT_SPEEDS = {
  walk: 0.08,
  stairs: 0.03,
  lift: 0.12,
};
const WAYPOINT_THRESHOLD = 0.08;

const STAFF_BASES = {
  1: 'Security',
  2: 'Lobby',
  3: 'StairB_F4',
};

const distance3D = (from, to) => {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

const distanceXZ = (from, to = [0,0,0]) => {
  const dx = (to[0] || 0) - from[0];
  const dz = (to[2] || 0) - from[2];
  return Math.sqrt(dx * dx + dz * dz);
};

const stepTowards = (from, to, speed) => {
  const dist = distance3D(from, to);
  if (dist <= speed) return [...to];

  return [
    from[0] + ((to[0] - from[0]) / dist) * speed,
    from[1] + ((to[1] - from[1]) / dist) * speed,
    from[2] + ((to[2] - from[2]) / dist) * speed,
  ];
};

const getFloorFromY = (y) => Math.round(y / FLOOR_HEIGHT);

const getFloorFromRoom = (roomId, coords) => {
  const roomCoords = coords[roomId];
  return roomCoords ? getFloorFromY(roomCoords[1]) : 0;
};

const isGuestRoom = (roomId) => /^\d{3}$/.test(roomId);

const isLiftOperational = (hazards) => !hazards.some((hazard) => hazard.type === 'lift_stuck');

const shouldAvoidLiftForIncident = (incidentType) =>
  ['fire', 'gas', 'violence', 'lift_stuck'].includes(incidentType);

const chooseSafeCoreOnFloor = (floor, blockedRooms = [], allowLift = true) => {
  const candidates = [
    `StairB_F${floor}`,
    `StairA_F${floor}`,
    allowLift ? `Lift_F${floor}` : null,
  ].filter(Boolean);

  return candidates.find((room) => !blockedRooms.includes(room)) || candidates[0];
};

const getStagingRoomForHazards = (hazards, coords) => {
  if (!hazards.length) return 'Lobby';

  const primaryHazard = hazards[0];
  const primaryRoom = primaryHazard.room;
  const primaryFloor = getFloorFromRoom(primaryRoom, coords);
  const blockedRooms = hazards.map((hazard) => hazard.room);
  const blockedSet = new Set(blockedRooms);
  const liftOperational = isLiftOperational(hazards);

  if (primaryRoom.startsWith('Corridor_')) {
    return chooseSafeCoreOnFloor(primaryFloor, blockedRooms, liftOperational);
  }

  if (isGuestRoom(primaryRoom)) {
    const corridorRoom = `Corridor_${primaryRoom[0]}`;
    return blockedSet.has(corridorRoom)
      ? chooseSafeCoreOnFloor(primaryFloor, blockedRooms, liftOperational)
      : corridorRoom;
  }

  if (primaryRoom.startsWith('Lift_')) {
    const nearbySafeArea = primaryFloor === 0 ? 'Lobby' : `Corridor_${primaryFloor}`;
    return blockedSet.has(nearbySafeArea)
      ? chooseSafeCoreOnFloor(primaryFloor, blockedRooms, liftOperational)
      : nearbySafeArea;
  }

  if (primaryRoom.startsWith('Stair')) {
    const nearbySafeArea = primaryFloor === 0 ? 'Lobby' : `Corridor_${primaryFloor}`;
    return blockedSet.has(nearbySafeArea) ? chooseSafeCoreOnFloor(primaryFloor, blockedRooms, liftOperational) : nearbySafeArea;
  }

  const groundFloorFallbacks = {
    Kitchen: 'Lobby',
    Restaurant: 'Lobby',
    Security: 'Lobby',
    Utility: 'Lobby',
    Lobby: 'Main_Exit',
  };

  return groundFloorFallbacks[primaryRoom] || (primaryFloor > 0 ? `Corridor_${primaryFloor}` : 'Lobby');
};

const getDispatchRoles = (hazards) => {
  if (!hazards.length) return [];

  const uniqueTypes = [...new Set(hazards.map((hazard) => hazard.type))];
  if (uniqueTypes.length === 1 && uniqueTypes[0] === 'violence') {
    return ['security'];
  }

  return ['security', 'medical'];
};

const getNearestStairCoreForFloor = (currentPos, floor, coords) => {
  const stairA = coords[`StairA_F${floor}`] || [0,0,0];
  const stairB = coords[`StairB_F${floor}`] || [0,0,0];
  return distanceXZ(currentPos, stairA) <= distanceXZ(currentPos, stairB)
    ? `StairA_F${floor}`
    : `StairB_F${floor}`;
};

const buildStaffRoute = ({ currentPos, targetRoom, incidentType, hazards, coords }) => {
  const targetCoords = coords[targetRoom];
  if (!targetCoords) return [];

  const currentFloor = getFloorFromY(currentPos[1]);
  const targetFloor = getFloorFromY(targetCoords[1]);

  if (currentFloor === targetFloor) {
    return [targetRoom];
  }

  const liftOperational = isLiftOperational(hazards);
  const useLift = liftOperational && !shouldAvoidLiftForIncident(incidentType);
  const route = [];

  if (useLift) {
    route.push(`Lift_F${currentFloor}`);
    route.push(`Lift_F${targetFloor}`);
  } else {
    const stairCore = getNearestStairCoreForFloor(currentPos, currentFloor, coords);
    const stairPrefix = stairCore.startsWith('StairA') ? 'StairA' : 'StairB';
    const step = targetFloor > currentFloor ? 1 : -1;

    route.push(stairCore);
    for (let floor = currentFloor + step; floor !== targetFloor + step; floor += step) {
      route.push(`${stairPrefix}_F${floor}`);
    }
  }

  if (route[route.length - 1] !== targetRoom) {
    route.push(targetRoom);
  }

  return route;
};

function App() {
  const [hazards, setHazards] = useState([]);
  const [activeRoute, setActiveRoute] = useState([]);
  const [isXRay, setIsXRay] = useState(true);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [focusRoom, setFocusRoom] = useState(null);
  const [showAllClear, setShowAllClear] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [isLayoutMode, setIsLayoutMode] = useState(false);
  const [isPerspectiveMode, setIsPerspectiveMode] = useState(false);
  const [coords, setCoords] = useState(roomCoordinates);
  const [scales, setScales] = useState({});
  const [sensorData, setSensorData] = useState({});
  const [meshState, setMeshState] = useState({});
  const [logs, setLogs] = useState([]);
  const [showCamera, setShowCamera] = useState(false);
  const [showAudio, setShowAudio] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const [transformMode, setTransformMode] = useState('translate');
  const [availableModels, setAvailableModels] = useState([]);
  const lastGridPos = useRef([0, 0, 0]);
  const [staffPositions, setStaffPositions] = useState([
    {
      id: 1,
      role: 'security',
      currentPos: [...roomCoordinates.Security],
      targetRoom: 'Security',
      targetIncidentType: null,
      route: [],
      routeTargetRoom: 'Security',
      routeIncidentType: null,
      routeHazardSignature: '',
    },
    {
      id: 2,
      role: 'medical',
      currentPos: [...roomCoordinates.Lobby],
      targetRoom: 'Lobby',
      targetIncidentType: null,
      route: [],
      routeTargetRoom: 'Lobby',
      routeIncidentType: null,
      routeHazardSignature: '',
    },
    {
      id: 3,
      role: 'security',
      currentPos: [...roomCoordinates.StairB_F4],
      targetRoom: 'StairB_F4',
      targetIncidentType: null,
      route: [],
      routeTargetRoom: 'StairB_F4',
      routeIncidentType: null,
      routeHazardSignature: '',
    },
  ]);

  const prevHazardsCount = useRef(0);
  const hazardsRef = useRef([]);
  const hazardsSignatureRef = useRef('');

  const handleLogin = (username, password) => {
    if (username === 'admin' && password === 'password') {
      setIsAuthenticated(true);
      return true;
    }

    return false;
  };

  // --- STAFF MOVEMENT ENGINE (Waypoint-based pathfinding) ---
  useEffect(() => {
    const moveInterval = setInterval(() => {
      const currentHazards = hazardsRef.current;
      const currentHazardSignature = hazardsSignatureRef.current;

      setStaffPositions((prev) =>
        prev.map((staff) => {
          const targetCoords = coords[staff.targetRoom];
          if (!targetCoords) return staff;

          const routeNeedsRebuild =
            staff.routeTargetRoom !== staff.targetRoom ||
            staff.routeIncidentType !== staff.targetIncidentType ||
            staff.routeHazardSignature !== currentHazardSignature ||
            !Array.isArray(staff.route) ||
            (staff.route.length === 0 && distance3D(staff.currentPos, targetCoords) > WAYPOINT_THRESHOLD);

          const route = routeNeedsRebuild
            ? buildStaffRoute({
                currentPos: staff.currentPos,
                targetRoom: staff.targetRoom,
                incidentType: staff.targetIncidentType,
                hazards: currentHazards,
                coords: coords,
              })
            : staff.route;

          if (!route.length) return staff;

          const [nextWaypoint, ...remainingRoute] = route;
          const waypointCoords = coords[nextWaypoint];
          if (!waypointCoords) {
            return {
              ...staff,
              route: remainingRoute,
            };
          }

          if (distance3D(staff.currentPos, waypointCoords) <= WAYPOINT_THRESHOLD) {
            return {
              ...staff,
              currentPos: [...waypointCoords],
              route: remainingRoute,
            };
          }

          const isVerticalWaypoint =
            /^Lift_F\d+$/.test(nextWaypoint) || /^StairA_F\d+$/.test(nextWaypoint) || /^StairB_F\d+$/.test(nextWaypoint);

          const speed = nextWaypoint.startsWith('Lift_')
            ? MOVEMENT_SPEEDS.lift
            : isVerticalWaypoint
              ? MOVEMENT_SPEEDS.stairs
              : MOVEMENT_SPEEDS.walk;

          return {
            ...staff,
            currentPos: stepTowards(staff.currentPos, waypointCoords, speed),
            route,
          };
        })
      );
    }, 50);

    return () => clearInterval(moveInterval);
  }, []);

  useEffect(() => {
    if (isLayoutMode) {
      fetchModels();
    }
  }, [isLayoutMode]);

  // --- Helper: Update Staff Logic (Replaces the logic previously in sync_state) ---
  const updateStaffResponse = (newHazards, signature, currentCoords = coords) => {
    const stagingRoom = newHazards.length > 0 ? getStagingRoomForHazards(newHazards, currentCoords) : null;
    const primaryType = newHazards.length > 0 ? newHazards[0].type : null;
    const dispatchRoles = newHazards.length > 0 ? getDispatchRoles(newHazards) : [];

    setStaffPositions((prev) =>
      prev.map((staff) => {
        const baseRoom = STAFF_BASES[staff.id] || 'Lobby';
        const shouldRespond = newHazards.length > 0 && dispatchRoles.includes(staff.role);
        const targetRoom = shouldRespond ? stagingRoom : baseRoom;
        const targetIncidentType = shouldRespond ? primaryType : null;

        return {
          ...staff,
          targetRoom,
          targetIncidentType,
          route: buildStaffRoute({ 
            currentPos: staff.currentPos, 
            targetRoom, 
            incidentType: targetIncidentType, 
            hazards: newHazards,
            coords: currentCoords 
          }),
          routeTargetRoom: targetRoom,
          routeIncidentType: targetIncidentType,
          routeHazardSignature: signature,
        };
      })
    );
  };

  // --- Task 3: Map Data Export (API Sync) ---
  const syncMap = async (currentCoords = coords, currentHazards = hazards, currentScales = scales) => {
    const suggested_paths = currentHazards.map(h => 
      getEscapeRouteNodes(h.room, currentHazards).map(node => currentCoords[node])
    );

    try {
      await fetch(`${API_URL}/api/crisis/map`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rooms: currentCoords,
            scales: currentScales,
          active_hazards: currentHazards,
          suggested_paths: suggested_paths
        })
      });
    } catch (e) {
      console.error("Map Data Export Failed:", e);
    }
  };

  const checkSensorAlignment = (roomId, visual, acoustic) => {
    const vLabels = ['knife', 'weapon', 'gun', 'fire', 'smoke'];
    const aLabels = ['violence', 'shouting', 'scream', 'glass break', 'gunshot'];
    
    const vMatch = vLabels.some(label => visual?.toLowerCase().includes(label));
    const aMatch = aLabels.some(label => acoustic?.toLowerCase().includes(label));

    if (vMatch && aMatch) triggerSim('violence', roomId, 'AUTO_EMERGENCY: SENSOR_ALIGNMENT_CONFIRMED');
  };

  const fetchModels = async () => {
    try {
      const resp = await fetch(`${API_URL}/api/models`);
      const data = await resp.json();
      setAvailableModels(data.models || []);
    } catch (e) { console.error("Model fetch failed", e); }
  };

  const loadModel = async (filename) => {
    try {
      const resp = await fetch(`${API_URL}/api/models/load/${filename}`);
      const data = await resp.json();
      if (data.rooms) {
        setCoords(data.rooms);
        if (data.scales) setScales(data.scales);
        syncMap(data.rooms);
      }
    } catch (e) { console.error("Load failed", e); }
  };

  const saveCurrentLayout = async () => {
    const name = prompt("Name this layout:", "Blueprint_V1");
    if (!name) return;
    try {
      await fetch(`${API_URL}/api/models/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, rooms: coords, scales: scales })
      });
      fetchModels();
    } catch (e) { console.error("Save failed", e); }
  };

  const addNewRoom = () => {
    const id = `Zone_${Math.floor(Math.random() * 1000)}`;
    // Snap the spawn position to 0.5 grid based on last interaction
    const spawnPos = [
      Math.round(lastGridPos.current[0] * 2) / 2,
      0,
      Math.round(lastGridPos.current[2] * 2) / 2
    ];
    setCoords(prev => ({ ...prev, [id]: spawnPos }));
    setScales(prev => ({ ...prev, [id]: [1, 1, 1] }));
    setSelectedRoomId(id);
  };

  const deleteSelectedRoom = () => {
    if (!selectedRoomId) return;
    setCoords(prev => {
      const updated = { ...prev };
      delete updated[selectedRoomId];
      return updated;
    });
    setScales(prev => {
      const updated = { ...prev };
      delete updated[selectedRoomId];
      return updated;
    });
    setSelectedRoomId(null);
  };

  useEffect(() => {
    syncMap(coords, hazards, scales);
  }, [hazards, coords, scales]);

  useEffect(() => {
    // --- UNIFIED NATIVE WEBSOCKET ---
    const pyWs = new WebSocket(WS_URL);
    
    pyWs.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.event === 'NEW_CRISIS' || msg.event === 'SIMULATOR_TRIGGERED') {
          if (isLayoutMode) return;
          
          const crisis = msg.data;
          
          // Map backend location to room ID
          let room = crisis.location || "Lobby";
          if (!coords[room]) {
            if (room.includes('Kitchen')) room = 'Kitchen';
            else if (room.includes('Restaurant')) room = 'Restaurant';
            else room = 'Lobby';
          }

          // Map description to local type for config mapping
          // Priority: Use the type provided by backend, fallback to inference if missing
          let type = crisis.type || crisis.event_type || 'medical';
          const desc = (crisis.description || crisis.details || '').toLowerCase();
          if (desc.includes('fire')) type = 'fire';
          else if (desc.includes('weapon') || desc.includes('violence') || desc.includes('gun')) type = 'violence';
          else if (desc.includes('gas') || desc.includes('smoke')) type = 'gas';
          else if (desc.includes('lift')) type = 'lift_stuck';

          // Intelligence Core: Track sensor labels
          const visualLabel = crisis.label || guardian?.dominant_threat || 'Scanning';
          const acousticLabel = crisis.audio_label || (desc.includes('shout') ? 'Shouting' : 'Ambient');
          
          setSensorData(prev => {
            const updated = { ...prev, [room]: { visual: visualLabel, acoustic: acousticLabel } };
            // Automate emergency if sensors align
            checkSensorAlignment(room, visualLabel, acousticLabel);
            return updated;
          });

          // Update Hazards State
          const newHazard = { room, type };
          setHazards(prev => {
            if (prev.find(h => h.room === room && h.type === type)) return prev;
            const updated = [...prev, newHazard];
            
            // Update Refs for movement engine
            const signature = updated.map(h => `${h.room}:${h.type}`).join('|');
            hazardsRef.current = updated;
            hazardsSignatureRef.current = signature;
            
            // Trigger focus and staff deployment
            setFocusRoom(room);
            updateStaffResponse(updated, signature);
            return updated;
          });
        } else if (msg.event === 'GUARDIAN_EMERGENCY') {
             console.log("🛡️ Guardian Mesh Pre-Alert:", msg.data);
        } else if (msg.event === 'MESH_UPDATE') {
          const { room_id, visual, acoustic, status, label, trigger_emergency } = msg.data;
          
          setMeshState(prev => ({
            ...prev,
            [room_id]: { visual, acoustic, status }
          }));

          const visLabel = visual.label || 'None';
          const visConf = visual.confidence ? (visual.confidence * 100).toFixed(0) : '0';
          const acLabel = acoustic.label || 'None';
          const acConf = acoustic.confidence ? (acoustic.confidence * 100).toFixed(0) : '0';
          
          const newLog = `MESH_UPDATE: Room ${room_id} - Visual(${visLabel}: ${visConf}%) - Acoustic(${acLabel}: ${acConf}%) - STATUS: ${status}`;
          setLogs(prev => [...prev, newLog]);

          if (trigger_emergency) {
            let type = 'violence';
            const desc = (label || '').toLowerCase();
            if (desc.includes('fire') || desc.includes('smoke')) type = 'fire';
            else if (desc.includes('gas')) type = 'gas';
            else if (desc.includes('medical') || desc.includes('fall')) type = 'medical';
            else if (desc.includes('lift')) type = 'lift_stuck';
            
            triggerSim(type, room_id, 'AUTO_EMERGENCY: GUARDIAN CONFIRMED THREAT');
          }
        }
      } catch (err) {
        console.error("WebSocket Error:", err);
      }
    };

    return () => {
      pyWs.close();
    };
  }, []);

  // --- COMPREHENSIVE CRISIS SCENARIOS (Updated for FastAPI) ---

  const triggerSim = async (type, room, desc) => {
    if (isLayoutMode) return;
    console.log('Front-end Triggering:', type, room);
    
    // Local Optimistic Update
    const newHazard = { room, type };
    if (!hazardsRef.current.find(h => h.room === room && h.type === type)) {
      const updated = [...hazardsRef.current, newHazard];
      const signature = updated.map(h => `${h.room}:${h.type}`).join('|');
      hazardsRef.current = updated;
      hazardsSignatureRef.current = signature;
      setHazards(updated);
      setFocusRoom(room);
      updateStaffResponse(updated, signature);
    }

    try {
      await fetch(`${API_URL}/api/simulator/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: type,
          location: room,
          severity: 4,
          details: desc
        })
      });
    } catch (e) { console.error("Sim Trigger Failed", e); }
  };

  const resetSystem = async () => {
    try {
      await fetch(`${API_URL}/api/staff/reset`, { method: 'POST' });
      
      // Local state cleanup
      setHazards([]);
      setActiveRoute([]);
      hazardsRef.current = [];
      hazardsSignatureRef.current = '';
      setFocusRoom('OVERVIEW');
      setSelectedRoom(null);
      setShowAllClear(true);
      setTimeout(() => setShowAllClear(false), 4000);
      
      // Return staff to base
      updateStaffResponse([], '');
    } catch (e) { console.error("Reset Failed", e); }
  };

  const handleLayoutUpdate = (oldName, newPos, newName) => {
    setCoords(prev => {
      const updated = { ...prev };
      if (newName && newName !== oldName) {
        updated[newName] = updated[oldName];
        delete updated[oldName];
        return updated;
      }
      if (newPos) updated[oldName] = newPos;
      return updated;
    });
  };

  const allRooms = Object.keys(coords).filter((key) => key !== 'Main_Exit');

  console.log('Active Hazards:', hazards);

  if (!isAuthenticated) {
    return <LoginPortal onLogin={handleLogin} />;
  }

  return (
    <div className="terminal-root" style={{ width: '100vw', height: '100vh', background: '#000000', display: 'flex', overflow: 'hidden' }}>
      {showAllClear && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9998,
            boxShadow: 'inset 0 0 80px rgba(34, 197, 94, 0.4)',
            border: '4px solid rgba(34, 197, 94, 0.2)',
            pointerEvents: 'none',
            animation: 'pulse 2s infinite ease-in-out',
          }}
        />
      )}

      {showAllClear && (
        <div
          style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            zIndex: 9999, background: 'rgba(34, 197, 94, 0.95)', color: 'white',
            padding: '1.2rem 2.5rem', borderRadius: '0.75rem', textAlign: 'center',
            backdropFilter: 'blur(10px)', border: '2px solid #4ade80',
            boxShadow: '0 0 100px rgba(34, 197, 94, 0.4)', pointerEvents: 'none',
          }}
        >
          <h1 style={{ margin: 0, fontSize: '2.2rem', letterSpacing: '2px', fontWeight: '900', lineHeight: '1.1' }}>ALL CLEAR</h1>
          <p style={{ margin: '5px 0 0 0', opacity: 0.9, fontWeight: 'bold', fontSize: '0.85rem', letterSpacing: '1px' }}>
            SYSTEMS SECURED • CRISIS RESOLVED
          </p>
        </div>
      )}

      {/* LEFT SIDEBAR */}
      {leftCollapsed && <button className="sidebar-handle left-handle" onClick={() => setLeftCollapsed(false)}>[ &gt;&gt; ]</button>}
      <aside className={`terminal-sidebar-wrapper left-sidebar ${leftCollapsed ? 'collapsed' : ''}`}>
        <div className="terminal-sidebar-content">
          <div className="scanline-beam" />
          <button className="sidebar-toggle" onClick={() => setLeftCollapsed(true)}>[ &lt;&lt; ]</button>
          
          <div className="secure-node-header">
            <span className="dot-red">●</span>
            <span className="node-text">CRISISMESH™ SECURE NODE</span>
          </div>

          <div className="terminal-group">
            <button 
              className="terminal-btn" 
              style={{ 
                borderColor: isLayoutMode ? '#f97316' : '#38BDF8', 
                color: isLayoutMode ? '#f97316' : '#38BDF8',
                marginBottom: '10px' 
              }}
              onClick={() => {
                setIsLayoutMode(!isLayoutMode);
                if (!isLayoutMode) {
                  setHazards([]);
                  setSelectedRoomId(null);
                }
              }}
            >
              {isLayoutMode ? '[ EXIT_ARCHITECT_MODE ]' : '[ ENTER_ARCHITECT_MODE ]'}
            </button>

            {isLayoutMode && (
              <>
                <div className="architect-toolbar-container" style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  width: '100%',
                  marginTop: '10px',
                  marginBottom: '20px'
                }}>
                  <button className="terminal-btn" onClick={addNewRoom} style={{ marginBottom: 0 }}>[ + ] ADD_ROOM</button>
                  <button className="terminal-btn" onClick={() => setTransformMode(m => m === 'translate' ? 'scale' : 'translate')} style={{ marginBottom: 0, borderColor: '#eab308', color: '#eab308' }}>
                    [ ⤢ ] {transformMode === 'translate' ? 'MODE: MOVE' : 'MODE: RESIZE'}
                  </button>
                  <button className="terminal-btn" onClick={() => setIsPerspectiveMode(!isPerspectiveMode)} style={{ marginBottom: 0, borderColor: '#a855f7', color: '#a855f7' }}>
                    [ 🧊 ] {isPerspectiveMode ? 'VIEW: 3D' : 'VIEW: 2D'}
                  </button>
                  <button className="terminal-btn" onClick={deleteSelectedRoom} style={{ marginBottom: 0, borderColor: '#ef4444', color: '#ef4444' }}>[ X ] DELETE_SELECTED</button>
                </div>

                <button className="terminal-btn" onClick={saveCurrentLayout}>
                  &gt; SAVE_TO_LIBRARY
                </button>
                <div className="terminal-group" style={{ marginTop: '10px' }}>
                  <p className="node-text" style={{ fontSize: '9px', opacity: 0.5 }}>LOAD_EXISTING</p>
                  <select 
                    className="terminal-select" 
                    onChange={(e) => loadModel(e.target.value)}
                    style={{ width: '100%', background: '#0f172a', color: '#38BDF8', border: '1px solid #38BDF8', fontSize: '10px', padding: '5px' }}
                  >
                    <option value="">-- SELECT MODEL --</option>
                    {availableModels.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </>
            )}
          </div>

          <div className="terminal-group">
            <p className="node-text" style={{ fontSize: '10px', marginBottom: '10px', opacity: 0.6 }}>LIVE_INCIDENTS</p>
            {hazards.length === 0 ? (
              <p style={{ color: '#22c55e', fontSize: '11px' }}>✓ NOMINAL</p>
            ) : (
              hazards.map((h, i) => (
                <div key={i} style={{ color: crisisConfig[h.type]?.color, fontSize: '11px', marginBottom: '4px' }}>
                  [{h.type.toUpperCase()}] {h.room}
                </div>
              ))
            )}
          </div>

          <div className="terminal-group" style={{ marginTop: 'auto' }}>
            <p className="node-text" style={{ fontSize: '10px', marginBottom: '10px', opacity: 0.6 }}>ZONE_TELEMETRY</p>
            {(selectedRoom || selectedRoomId) ? (
              <div style={{ fontSize: '11px', color: '#cbd5e1', borderLeft: '1px solid #38BDF8', paddingLeft: '8px' }}>
                <p style={{ fontWeight: 'bold', color: '#38BDF8', margin: '0 0 5px 0' }}>{(selectedRoom || selectedRoomId).toUpperCase()}</p>
                
                {(() => {
                  const activeRoom = selectedRoom || selectedRoomId;
                  const hazard = hazards.find(h => h.room === activeRoom);
                  if (hazard) return <p style={{ color: '#ef4444', fontWeight: 'bold', animation: 'blink 1s infinite' }}>● STATUS: CRISIS</p>;
                  
                  const stateStatus = meshState[activeRoom]?.status;
                  if (stateStatus === 'CRISIS') return <p style={{ color: '#ef4444', fontWeight: 'bold', animation: 'blink 1s infinite' }}>● STATUS: CRISIS</p>;
                  if (stateStatus === 'ALERT') return <p style={{ color: '#eab308' }}>● STATUS: ALERT</p>;
                  
                  const sensor = sensorData[activeRoom];
                  if (sensor && (sensor.visual !== 'Scanning' || sensor.acoustic !== 'Ambient')) {
                    return <p style={{ color: '#eab308' }}>● STATUS: ALERT</p>;
                  }
                  return <p style={{ color: '#22c55e' }}>● STATUS: NORMAL</p>;
                })()}

                <div style={{ display: 'flex', gap: '5px', marginTop: '10px' }}>
                  <button className="terminal-btn" style={{ fontSize: '9px', padding: '4px' }} onClick={() => { setShowCamera(!showCamera); if (!showCamera) setShowAudio(false); }}>
                    {showCamera ? '[ CLOSE_CAM ]' : '[ VIEW_CAMERA ]'}
                  </button>
                  <button className="terminal-btn" style={{ fontSize: '9px', padding: '4px' }} onClick={() => { setShowAudio(!showAudio); if (!showAudio) setShowCamera(false); }}>
                    {showAudio ? '[ CLOSE_AUDIO ]' : '[ LISTEN_AUDIO ]'}
                  </button>
                </div>
                <div style={{ marginTop: '5px' }}>
                  {(() => {
                    const activeRoom = selectedRoom || selectedRoomId;
                    const isConfirmed = hazards.some(h => h.room === activeRoom);
                    return (
                      <button className="terminal-btn" style={{ 
                        fontSize: '9px', padding: '4px', 
                        borderColor: '#ef4444', 
                        color: isConfirmed ? 'white' : '#ef4444',
                        background: isConfirmed ? '#ef4444' : 'transparent',
                        cursor: isConfirmed ? 'default' : 'pointer'
                      }} onClick={async () => {
                        if (isConfirmed || !activeRoom) return;

                        let type = 'general_emergency';
                        const visLabel = meshState[activeRoom]?.visual?.label || sensorData[activeRoom]?.visual || '';
                        const acLabel = meshState[activeRoom]?.acoustic?.label || sensorData[activeRoom]?.acoustic || '';
                        const combined = (visLabel + ' ' + acLabel).toLowerCase();

                        if (combined.includes('fire') || combined.includes('smoke')) type = 'fire';
                        else if (combined.includes('medical') || combined.includes('fall')) type = 'medical';
                        else if (combined.includes('weapon') || combined.includes('violence') || combined.includes('gun')) type = 'violence';
                        else if (combined.includes('gas')) type = 'gas';

                        triggerSim(type, activeRoom, 'MANUAL OVERRIDE: CONFIRMED THREAT');

                        try {
                          await fetch(`http://${window.location.hostname}:8000/api/guardian/telemetry`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              room_id: activeRoom,
                              sensor_type: 'visual',
                              label: 'Manual Confirmed Threat',
                              confidence: 1.0
                            })
                          });
                        } catch (e) { console.error("Confirm Threat Failed", e); }
                      }}>
                        {isConfirmed ? '[ CONFIRMED ]' : '[ CONFIRM_THREAT ]'}
                      </button>
                    );
                  })()}
                </div>
                <p style={{ marginTop: '10px', fontSize: '9px', opacity: 0.6 }}>VISUAL: {meshState[selectedRoom || selectedRoomId]?.visual?.label || sensorData[selectedRoom || selectedRoomId]?.visual || '---'}</p>
                <p style={{ fontSize: '9px', opacity: 0.6 }}>AUDIO: {meshState[selectedRoom || selectedRoomId]?.acoustic?.label || sensorData[selectedRoom || selectedRoomId]?.acoustic || '---'}</p>
              </div>
            ) : (
              <p style={{ fontSize: '10px', color: '#475569' }}>SELECT_ZONE_TO_INSPECT...</p>
            )}
          </div>
        </div>
      </aside>

      <div className="main-viewport" style={{ flex: 1, position: 'relative', zIndex: 1 }}>
        <Canvas 
          orthographic={isLayoutMode && !isPerspectiveMode}
          camera={(isLayoutMode && !isPerspectiveMode) ? { zoom: 20, position: [0, 100, 0] } : { position: [-25, 20, 25], fov: 40 }}
          style={{ background: isLayoutMode ? '#000000' : '#000000' }}
          onPointerMove={(e) => {
            if (isLayoutMode && e.point) {
              lastGridPos.current = [e.point.x, 0, e.point.z];
            }
          }}
          onPointerMissed={() => isLayoutMode && setSelectedRoomId(null)}
        >
          {!isLayoutMode && <ambientLight intensity={0.5} />}
          {!isLayoutMode && <directionalLight position={[10, 20, 10]} intensity={1.2} />}
          {isLayoutMode && <gridHelper args={[200, 200, "#334155", "#111827"]} rotation={[0, 0, 0]} />}

          {allRooms.map((roomName) => (
            isLayoutMode ? (
              <LayoutRoom
                key={roomName}
                name={roomName}
                position={coords[roomName]}
                scale={scales[roomName]}
                isSelected={selectedRoomId === roomName}
                onSelect={setSelectedRoomId}
                transformMode={transformMode}
                onUpdate={(oldName, newPos, newName, newScale) => {
                  handleLayoutUpdate(oldName, newPos, newName, newScale);
                }}
              />
            ) : (
              <Room
                key={roomName}
                name={roomName}
                position={coords[roomName]}
                size={scales[roomName] ? [scales[roomName][0]*5, scales[roomName][1]*2.8, scales[roomName][2]*4] : null}
                isXRay={isXRay}
                onClick={setSelectedRoom}
              />
            )
          ))}

          {showCamera && (selectedRoom || selectedRoomId) && (
            <CameraOverlay 
              roomId={selectedRoom || selectedRoomId} 
              position={coords[selectedRoom || selectedRoomId]} 
              label={sensorData[selectedRoom || selectedRoomId]?.visual}
            />
          )}
          {showAudio && (selectedRoom || selectedRoomId) && (
            <AudioOverlay 
              roomId={selectedRoom || selectedRoomId} 
              position={coords[selectedRoom || selectedRoomId]} 
              label={sensorData[selectedRoom || selectedRoomId]?.acoustic}
            />
          )}

          {!isLayoutMode && hazards.map((hazard, index) => <HazardNode key={index} roomId={hazard.room} type={hazard.type} />)}
          
          {/* Task 1: Multi-Path Fix - Render path for every hazard */}
          {!isLayoutMode && (isXRay || hazards.length > 0) && hazards.map((h, i) => (
            <EscapePath key={`path-${i}`} activeHazardLocation={h.room} allHazards={hazards} meshState={meshState} />
          ))}

          {!isLayoutMode && staffPositions.map((staff) => (
            <StaffMarker key={staff.id} position={staff.currentPos} role={staff.role} />
          ))}

          <CameraController targetRoom={focusRoom} isLayoutMode={isLayoutMode} isPerspectiveMode={isPerspectiveMode} />
          <OrbitControls makeDefault enablePan enableZoom enableRotate={!isLayoutMode || isPerspectiveMode} target={[0, 0, 0]} />
        </Canvas>
      </div>

      {/* RIGHT SIDEBAR */}
      {rightCollapsed && <button className="sidebar-handle right-handle" onClick={() => setRightCollapsed(false)}>[ &lt;&lt; ]</button>}
      <aside className={`terminal-sidebar-wrapper right-sidebar ${rightCollapsed ? 'collapsed' : ''}`}>
        <div className="terminal-sidebar-content">
          <div className="scanline-beam" />
          <button className="sidebar-toggle" style={{ alignSelf: 'flex-start' }} onClick={() => setRightCollapsed(true)}>[ &gt;&gt; ]</button>
          
          <p className="node-text" style={{ fontSize: '10px', marginBottom: '15px', opacity: 0.6 }}>SYSTEM_CONTROLS</p>
          <button className="terminal-btn" onClick={() => setIsXRay(!isXRay)}>
            &gt; {isXRay ? 'DISABLE_XRAY' : 'ENABLE_XRAY'}
          </button>

          <p className="node-text" style={{ fontSize: '10px', marginTop: '20px', marginBottom: '15px', opacity: 0.6 }}>SIM_VECTORS</p>
          <button className="terminal-btn" disabled={isLayoutMode} onClick={() => triggerSim('fire', 'Kitchen', 'Sim')}>&gt; RUN_FIRE_SIM</button>
          <button className="terminal-btn" disabled={isLayoutMode} onClick={() => triggerSim('medical', '408', 'Sim')}>&gt; RUN_MED_SIM</button>
          <button className="terminal-btn" disabled={isLayoutMode} onClick={() => triggerSim('violence', 'Restaurant', 'Sim')}>&gt; RUN_FORCE_SIM</button>
          <button className="terminal-btn" disabled={isLayoutMode} onClick={() => triggerSim('lift_stuck', 'Lift_F0', 'Sim')}>&gt; RUN_LIFT_SIM</button>
          <button className="terminal-btn" disabled={isLayoutMode} onClick={() => triggerSim('gas', '203', 'Sim')}>&gt; RUN_GAS_SIM</button>
          
          <button className="terminal-btn" style={{ marginTop: 'auto', borderColor: '#10b981', color: '#10b981' }} onClick={resetSystem}>
            &gt; SYSTEM_RESET
          </button>
        </div>
      </aside>
      <TerminalFeed 
        logs={logs} 
        hazards={hazards} 
        onHazardClick={(room) => {
          setSelectedRoomId(room);
          setFocusRoom(room);
          if (isLayoutMode) setIsLayoutMode(false);
        }} 
      />
    </div>
  );
}

const uiBtn = (color) => ({
  width: '100%',
  padding: '12px',
  background: 'transparent',
  color: '#f8fafc',
  border: `1px solid ${color}`,
  borderRadius: '6px',
  cursor: 'pointer',
  marginBottom: '10px',
  fontWeight: '600',
  textAlign: 'left',
  boxShadow: `inset 0 0 10px ${color}20`,
  transition: 'all 0.2s ease',
});

export default App;
