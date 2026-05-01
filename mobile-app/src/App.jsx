import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Flame, Wind, Activity, ShieldAlert, Map, Shield } from 'lucide-react';

// Connects dynamically to the local Node server on port 3000
const SOCKET_URL = `http://${window.location.hostname}:3000`;
const socket = io(SOCKET_URL);

const roomCoordinates2D = {
  // Cores
  Lift_F0: [0, 0], StairA_F0: [-14, 0], StairB_F0: [14, 0],
  Lift_F1: [0, 0], StairA_F1: [-14, 0], StairB_F1: [14, 0],
  Lift_F2: [0, 0], StairA_F2: [-14, 0], StairB_F2: [14, 0],
  Lift_F3: [0, 0], StairA_F3: [-14, 0], StairB_F3: [14, 0],
  Lift_F4: [0, 0], StairA_F4: [-14, 0], StairB_F4: [14, 0],
  // Ground
  Lobby: [0, 4], Restaurant: [8, 4], Kitchen: [8, -4], Security: [-8, 4], Utility: [-8, -4], Main_Exit: [0, 10]
};

[1, 2, 3, 4].forEach(floor => {
  roomCoordinates2D[`Corridor_${floor}`] = [0, 0];
  roomCoordinates2D[`${floor}01`] = [-9, -4];
  roomCoordinates2D[`${floor}02`] = [-3, -4];
  roomCoordinates2D[`${floor}03`] = [3, -4];
  roomCoordinates2D[`${floor}04`] = [9, -4];
  roomCoordinates2D[`${floor}05`] = [-9, 4];
  roomCoordinates2D[`${floor}06`] = [-3, 4];
  roomCoordinates2D[`${floor}07`] = [3, 4];
  roomCoordinates2D[`${floor}08`] = [9, 4];
});

export default function App() {
  const [screen, setScreen] = useState('login'); 
  const [roomNumber, setRoomNumber] = useState('');
  const [password, setPassword] = useState('');
  
  const [hazards, setHazards] = useState([]);
  const [evacRoute, setEvacRoute] = useState([]);

  useEffect(() => {
    socket.on('sync_state', (data) => {
      const currentHazards = data.hazards || [];
      const currentRoute = data.route || [];
      
      setHazards(currentHazards);
      setEvacRoute(currentRoute);

      if (currentHazards.length > 0 && screen !== 'login') {
        setScreen('crisis');
      } else if (currentHazards.length === 0 && screen === 'crisis') {
        setScreen('home');
      }
    });

    return () => {
      socket.off('sync_state');
    };
  }, [screen]);

  const handleLogin = (e) => {
    e.preventDefault();
    if (password === 'admin' && roomNumber.trim()) {
      setScreen(hazards.length > 0 ? 'crisis' : 'home');
    } else {
      alert("Invalid credentials. Use password 'admin'.");
    }
  };

  const triggerAlert = (type) => {
    const floorMatch = roomNumber.match(/\d/);
    const floorNumber = floorMatch ? floorMatch[0] : "0";
    
    // Dynamic mock route based on room number
    let mockRoute = [];
    if (floorNumber === "0" || roomNumber.toLowerCase() === "lobby") {
        mockRoute = [roomNumber, "Lobby", "Main_Exit"];
    } else {
        mockRoute = [roomNumber, `Corridor_${floorNumber}`, `StairA_F${floorNumber}`, `StairA_F0`, "Main_Exit"];
    }
    
    socket.emit("trigger_alert", {
      xray: true,
      hazards: [{ room: roomNumber, type: type }],
      route: mockRoute
    });
  };

  const renderLogin = () => (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="screen login-screen">
      <div className="login-card">
        <Shield className="logo-icon" size={48} />
        <h1>CrisisMesh</h1>
        <p>Guest Portal</p>
        <form onSubmit={handleLogin}>
          <input 
            type="text" 
            placeholder="Room (e.g. 305 or Lobby)" 
            value={roomNumber} 
            onChange={(e) => setRoomNumber(e.target.value)}
            required
          />
          <input 
            type="password" 
            placeholder="Password (admin)" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit" className="btn-primary">Authenticate</button>
        </form>
      </div>
    </motion.div>
  );

  const renderHome = () => (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="screen home-screen">
      <header>
        <h2>Welcome</h2>
        <p>Guest in Room <span className="highlight">{roomNumber}</span></p>
      </header>

      <div className="sos-container">
        <h3>EMERGENCY TRIGGERS</h3>
        <div className="grid">
          <button className="sos-btn fire" onClick={() => triggerAlert('fire')}>
            <Flame size={32} />
            <span>Fire</span>
          </button>
          <button className="sos-btn gas" onClick={() => triggerAlert('gas')}>
            <Wind size={32} />
            <span>Gas Leak</span>
          </button>
          <button className="sos-btn medical" onClick={() => triggerAlert('medical')}>
            <Activity size={32} />
            <span>Medical</span>
          </button>
          <button className="sos-btn violence" onClick={() => triggerAlert('violence')}>
            <ShieldAlert size={32} />
            <span>Violence</span>
          </button>
        </div>
        <p className="warning-text">Misuse of these alerts is a federal offense.</p>
      </div>
    </motion.div>
  );

  const renderCrisis = () => {
    // Generate map points
    const points = evacRoute.map(node => {
      const pos = roomCoordinates2D[node] || [0, 0];
      return `${pos[0] * 9 + 150},${pos[1] * 10 + 100}`;
    });
    
    const polylinePath = points.join(' ');

    return (
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="screen crisis-screen">
        <div className="crisis-header">
          <AlertTriangle size={48} className="pulse-alert" />
          <h2>EVACUATION INITIATED</h2>
          <div className="active-hazards">
            {hazards.map((h, i) => (
              <span key={i} className={`hazard-badge ${h.type}`}>
                {h.type.toUpperCase()} IN {h.room.toUpperCase()}
              </span>
            ))}
          </div>
        </div>

        <div className="map-container">
          <h3 className="map-title"><Map size={18} /> LIVE GPS NAVIGATION</h3>
          
          <div className="svg-map-wrapper">
            <svg viewBox="0 0 300 220" className="svg-map">
              {/* Floor Plan Outline Background */}
              <rect x="15" y="15" width="270" height="150" rx="15" className="map-building" />
              <text x="150" y="40" className="map-building-label">HOTEL FLOORPLAN</text>

              {/* Draw path line */}
              {points.length > 1 && (
                <>
                  <polyline points={polylinePath} className="map-path-bg" />
                  <polyline points={polylinePath} className="map-path-fg" />
                </>
              )}

              {/* Draw Nodes */}
              {evacRoute.map((node, i) => {
                const pos = roomCoordinates2D[node] || [0, 0];
                const x = pos[0] * 9 + 150;
                const y = pos[1] * 10 + 100;
                const isStart = i === 0;
                const isEnd = i === evacRoute.length - 1;
                return (
                  <g key={i}>
                    <circle 
                      cx={x} cy={y} 
                      r={isStart ? 8 : (isEnd ? 10 : 5)} 
                      className={`map-node ${isStart ? 'start' : ''} ${isEnd ? 'end' : ''}`} 
                    />
                    <text x={x} y={y - 14} className="node-label">
                      {node.replace('_', ' ')}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="route-list-mini">
            {evacRoute.length > 0 ? (
              <div className="current-instruction">
                <strong>Current Step:</strong> Proceed to <span className="highlight">{evacRoute[1] ? evacRoute[1].replace('_', ' ') : 'Safety'}</span>
              </div>
            ) : (
              <div className="calculating">Calculating GPS route...</div>
            )}
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <div className="app-container">
      <AnimatePresence mode="wait">
        {screen === 'login' && renderLogin()}
        {screen === 'home' && renderHome()}
        {screen === 'crisis' && renderCrisis()}
      </AnimatePresence>
    </div>
  );
}
