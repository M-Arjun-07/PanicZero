import React from 'react';

export default function HUD({ hazards = [] }) {
  const activeCrisis = hazards[0]; // Focusing on the most recent/critical

  return (
    <div className="terminal-hud-container flicker-ui">
      <div className="terminal-status-bar">
        <div className="terminal-brand">PANIC<span style={{color: '#38BDF8'}}>ZERO</span>_CMD</div>
        <div className="terminal-stats">
          SYS_STATUS: <span style={{color: hazards.length > 0 ? '#ef4444' : '#10B981'}}>{hazards.length > 0 ? 'CRITICAL_ERR' : 'NOMINAL'}</span>
        </div>
      </div>

      {activeCrisis && activeCrisis.hospital && (
        <div style={styles.triageBanner}>
          <div style={styles.triageInfo}>
            <p style={styles.label}>EMERGENCY TRIAGE ACTIVE</p>
            <h3 style={styles.hospitalName}>{activeCrisis.hospital}</h3>
          </div>
          <div style={styles.etaBox}>
            <p style={styles.label}>AMB ETA</p>
            <p style={styles.etaValue}>{activeCrisis.ambulance_eta} MIN</p>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  brand: { fontWeight: 'bold', letterSpacing: '2px', fontSize: '18px', color: '#cbd5e1' },
  stats: { fontSize: '12px', fontWeight: 'bold', color: '#64748b' },
  triageBanner: {
    marginTop: '12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444',
    borderRadius: '4px', padding: '12px 20px', display: 'flex', justifyContent: 'space-between',
    alignItems: 'center', backdropFilter: 'blur(10px)'
  },
  label: { fontSize: '10px', margin: 0, opacity: 0.8, fontWeight: 'bold' },
  hospitalName: { margin: 0, fontSize: '16px', color: '#ef4444', textTransform: 'uppercase' },
  etaBox: { textAlign: 'right' },
  etaValue: { margin: 0, fontSize: '20px', fontWeight: '900', color: '#ef4444' }
};