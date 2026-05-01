import React from 'react';

export default function Sidebar({ onTriggerSim, isXRay, setIsXRay }) {
  const simEvents = [
    { type: 'fire', label: 'Simulate Fire', location: 'Kitchen' },
    { type: 'medical', label: 'Simulate Medical', location: 'Lobby' },
    { type: 'violence', label: 'Simulate Violence', location: 'Restaurant' }
  ];

  return (
    <div className="terminal-sidebar flicker-ui">
      <div className="secure-node-header">
        <span className="dot-red">●</span>
        <span className="node-text">CRISISMESH™ SECURE NODE</span>
      </div>

      <h2 className="node-text" style={{ fontSize: '14px', margin: 0 }}>CONTROLS</h2>
      
      <div className="terminal-group" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <p className="node-text" style={{ fontSize: '11px', opacity: 0.6 }}>LAYOUT_MODE</p>
        <button 
          className="terminal-button"
          style={{ padding: '10px', background: 'transparent', border: '1px solid #002B4D', cursor: 'pointer', color: isXRay ? '#38BDF8' : '#64748b' }}
          onClick={() => setIsXRay(!isXRay)}
        >
          {isXRay ? '[ MODE_XRAY_ACTIVE ]' : '[ MODE_STANDARD ]'}
        </button>
      </div>

      <div className="terminal-group" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <p className="node-text" style={{ fontSize: '11px', opacity: 0.6 }}>SIM_VECTORS</p>
        {simEvents.map(ev => (
          <button 
            key={ev.type} 
            className="terminal-button"
            style={{ padding: '10px', background: 'transparent', border: '1px solid #002B4D', color: '#cbd5e1', cursor: 'pointer', textAlign: 'left' }}
            onClick={() => onTriggerSim(ev.type, ev.location, 'Simulated Event')}
          >
            [ EXECUTE_{ev.type.toUpperCase()} ]
          </button>
        ))}
      </div>
    </div>
  );
}