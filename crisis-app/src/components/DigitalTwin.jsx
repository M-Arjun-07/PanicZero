import React, { useRef, useEffect, useMemo, useState, useLayoutEffect, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html, Line, TransformControls, Edges } from '@react-three/drei';
import { gsap } from 'gsap';

// --- REALISTIC HOTEL ARCHITECTURE GENERATOR ---
export const roomCoordinates = {};
const floorH = 3.5; // Floor height

// 1. Generate Vertical Cores (Lifts & Stairs)
[0, 1, 2, 3, 4].forEach(level => {
  const y = level * floorH;
  roomCoordinates[`Lift_F${level}`] = [0, y, 0];       // Center
  roomCoordinates[`StairA_F${level}`] = [-14, y, 0];   // Far Left
  roomCoordinates[`StairB_F${level}`] = [14, y, 0];    // Far Right
});

// 2. Generate Ground Floor (y=0)
roomCoordinates['Lobby'] = [0, 0, 4];
roomCoordinates['Restaurant'] = [8, 0, 4];
roomCoordinates['Kitchen'] = [8, 0, -4];
roomCoordinates['Security'] = [-8, 0, 4];
roomCoordinates['Utility'] = [-8, 0, -4];

// 3. Generate Upper Floors (1 to 4)
// Standard hotel layout: Central corridor with rooms on North (-Z) and South (+Z) sides
[1, 2, 3, 4].forEach(floor => {
  const y = floor * floorH;
  roomCoordinates[`Corridor_${floor}`] = [0, y, 0]; // Special long block

  // North Rooms (Back)
  roomCoordinates[`${floor}01`] = [-9, y, -4];
  roomCoordinates[`${floor}02`] = [-3, y, -4];
  roomCoordinates[`${floor}03`] = [3, y, -4];
  roomCoordinates[`${floor}04`] = [9, y, -4];

  // South Rooms (Front)
  roomCoordinates[`${floor}05`] = [-9, y, 4];
  roomCoordinates[`${floor}06`] = [-3, y, 4];
  roomCoordinates[`${floor}07`] = [3, y, 4];
  roomCoordinates[`${floor}08`] = [9, y, 4];
});

// Exit
roomCoordinates['Main_Exit'] = [0, 0, 8];

/**
 * Calculates escape route nodes while avoiding hazards.
 * Task 4: Intelligence update to avoid blocked rooms/stairs.
 */
export const getEscapeRouteNodes = (startRoom, allHazards = []) => {
  if (!startRoom || !roomCoordinates[startRoom]) return [];

  const blocked = new Set(allHazards.map(h => h.room));
  const nodes = [startRoom];
  let current = startRoom;

  // 1. Move from Room to Floor Core/Corridor
  if (/^\d{3}$/.test(current)) { // Guest room
    const corridor = `Corridor_${current[0]}`;
    // If corridor is blocked, we still proceed to it as a last resort waypoint 
    // but logically the route is compromised.
    current = corridor;
    nodes.push(current);
  } else if (['Restaurant', 'Kitchen', 'Security', 'Utility'].includes(current)) {
    current = 'Lobby';
    nodes.push(current);
  }

  // 2. Vertical descent - Intelligent selection of Stair A vs Stair B
  if (current.startsWith('Corridor_') || current.startsWith('Lift_') || current.startsWith('Stair')) {
    const floorStr = current.includes('_F') ? current.split('_F')[1] : (current.startsWith('Corridor_') ? current.split('_')[1] : '0');
    const floor = parseInt(floorStr);

    // Task 4: Intelligence - Dynamically choose the safer stairwell
    let stairPrefix = 'StairA';
    const stairABlocked = allHazards.filter(h => h.room.startsWith('StairA')).length;
    const stairBBlocked = allHazards.filter(h => h.room.startsWith('StairB')).length;

    if (blocked.has(`StairA_F${floor}`) || (stairABlocked > stairBBlocked && !blocked.has(`StairB_F${floor}`))) {
      stairPrefix = 'StairB';
    }

    for (let f = floor; f >= 0; f--) {
      nodes.push(`${stairPrefix}_F${f}`);
    }
    current = 'Lobby';
    nodes.push(current);
  }

  // 3. Final Exit sequence
  if (current === 'Lobby') nodes.push('Main_Exit');
  return nodes;
};

// --- CRISIS DICTIONARY ---
export const crisisConfig = {
  fire: { color: '#ef4444', label: '🔥 FIRE', pulse: 15 },
  gas: { color: '#eab308', label: '☣️ GAS LEAK', pulse: 5 },
  medical: { color: '#3b82f6', label: '⚕️ MEDICAL', pulse: 2 },
  violence: { color: '#a855f7', label: '⚠️ VIOLENCE', pulse: 20 },
  lift_stuck: { color: '#f97316', label: '🛑 LIFT FAULT', pulse: 8 },
  general_emergency: { color: '#ef4444', label: '🚨 EMERGENCY', pulse: 15 },
};

// --- 3D COMPONENTS ---

export function HazardNode({ roomId, type }) {
  const meshRef = useRef();
  const position = roomCoordinates[roomId] || [0, 0, 0];

  // Backend returns uppercase (FIRE, MEDICAL), config uses lowercase
  const config = crisisConfig[type?.toLowerCase()] || crisisConfig.fire;

  // Different pulse speeds for different emergencies
  useFrame((state) => {
    // Minimum scale 1.05, maximum scale 1.2 (pulse outward only)
    const scale = 1.05 + (Math.sin(state.clock.elapsedTime * config.pulse) + 1) * 0.075;
    meshRef.current.scale.set(scale, scale, scale);
  });

  // Adjust size to cover the room
  const isCorridor = roomId.includes('Corridor');
  const size = isCorridor ? [26.5, 3, 2.5] : [5.5, 3.2, 4.5];

  return (
    <mesh ref={meshRef} position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={config.color} emissive={config.color} emissiveIntensity={1.2} transparent={false} opacity={1.0} />
      <Html position={[0, 2.5, 0]} center zIndexRange={[100, 0]}>
        <div style={{ background: config.color, color: 'white', padding: '6px 10px', fontWeight: 'bold', borderRadius: '6px', fontSize: '14px', boxShadow: '0 0 10px rgba(0,0,0,0.5)' }}>
          {config.label}
        </div>
      </Html>
    </mesh>
  );
}

export function EscapePath({ activeHazardLocation, allHazards = [] }) {
  const lineRef = useRef();

  // Internal logic to calculate path from hazard to exit via cores
  const pathNodes = useMemo(() => {
    return getEscapeRouteNodes(activeHazardLocation, allHazards);
  }, [activeHazardLocation, allHazards]);

  const points = useMemo(() => pathNodes.map(node => roomCoordinates[node]), [pathNodes]);

  useFrame(() => {
    if (lineRef.current?.material) {
      lineRef.current.material.dashOffset -= 0.015;
    }
  });

  if (points.length < 2) return null;

  return (
    <Line ref={lineRef} points={points} color="#10B981" lineWidth={10} dashed dashSize={1.2} gapSize={0.5} />
  );
}

/**
 * Handles programmatic camera movements (Fly-To logic)
 */
export function CameraController({ targetRoom, isLayoutMode, isPerspectiveMode }) {
  const { camera, controls } = useThree();

  useEffect(() => {
    // Default "Overview" coordinates
    let targetPos = [0, 7, 0];
    let camPos = [-25, 20, 25];

    // If focused on a specific room, update the target coordinates
    if (targetRoom && targetRoom !== 'OVERVIEW' && roomCoordinates[targetRoom]) {
      const [x, y, z] = roomCoordinates[targetRoom];
      targetPos = [x, y, z];
      camPos = [x + 15, y + 10, z + 15]; // Offset so we aren't inside the wall
    }

    if (isLayoutMode) {
      targetPos = [0, 0, 0];
      if (isPerspectiveMode) {
        camPos = [-30, 30, 30];
      } else {
        camPos = [0, 100, 0];
      }
    }

    // 1. Animate Camera Position
    gsap.to(camera.position, {
      x: camPos[0], y: camPos[1], z: camPos[2],
      duration: 2, ease: "power3.inOut",
    });

    // 2. Animate OrbitControls Target (Recenter the rotation point)
    if (controls) {
      gsap.to(controls.target, {
        x: targetPos[0], y: targetPos[1], z: targetPos[2],
        duration: 2, ease: "power3.inOut",
        onUpdate: () => controls.update(),
      });
    }
  }, [targetRoom, camera, controls, isLayoutMode, isPerspectiveMode]);

  return null;
}

/**
 * LayoutRoom: Allows moving and renaming rooms in Architect Mode.
 */
export function LayoutRoom({ name, position, scale = [1, 1, 1], onUpdate, isSelected, onSelect, transformMode }) {
  const { controls } = useThree();
  const meshRef = useRef();
  const [showInput, setShowInput] = useState(false);
  const [tempName, setTempName] = useState(name);

  const isCorridor = name.includes('Corridor');
  const isNew = name.startsWith('NewZone');
  const size = isCorridor ? [26.5, 3, 2.5] : (name.startsWith('Zone_') ? [1, 1, 1] : [5.5, 3.2, 4.5]);

  const handleDragEnd = useCallback(() => {
    if (meshRef.current) {
      const p = meshRef.current.position;
      const s = meshRef.current.scale;
      // Snapping logic for position is handled by TransformControls, 
      // we sync it back to state here
      onUpdate(name, [p.x, p.y, p.z], null, [s.x, s.y, s.z]);
    }
  }, [name, onUpdate]);

  return (
    <group>
      {isSelected && (
        <TransformControls
          object={meshRef}
          mode={transformMode}
          translationSnap={0.5}
          scaleSnap={0.5}
          onDraggingChanged={(e) => {
            if (controls) controls.enabled = !e.value;
          }}
          onObjectChange={handleDragEnd}
        />
      )}
      <mesh
        ref={meshRef}
        position={position}
        scale={scale}
        onClick={(e) => { e.stopPropagation(); onSelect(name); }}
        onDoubleClick={(e) => { e.stopPropagation(); setShowInput(true); }}
      >
        <boxGeometry args={size} />
        <meshStandardMaterial transparent opacity={0.2} color="#0066ff" emissive="#0066ff" emissiveIntensity={0.2} />
        <Edges color={isSelected ? "#f97316" : "#00f3ff"} threshold={15} />
      </mesh>

      {showInput && (
        <Html position={[position[0], position[1] + 2.5, position[2]]} center>
          <div style={{
            background: '#1e293b',
            padding: '5px',
            borderRadius: '4px',
            border: '1px solid #f97316',
            boxShadow: '0 0 15px rgba(249, 115, 22, 0.4)'
          }}>
            <input
              autoFocus
              style={{ background: 'transparent', color: '#f97316', border: 'none', outline: 'none', fontFamily: 'monospace', fontSize: '10px', width: '100px', textAlign: 'center' }}
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
              onBlur={() => { setShowInput(false); if (tempName !== name) onUpdate(name, null, tempName); }}
              onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
            />
          </div>
        </Html>
      )}
    </group>
  );
}

/**
 * CameraOverlay: Local MediaStream Prototype with Neon Label
 */
export function CameraOverlay({ roomId, position, label }) {
  const videoRef = useRef();

  useEffect(() => {
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (err) { console.error("Camera access denied:", err); }
    }
    startCamera();
    return () => {
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  return (
    <Html position={[position[0], position[1] + 4.5, position[2]]} center>
      <div style={{
        width: '220px', height: '160px', background: '#000', border: '2px solid #38BDF8',
        boxShadow: '0 0 25px rgba(56, 189, 248, 0.6)', overflow: 'hidden', position: 'relative'
      }}>
        <div style={{ position: 'absolute', top: 0, left: 0, padding: '2px 8px', background: '#38BDF8', color: '#000', fontSize: '10px', fontWeight: 'bold', zIndex: 10 }}>
          ZONE_CAM_{roomId.toUpperCase()}
        </div>
        <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        <div style={{
          position: 'absolute', bottom: '8px', left: '50%', transform: 'translateX(-50%)',
          width: '85%', padding: '3px', background: 'rgba(0,0,0,0.85)', border: '1px solid #00f3ff',
          color: '#00f3ff', fontSize: '11px', textAlign: 'center', textShadow: '0 0 8px #00f3ff', fontWeight: 'bold'
        }}>
          AI_CLASSIFY: {label || 'SCANNING...'}
        </div>
      </div>
    </Html>
  );
}

/**
 * AudioOverlay: Mic prototype with frequency visualizer
 */
export function AudioOverlay({ roomId, position, label }) {
  const [bars, setBars] = useState(new Array(12).fill(0));
  const analyserRef = useRef();

  useEffect(() => {
    let animationFrame;
    async function startAudio() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const update = () => {
          analyser.getByteFrequencyData(dataArray);
          setBars([...dataArray.slice(0, 12)]);
          animationFrame = requestAnimationFrame(update);
        };
        update();
      } catch (err) { console.error("Mic access denied:", err); }
    }
    startAudio();
    return () => cancelAnimationFrame(animationFrame);
  }, []);

  return (
    <Html position={[position[0], position[1] + 4.5, position[2]]} center>
      <div style={{
        width: '200px', padding: '12px', background: 'rgba(15, 23, 42, 0.95)', border: '2px solid #a855f7',
        boxShadow: '0 0 25px rgba(168, 85, 247, 0.6)', backdropFilter: 'blur(5px)'
      }}>
        <div style={{ color: '#a855f7', fontSize: '10px', fontWeight: 'bold', marginBottom: '12px', textAlign: 'center' }}>MIC_LEVEL: {roomId}</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: '3px', height: '40px', marginBottom: '12px' }}>
          {bars.map((v, i) => (
            <div key={i} style={{ width: '8px', height: `${Math.max(10, (v / 255) * 100)}%`, background: '#a855f7', borderRadius: '1px', transition: 'height 0.05s' }} />
          ))}
        </div>
        <div style={{ fontSize: '11px', color: '#cbd5e1', textAlign: 'center' }}>ACOUSTIC: <span style={{ color: '#f472b6', fontWeight: 'bold' }}>{label || 'LISTENING...'}</span></div>
      </div>
    </Html>
  );
}

/**
 * StaffMarker component to visualize staff members in 3D space.
 */
export function StaffMarker({ position, role }) {
  // Color based on role: Medical is blue, Security is purple, others are green.
  const color = role === 'medical' ? '#3b82f6' : (role === 'security' ? '#a855f7' : '#10b981');

  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[0.3, 16, 16]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={1.5}
        />
      </mesh>
      <Html distanceFactor={12} position={[0, 0.7, 0]} center>
        <div style={{
          background: color,
          color: 'white',
          padding: '2px 8px',
          borderRadius: '12px',
          fontSize: '9px',
          fontWeight: 'bold',
          whiteSpace: 'nowrap',
          border: '1px solid rgba(255,255,255,0.4)',
          boxShadow: '0 0 10px rgba(0,0,0,0.5)',
          pointerEvents: 'none'
        }}>
          {role.toUpperCase()}
        </div>
      </Html>
    </group>
  );
}

/**
 * LiteMap2D: A lightweight SVG-based schematic for lower-end devices or quick tactical views.
 */
export function LiteMap2D({ hazards = [], activeFloor = 1, onFloorChange }) {
  // Filter rooms for current floor or shared cores
  const floorRooms = Object.entries(roomCoordinates).filter(([name, pos]) => {
    if (name === 'Lobby' || name === 'Restaurant' || name === 'Kitchen' || name === 'Security' || name === 'Utility') return activeFloor === 0;
    if (name.includes(`_F${activeFloor}`)) return true;
    if (name.startsWith(activeFloor.toString())) return true;
    if (name.includes(`Corridor_${activeFloor}`)) return true;
    return false;
  });

  useEffect(() => {
    // Staggered entrance animation for rooms when floor changes
    gsap.fromTo(".lite-room", { scale: 0.8, opacity: 0 }, { scale: 1, opacity: 1, stagger: 0.02, duration: 0.4, ease: "back.out(2)" });
  }, [activeFloor]);

  return (
    <div style={{ width: '100%', height: '100%', background: '#0f172a', padding: '20px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', justifyContent: 'center' }}>
        {[0, 1, 2, 3, 4].map(f => (
          <button
            key={f}
            onClick={() => onFloorChange(f)}
            style={{
              padding: '8px 16px',
              background: activeFloor === f ? '#0ea5e9' : '#1e293b',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            F{f}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, position: 'relative', border: '2px solid #334155', borderRadius: '12px', background: '#020617', overflow: 'hidden' }}>
        {/* Animated Scanning Sweep for 2D View */}
        <div style={{
          position: 'absolute',
          width: '100%',
          height: '4px',
          background: 'rgba(56, 189, 248, 0.15)',
          boxShadow: '0 0 20px rgba(56, 189, 248, 0.4)',
          zIndex: 5,
          animation: 'scan-vertical 6s linear infinite'
        }} />

        {floorRooms.map(([name, pos]) => {
          const isHazard = hazards.find(h => h.room === name);
          const hazardConfig = isHazard ? crisisConfig[isHazard.type] : null;

          // Simple projection: mapping X/Z to percentage
          const left = 50 + (pos[0] * 3.2);
          const top = 50 + (pos[2] * 9);

          return (
            <div
              key={name}
              className="lite-room"
              style={{
                position: 'absolute',
                left: `${left}%`,
                top: `${top}%`,
                width: name.includes('Corridor') ? '60%' : '15%',
                height: '40px',
                transform: 'translate(-50%, -50%)',
                background: hazardConfig ? hazardConfig.color : '#1e293b',
                border: `1px solid ${hazardConfig ? 'white' : '#334155'}`,
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '10px',
                color: 'white',
                transition: 'all 0.3s',
                boxShadow: hazardConfig ? `0 0 15px ${hazardConfig.color}` : 'none',
                animation: hazardConfig ? 'pulse 1.5s infinite' : 'none'
              }}
            >
              {hazardConfig ? hazardConfig.label : name.replace('_', ' ')}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * CrisisMeshDashboard: The main entry point for the dashboard view.
 * Wrap your map rendering with this to get the 2D/3D toggle functionality.
 */
export function CrisisMeshDashboard({ hazards, staffPositions, escapeRoute, onRoomClick, children }) {
  const [is3D, setIs3D] = useState(true);
  const [activeFloor, setActiveFloor] = useState(1);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: '#020617' }}>
      <MapViewContainer
        is3D={is3D}
        onToggle={setIs3D}
        liteMapProps={{
          hazards,
          activeFloor,
          onFloorChange: setActiveFloor
        }}
      >
        {children}
      </MapViewContainer>

      {/* Fancy Tactical Overlay HUD (Always visible) */}
      <div style={{
        position: 'absolute',
        bottom: '24px',
        left: '24px',
        zIndex: 1000,
        pointerEvents: 'none'
      }}>
        <div style={{ borderLeft: '3px solid #0ea5e9', paddingLeft: '12px' }}>
          <p style={{ margin: 0, fontSize: '10px', color: '#64748b', letterSpacing: '2px' }}>DATA_STREAM</p>
          <p style={{ margin: 0, fontSize: '14px', color: 'white', fontWeight: 'bold' }}>
            MESH_STATUS: <span style={{ color: '#22c55e' }}>ENCRYPTED_LINK_ACTIVE</span>
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * MapViewContainer: Wraps the 3D and 2D views with a high-end toggle button.
 */
export function MapViewContainer({ is3D, onToggle, children, liteMapProps }) {
  const toggleRef = useRef(null);

  useLayoutEffect(() => {
    // High-end entrance animation for the map controls
    gsap.from(toggleRef.current, {
      y: -20,
      opacity: 0,
      duration: 1,
      delay: 0.5,
      ease: "power4.out"
    });
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Professional Toggle Switch integrated into the interface */}
      <div
        ref={toggleRef}
        style={{
          position: 'absolute',
          top: '24px',
          right: '24px',
          zIndex: 2000,
          display: 'flex',
          background: 'rgba(15, 23, 42, 0.9)',
          backdropFilter: 'blur(12px)',
          padding: '4px',
          borderRadius: '12px',
          border: '1px solid rgba(56, 189, 248, 0.3)',
          boxShadow: '0 10px 40px rgba(0,0,0,0.5)'
        }}
      >
        <div
          onClick={() => onToggle(true)}
          style={{
            padding: '10px 22px',
            borderRadius: '8px',
            background: is3D ? 'linear-gradient(135deg, #38bdf8 0%, #2563eb 100%)' : 'transparent',
            color: is3D ? 'white' : '#64748b',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: '900',
            textTransform: 'uppercase',
            letterSpacing: '1px',
            transition: '0.3s'
          }}
        >
          3D View
        </div>
        <div
          onClick={() => onToggle(false)}
          style={{
            padding: '10px 22px',
            borderRadius: '8px',
            background: !is3D ? 'linear-gradient(135deg, #38bdf8 0%, #2563eb 100%)' : 'transparent',
            color: !is3D ? 'white' : '#64748b',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: '900',
            textTransform: 'uppercase',
            letterSpacing: '1px',
            transition: '0.3s'
          }}
        >
          2D Lite
        </div>
      </div>
      {is3D ? children : <LiteMap2D {...liteMapProps} />}
    </div>
  );
}