import React, { useState, useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import './LoginPortal.css';

export default function LoginPortal({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  
  const cardRef = useRef(null);
  const formRef = useRef(null);
  const bgRef = useRef(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Entrance animations
      gsap.from(cardRef.current, { y: 30, opacity: 0, duration: 1, ease: "power4.out" });
      gsap.from(".login-portal__form > *", { 
        x: -20, opacity: 0, duration: 0.5, stagger: 0.1, ease: "power2.out", delay: 0.4 
      });
      // Background pulse
      gsap.to(bgRef.current, { opacity: 0.4, duration: 2, repeat: -1, yoyo: true });
    });
    return () => ctx.revert();
  }, []);

  const handleSubmit = (event) => {
    event.preventDefault();
    const isValid = onLogin(username, password);

    if (!isValid) {
      setError('Invalid username or password.');
      return;
    }

    setError('');
  };

  return (
    <div className="login-portal">
      {/* Animated Background Elements */}
      <div ref={bgRef} style={overlayStyles.grid} />
      <div style={overlayStyles.scanline} />
      
      <div className="login-portal__card" ref={cardRef} style={{ position: 'relative', zIndex: 2 }}>
        <div className="login-portal__header">
          <div style={overlayStyles.badge}>
            <span style={overlayStyles.pulseDot} />
            <p className="login-portal__eyebrow" style={{ margin: 0 }}>CrisisMesh™ SECURE NODE</p>
          </div>
          <h1 className="login-portal__title">Secure Login</h1>
          <p className="login-portal__subtitle">Enter your credentials to access the command dashboard.</p>
        </div>

        <form className="login-portal__form" onSubmit={handleSubmit} ref={formRef}>
          <div className="login-portal__input-wrapper" style={overlayStyles.inputGroup}>
            <label className="login-portal__label" htmlFor="username">
              USERNAME
            </label>
            <div className="terminal-line">
              <span className="terminal-prompt">&gt;</span>
          <input
            id="username"
            className="login-portal__input"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder=""
          />
            </div>
          </div>

          <div className="login-portal__input-wrapper" style={overlayStyles.inputGroup}>
            <label className="login-portal__label" htmlFor="password">
              PASSWORD
            </label>
            <div className="terminal-line">
              <span className="terminal-prompt">&gt;</span>
          <input
            id="password"
            className="login-portal__input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder=""
          />
            </div>
          </div>

          {error ? <p className="login-portal__error">{error}</p> : null}

          <button className="login-portal__button" type="submit">
            <div style={{
              position: 'absolute',
              top: 0,
              left: '-100%',
              width: '100%',
              height: '100%',
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)',
              animation: 'shimmer 2s infinite'
            }} />
            SIGN IN
          </button>
        </form>
      </div>
    </div>
  );
}

const overlayStyles = {
  grid: {
    position: 'absolute',
    inset: 0,
    backgroundImage: 'linear-gradient(#1e293b 1px, transparent 1px), linear-gradient(90deg, #1e293b 1px, transparent 1px)',
    backgroundSize: '40px 40px',
    maskImage: 'radial-gradient(circle, black, transparent 80%)',
    opacity: 0.2,
  },
  scanline: {
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(to bottom, transparent 50%, rgba(56, 189, 248, 0.05) 50%)',
    backgroundSize: '100% 4px',
    pointerEvents: 'none',
    zIndex: 1,
  },
  badge: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
    justifyContent: 'center'
  },
  pulseDot: { width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444', animation: 'pulse 1.5s infinite', marginRight: '4px' },
  inputGroup: { position: 'relative', marginBottom: '24px', border: '1px solid #002B4D', padding: '8px 12px', borderRadius: '4px' }
};
