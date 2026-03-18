import React, { useState, FormEvent, ChangeEvent } from 'react';
import type { HomePageProps } from '../types';

function HomePage({ username, onCreateRoom, onJoinRoom }: HomePageProps): JSX.Element {
  const [roomCode, setRoomCode] = useState<string>('');
  const [showJoinForm, setShowJoinForm] = useState<boolean>(false);

  const handleJoin = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (roomCode.trim().length === 6) {
      onJoinRoom(roomCode.trim());
    }
  };

  const handleRoomCodeChange = (e: ChangeEvent<HTMLInputElement>): void => {
    setRoomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''));
  };

  return (
    <div className="page home-page">
      <div className="card glass-card">
        <div className="user-greeting">
          <div className="avatar">
            {username.charAt(0).toUpperCase()}
          </div>
          <div className="greeting-text">
            <span className="greeting-label">Logged in as</span>
            <span className="greeting-name">{username}</span>
          </div>
          <div className="secure-badge">
            <span className="pulse-dot"></span>
            Secure
          </div>
        </div>

        <div className="actions-grid">
          <button 
            className="action-card create-action"
            onClick={onCreateRoom}
          >
            <div className="action-icon">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M12 8V16M8 12H16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <span className="action-title">Create Room</span>
            <span className="action-desc">Start a new encrypted conversation</span>
          </button>

          <button 
            className="action-card join-action"
            onClick={() => setShowJoinForm(!showJoinForm)}
          >
            <div className="action-icon">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M15 3H19C20.1 3 21 3.9 21 5V19C21 20.1 20.1 21 19 21H15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M10 17L15 12L10 7M15 12H3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="action-title">Join Room</span>
            <span className="action-desc">Enter with a 6-digit code</span>
          </button>
        </div>

        {showJoinForm && (
          <form className="join-form" onSubmit={handleJoin}>
            <div className="code-input-wrapper">
              <input
                type="text"
                className="input code-input"
                placeholder="XXXXXX"
                value={roomCode}
                onChange={handleRoomCodeChange}
                maxLength={6}
                autoFocus
              />
              <div className="code-helper">
                {roomCode.length}/6 characters
              </div>
            </div>
            <button 
              type="submit" 
              className="btn btn-primary"
              disabled={roomCode.length !== 6}
            >
              Request to Join
            </button>
          </form>
        )}

        <div className="info-section">
          <div className="info-item">
            <div className="info-icon">🔐</div>
            <div className="info-text">
              <span className="info-title">End-to-End Encrypted</span>
              <span className="info-desc">Messages and files encrypted before leaving your device</span>
            </div>
          </div>
          <div className="info-item">
            <div className="info-icon">👁️‍🗨️</div>
            <div className="info-text">
              <span className="info-title">Zero Knowledge</span>
              <span className="info-desc">Server never sees plaintext content</span>
            </div>
          </div>
          <div className="info-item">
            <div className="info-icon">🔑</div>
            <div className="info-text">
              <span className="info-title">Perfect Forward Secrecy</span>
              <span className="info-desc">Unique keys for each session</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default HomePage;
