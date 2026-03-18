import { useEffect, useRef, useState } from 'react';
import { RoomEncryption } from '../crypto/encryption';
import type { EncryptionStatus } from '../types';

function useEncryption() {
  const [encryptionStatus, setEncryptionStatus] =
    useState<EncryptionStatus>('initializing');
  const encryptionRef = useRef<RoomEncryption | null>(null);

  useEffect(() => {
    let active = true;

    const initEncryption = async (): Promise<void> => {
      try {
        if (!window.crypto || !window.crypto.subtle) {
          throw new Error('Web Crypto API not available');
        }

        const encryption = new RoomEncryption();
        await encryption.initialize();

        if (!active) {
          return;
        }

        encryptionRef.current = encryption;
        setEncryptionStatus('ready');
      } catch (error) {
        if (!active) {
          return;
        }

        console.error('Encryption init failed:', error);
        setEncryptionStatus('error');
      }
    };

    initEncryption();

    return () => {
      active = false;
    };
  }, []);

  return {
    encryption: encryptionRef.current,
    encryptionRef,
    encryptionStatus,
  };
}

export default useEncryption;
