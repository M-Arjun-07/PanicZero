import React, { useState, useEffect } from 'react';
import { gsap } from 'gsap';
import { crisisConfig } from './DigitalTwin';
import { API_URL } from '../config';

/**
 * StaffPortal: A mobile-responsive list view for responders to manage active incidents.
 * @param {Array} hazards - Current list of active crisis objects.
 * @param {Function} onRefresh - Optional callback to trigger a state sync after resolution.
 */
export default function StaffPortal({ hazards = [], onRefresh }) {
  const [loadingId, setLoadingId] = useState(null);

  useEffect(() => {
    if (hazards.length > 0) {
      gsap.from(".incident-card", { opacity: 0, y: 20, stagger: 0.1, duration: 0.6, ease: "back.out(1.7)" });
    }
  }, [hazards.length]);

  const handleResolve = async (hazard) => {
    // Using room name as the unique identifier for this specific instance
    const incidentId = hazard.room;
    setLoadingId(incidentId);

    try {
        // Updated to port 8000 and matching backend POST endpoint
      const response = await fetch(`${API_URL}/api/crisis/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room: hazard.room })
      });

      if (!response.ok) throw new Error('Failed to resolve incident');
      
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error("Resolution error:", error);
      alert("Error: Could not reach central command.");
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.gridBg} />
      <header style={styles.header}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
             <div style={styles.liveIndicator} />
             <h1 style={styles.title}>Responder Portal</h1>
          </div>
          <p style={styles.subtitle}>Active Incident Management</p>
        </div>
        <div style={{ 
          ...styles.countBadge, 
          animation: hazards.length > 0 ? 'pulse-red 2s infinite' : 'none',
          backgroundColor: hazards.length > 0 ? '#ef4444' : '#1e293b' 
        }}>
          {hazards.length}
        </div>
      </header>

      <div style={styles.list}>
        {hazards.length === 0 ? (
          <div style={styles.emptyState}>
            <p>✓ All zones are currently clear</p>
          </div>
        ) : (
          hazards.map((h, idx) => {
            const config = crisisConfig[h.type] || { color: '#64748b', label: 'INCIDENT' };
            return (
              <div key={`${h.room}-${idx}`} className="incident-card" style={styles.card}>
                <div style={{ ...styles.severityBar, backgroundColor: config.color }} />
                <div style={styles.cardBody}>
                  <div style={styles.cardHeader}>
                    <span style={{ ...styles.typeTag, color: config.color }}>{config.label}</span>
                    <span style={styles.location}>Location: {h.room.replace('_', ' ')}</span>
                  </div>
                  <button 
                    style={{ 
                      ...styles.resolveBtn, 
                      opacity: loadingId === h.room ? 0.6 : 1,
                      cursor: loadingId === h.room ? 'not-allowed' : 'pointer'
                    }}
                    onClick={() => handleResolve(h)}
                    disabled={loadingId === h.room}
                  >
                    {loadingId === h.room ? 'PROCESSING...' : 'MARK AS RESOLVED'}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    maxWidth: '480px',
    margin: '0 auto',
    padding: '16px',
    backgroundColor: '#020617',
    minHeight: '100vh',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    color: '#f8fafc',
    position: 'relative',
    overflow: 'hidden'
  },
  gridBg: {
    position: 'absolute',
    inset: 0,
    backgroundImage: 'radial-gradient(#1e293b 1px, transparent 1px)',
    backgroundSize: '20px 20px',
    opacity: 0.3,
    pointerEvents: 'none'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
    borderBottom: '1px solid #1e293b',
    paddingBottom: '16px',
    position: 'relative',
    zIndex: 1
  },
  title: { fontSize: '20px', fontWeight: '800', margin: 0, color: '#38bdf8' },
  subtitle: { fontSize: '12px', color: '#94a3b8', margin: '4px 0 0 0', textTransform: 'uppercase' },
  countBadge: { background: '#1e293b', padding: '4px 12px', borderRadius: '20px', fontSize: '14px', fontWeight: 'bold' },
  liveIndicator: { width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 10px #22c55e', animation: 'pulse 2s infinite' },
  list: { display: 'flex', flexDirection: 'column', gap: '12px' },
  card: {
    background: '#0f172a',
    borderRadius: '8px',
    display: 'flex',
    overflow: 'hidden',
    border: '1px solid #1e293b',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
  },
  severityBar: { width: '6px' },
  cardBody: { flex: 1, padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' },
  cardHeader: { display: 'flex', flexDirection: 'column', gap: '2px' },
  typeTag: { fontSize: '11px', fontWeight: '900', letterSpacing: '0.5px' },
  location: { fontSize: '16px', fontWeight: '600' },
  resolveBtn: {
    backgroundColor: 'transparent',
    color: '#22c55e',
    border: '1px solid #22c55e',
    padding: '10px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: 'bold',
    transition: 'all 0.2s',
    textAlign: 'center',
    letterSpacing: '1px',
  },
  emptyState: { textAlign: 'center', padding: '40px 20px', color: '#22c55e', fontWeight: '600' }
};