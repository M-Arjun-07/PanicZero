import React, { useEffect, useRef, useState } from 'react';

export default function TerminalFeed({ logs = [], hazards = [], onHazardClick }) {
  const scrollRef = useRef();
  const [isMinimized, setIsMinimized] = useState(false);

  useEffect(() => {
    if (scrollRef.current && !isMinimized) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, hazards, isMinimized]);

  return (
    <div style={{ ...styles.container, height: isMinimized ? '32px' : '200px' }}>
      <div 
        style={{ ...styles.header, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        onClick={() => setIsMinimized(!isMinimized)}
      >
        <span>SYSTEM_FEED</span>
        <span>{isMinimized ? '[ + ]' : '[ - ]'}</span>
      </div>
      {!isMinimized && (
        <div ref={scrollRef} style={styles.logArea}>
          {hazards.map((h, i) => (
            <div 
              key={`hazard-${i}`} 
              style={{ ...styles.logLine, borderLeft: '2px solid #ef4444', cursor: 'pointer', background: 'rgba(239, 68, 68, 0.1)', marginTop: '4px' }} 
              className="typing-text"
              onClick={() => onHazardClick && onHazardClick(h.room)}
            >
              <span style={{ color: '#ef4444', fontWeight: 'bold', animation: 'blink 1s infinite' }}>! </span>
              <span style={styles.timestamp}>[{new Date().toLocaleTimeString()}]</span>
              <span style={{ color: '#f87171', fontWeight: 'bold' }}> [CRISIS] {h.room}: </span>
              <span style={styles.message}>{h.type.toUpperCase()}</span>
            </div>
          ))}

          {logs.length === 0 && hazards.length === 0 && <div style={styles.empty}>Waiting for network events...</div>}
          
          {logs.map((log, i) => (
            <div key={`log-${i}`} style={styles.logLine} className="typing-text">
              <span style={styles.timestamp}>[{new Date().toLocaleTimeString()}]</span>
              <span style={styles.message}> {log}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    position: 'absolute', bottom: 80, right: 24, width: '320px', height: '200px',
    background: 'rgba(0, 0, 0, 0.7)', border: '1px solid #002B4D', borderRadius: '4px',
    display: 'flex', flexDirection: 'column', overflow: 'hidden', backdropFilter: 'blur(10px)', 
    zIndex: 1000, fontFamily: 'monospace'
  },
  header: { background: 'rgba(0, 43, 77, 0.3)', padding: '6px 12px', fontSize: '11px', color: '#38BDF8', borderBottom: '1px solid #002B4D', fontWeight: 'bold' },
  logArea: { flex: 1, padding: '12px', overflowY: 'auto', fontFamily: 'monospace', fontSize: '11px' },
  logLine: { marginBottom: '6px', borderLeft: '2px solid #38BDF8', paddingLeft: '8px', padding: '4px 8px' },
  timestamp: { color: '#64748b' },
  message: { color: '#cbd5e1' },
  empty: { color: '#334155', fontStyle: 'italic', textAlign: 'center', marginTop: '40px' }
};