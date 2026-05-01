import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, ContactShadows, Environment } from '@react-three/drei';
import Room from './Room';
import { 
  roomCoordinates, 
  HazardNode, 
  EscapeRoute, 
  CameraController, 
  StaffMarker 
} from '../DigitalTwin';

export default function Scene({ 
  hazards = [], 
  staffPositions = [], 
  escapeRoute = [], 
  isXRay = false, 
  targetRoom = 'OVERVIEW', 
  onRoomClick 
}) {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <Canvas camera={{ position: [-25, 20, 25], fov: 45 }}>
        <Suspense fallback={null}>
          <ambientLight intensity={0.5} />
          <pointLight position={[10, 10, 10]} intensity={1} />
          <spotLight position={[-10, 20, 10]} angle={0.15} penumbra={1} intensity={2} castShadow />
          
          <CameraController targetRoom={targetRoom} />
          
          {/* Render Building Structure */}
          {Object.entries(roomCoordinates).map(([name, pos]) => (
            <Room key={name} name={name} position={pos} isXRay={isXRay} onClick={onRoomClick} />
          ))}

          {/* Dynamic Overlays */}
          {hazards.map((h, idx) => (
            <HazardNode key={`hazard-${idx}`} roomId={h.room} type={h.type} />
          ))}

          {staffPositions.map((s, idx) => (
            <StaffMarker key={`staff-${idx}`} position={roomCoordinates[s.zone]} role={s.role} />
          ))}

          {escapeRoute.length > 0 && <EscapeRoute pathNodes={escapeRoute} />}

          <OrbitControls makeDefault minDistance={10} maxDistance={60} />
          <Environment preset="city" />
          <ContactShadows position={[0, -0.01, 0]} opacity={0.4} scale={40} blur={2} far={4} />
        </Suspense>
      </Canvas>
    </div>
  );
}