import React, { useState, FormEvent, ChangeEvent } from 'react';
import authService from '../services/authService';
import type { AuthPageProps, AuthUser } from '../types';

function AuthPage({ onAuth, encryptionReady }: AuthPageProps): JSX.Element {
  const [isLogin, setIsLogin] = useState<boolean>(true);
  const [email, setEmail] = useState<string>('');
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Validate
      if (!isLogin && password !== confirmPassword) {
        throw new Error('Passwords do not match');
      }

      let result;
      if (isLogin) {
        result = await authService.login(email, password);
      } else {
        result = await authService.register(email, username, password);
      }

      // Success - pass user info to parent
      onAuth(result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = (): void => {
    setIsLogin(!isLogin);
    setError('');
  };

  const handleEmailChange = (e: ChangeEvent<HTMLInputElement>): void => {
    setEmail(e.target.value);
  };

  const handleUsernameChange = (e: ChangeEvent<HTMLInputElement>): void => {
    setUsername(e.target.value);
  };

  const handlePasswordChange = (e: ChangeEvent<HTMLInputElement>): void => {
    setPassword(e.target.value);
  };

  const handleConfirmPasswordChange = (e: ChangeEvent<HTMLInputElement>): void => {
    setConfirmPassword(e.target.value);
  };

  return (
    <div className="page auth-page">
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
        <p className="subtitle">
          {isLogin ? 'Welcome back!' : 'Create your secure account'}
        </p>
        
        <form className="form auth-form" onSubmit={handleSubmit}>
          <div className="input-wrapper">
            <input
              type="email"
              className="input"
              placeholder="Email address"
              value={email}
              onChange={handleEmailChange}
              required
              autoFocus
            />
            <div className="input-border"></div>
          </div>
          
          {!isLogin && (
            <div className="input-wrapper">
              <input
                type="text"
                className="input"
                placeholder="Username (3-20 characters)"
                value={username}
                onChange={handleUsernameChange}
                minLength={3}
                maxLength={20}
                pattern="^[a-zA-Z0-9_]+$"
                required
              />
              <div className="input-border"></div>
            </div>
          )}
          
          <div className="input-wrapper">
            <input
              type="password"
              className="input"
              placeholder="Password"
              value={password}
              onChange={handlePasswordChange}
              minLength={8}
              required
            />
            <div className="input-border"></div>
          </div>
          
          {!isLogin && (
            <div className="input-wrapper">
              <input
                type="password"
                className="input"
                placeholder="Confirm password"
                value={confirmPassword}
                onChange={handleConfirmPasswordChange}
                minLength={8}
                required
              />
              <div className="input-border"></div>
            </div>
          )}
          
          {error && (
            <div className="error-message">
              <span className="error-icon">⚠️</span>
              {error}
            </div>
          )}
          
          <button 
            type="submit" 
            className="btn btn-primary btn-large"
            disabled={loading || !encryptionReady}
          >
            {loading ? (
              <>
                <span className="loading-spinner"></span>
                {isLogin ? 'Logging in...' : 'Creating account...'}
              </>
            ) : encryptionReady ? (
              <>
                <span className="btn-icon">🔐</span>
                {isLogin ? 'Login' : 'Create Account'}
              </>
            ) : (
              <>
                <span className="loading-spinner"></span>
                Initializing Encryption...
              </>
            )}
          </button>
        </form>
        
        <div className="auth-toggle">
          <span>{isLogin ? "Don't have an account?" : "Already have an account?"}</span>
          <button type="button" className="link-btn" onClick={toggleMode}>
            {isLogin ? 'Sign up' : 'Log in'}
          </button>
        </div>

        <div className="security-badge">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="shield-icon">
            <path d="M12 2L4 6V12C4 17 8 21 12 22C16 21 20 17 20 12V6L12 2Z" stroke="currentColor" strokeWidth="1.5" fill="none"/>
            <path d="M9 12L11 14L15 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <div className="badge-text">
            <span className="badge-title">Secure Authentication</span>
            <span className="badge-desc">Passwords encrypted with bcrypt</span>
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

export default AuthPage;
