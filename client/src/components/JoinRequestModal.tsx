import React from 'react';
import type { JoinRequestModalProps, JoinRequest } from '../types';

function JoinRequestModal({ requests, onApprove, onDeny }: JoinRequestModalProps): JSX.Element | null {
  if (requests.length === 0) return null;

  const handleApprove = (request: JoinRequest): void => {
    onApprove({ requestId: request.requestId });
  };

  const handleDeny = (request: JoinRequest): void => {
    onDeny(request.requestId);
  };

  return (
    <div className="join-request-modal">
      <div className="modal-header">
        <h3>Join Requests ({requests.length})</h3>
      </div>
      <div className="request-list">
        {requests.map((request) => (
          <div key={request.requestId} className="request-item">
            <div className="request-info">
              <div className="request-avatar">
                {request.username.charAt(0).toUpperCase()}
              </div>
              <div className="request-details">
                <span className="request-username">{request.username}</span>
                <span className="request-key" title={request.publicKey}>
                  🔑 {request.publicKey.substring(0, 20)}...
                </span>
              </div>
            </div>
            <div className="request-actions">
              <button
                className="btn btn-approve"
                onClick={() => handleApprove(request)}
                title="Approve"
              >
                ✓
              </button>
              <button
                className="btn btn-deny"
                onClick={() => handleDeny(request)}
                title="Deny"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default JoinRequestModal;
