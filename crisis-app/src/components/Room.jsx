import React from 'react';
import { Html } from '@react-three/drei';

const floorH = 3.5;

/**
 * Room: A standalone 3D component representing building zones.
 */
export function Room({ name, position, size: propSize, isXRay, onClick }) {
  const isLift = name.includes('Lift');
  const isStair = name.includes('Stair');
  const isCorridor = name.includes('Corridor');
  const isCore = isLift || isStair || isCorridor;
  
  // Dynamic Sizing based on room type
  let size = propSize || [5, 2.8, 4]; // Default Room Size
  if (isLift) size = [2.5, floorH, 3];
  if (isStair) size = [3, floorH, 4];
  if (isCorridor) size = [26, 2.5, 2]; // Long central strip

  let color = "#334155"; // Default Slate
  if (isCorridor) color = "#475569";
  if (!isCore) color = "#0ea5e9"; // Rooms are light blue

  const opacity = isXRay ? 0.1 : (isCore ? 0.4 : 0.85);

  return (
    <mesh position={position} onClick={(e) => { e.stopPropagation(); onClick(name); }}>
      <boxGeometry args={size} />
      <meshStandardMaterial 
        color={color} 
        transparent 
        opacity={opacity} 
        wireframe={isXRay && isCore} 
      />
      
      {/* Hide labels if X-Ray is off to make it look cleaner, unless it's the ground floor */}
      {(isXRay || position[1] === 0) && !isCorridor && (
        <Html position={[0, 1.5, 0]} center zIndexRange={[100, 0]}>
          <div style={{ 
            color: '#cbd5e1', 
            background: 'rgba(15,23,42,0.8)', 
            padding: '2px 4px', 
            fontSize: '9px', 
            borderRadius: '3px', 
            border: '1px solid #334155' 
          }}>
            {name.replace('_', ' ')}
          </div>
        </Html>
      )}
    </mesh>
  );
}