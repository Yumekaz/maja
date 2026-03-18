interface AuthModeToggleProps {
  useNewAuth: boolean;
  onToggle: () => void;
}

function AuthModeToggle({ useNewAuth, onToggle }: AuthModeToggleProps): JSX.Element {
  return (
    <button
      onClick={onToggle}
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        padding: '8px 16px',
        background: 'rgba(255,255,255,0.1)',
        border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: '8px',
        color: '#888',
        fontSize: '12px',
        cursor: 'pointer',
      }}
    >
      {useNewAuth ? 'Use Legacy Mode' : 'Use Auth Mode'}
    </button>
  );
}

export default AuthModeToggle;
