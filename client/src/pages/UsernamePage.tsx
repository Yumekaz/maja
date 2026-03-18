import React, { useState, FormEvent, ChangeEvent } from 'react';

interface UsernamePageProps {
  onRegister: (name: string) => void;
  encryptionReady: boolean;
}

function UsernamePage({ onRegister, encryptionReady }: UsernamePageProps): JSX.Element {
  const [name, setName] = useState<string>('');

  const handleSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (name.trim() && encryptionReady) {
      onRegister(name.trim());
    }
  };

  const handleNameChange = (e: ChangeEvent<HTMLInputElement>): void => {
    setName(e.target.value);
  };

  return (
    <div className="page username-page">
      <div className="card glass-card">
        <div className="logo-container">
          <div className="logo-icon">
            <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M24 4L4 14V34L24 44L44 34V14L24 4Z" stroke="currentColor" strokeWidth="2" fill="none"/>
              <path d="M24 18C21.5 18 19 20.5 19 24C19 27.5 21.5 30 24 30C26.5 30 29 27.5 29 24C29 20.5 26.5 18 24 18Z" stroke="currentColor" strokeWidth="2" fill="none"/>
              <path d="M24 12V18M24 30V36M12 20H19M29 20H36M14 28L19 25M29 25L34 28M14 16L19 21M29 21L34 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <div className="logo-glow"></div>
        </div>
        
        <h1>SecureChat</h1>
        <p className="subtitle">End-to-end encrypted messaging</p>
        
        <form className="form" onSubmit={handleSubmit}>
          <div className="input-wrapper">
            <input
              type="text"
              className="input"
              placeholder="Choose your username"
              value={name}
              onChange={handleNameChange}
              maxLength={20}
              autoFocus
            />
            <div className="input-border"></div>
          </div>
          
          <button 
            type="submit" 
            className="btn btn-primary btn-large"
            disabled={!name.trim() || !encryptionReady}
          >
            {encryptionReady ? (
              <>
                <span className="btn-icon">🔐</span>
                Start Secure Session
              </>
            ) : (
              <>
                <span className="loading-spinner"></span>
                Generating Keys...
              </>
            )}
          </button>
        </form>

        <div className="security-badge">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="shield-icon">
            <path d="M12 2L4 6V12C4 17 8 21 12 22C16 21 20 17 20 12V6L12 2Z" stroke="currentColor" strokeWidth="1.5" fill="none"/>
            <path d="M9 12L11 14L15 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <div className="badge-text">
            <span className="badge-title">Zero-knowledge encryption</span>
            <span className="badge-desc">Server cannot read your messages</span>
          </div>
        </div>
      </div>
      
      <div className="floating-particles">
        {[...Array(6)].map((_, i) => (
          <div key={i} className={`particle particle-${i + 1}`}></div>
        ))}
      </div>
    </div>
  );
}

export default UsernamePage;
