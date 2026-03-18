/**
 * E2E Encryption Module using Web Crypto API
 * Uses ECDH for key exchange and AES-GCM for message/file encryption
 */

// ==================== TYPE DEFINITIONS ====================

export interface EncryptedData {
  encryptedData: string;
  iv: string;
}

export interface EncryptedFile {
  encryptedData: ArrayBuffer;
  iv: string;
  originalName: string;
  mimeType: string;
  size: number;
}

export interface DecryptedFile {
  data: ArrayBuffer;
  name: string;
  mimeType: string;
}

// ==================== HELPER FUNCTIONS ====================

// Helper: ArrayBuffer to Base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Helper: Base64 to ArrayBuffer
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// Helper: Uint8Array to Base64
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// ==================== KEY MANAGEMENT ====================

// Generate ECDH key pair for a user
export async function generateKeyPair(): Promise<CryptoKeyPair> {
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: 'ECDH',
      namedCurve: 'P-256'
    },
    true,
    ['deriveKey', 'deriveBits']
  );
  
  return keyPair;
}

// Export public key to share with others
export async function exportPublicKey(publicKey: CryptoKey): Promise<string> {
  const exported = await window.crypto.subtle.exportKey('spki', publicKey);
  return arrayBufferToBase64(exported);
}

// Import a public key received from another user
export async function importPublicKey(base64Key: string): Promise<CryptoKey> {
  const keyData = base64ToArrayBuffer(base64Key);
  return await window.crypto.subtle.importKey(
    'spki',
    keyData,
    {
      name: 'ECDH',
      namedCurve: 'P-256'
    },
    true,
    []
  );
}

// Derive shared secret key from our private key and their public key
export async function deriveSharedKey(privateKey: CryptoKey, publicKey: CryptoKey): Promise<CryptoKey> {
  return await window.crypto.subtle.deriveKey(
    {
      name: 'ECDH',
      public: publicKey
    },
    privateKey,
    {
      name: 'AES-GCM',
      length: 256
    },
    false,
    ['encrypt', 'decrypt']
  );
}

// Generate a room encryption key (for group chats)
// All members derive the same key from room code + shared secret
export async function generateRoomKey(roomCode: string, memberPublicKeys: string[]): Promise<CryptoKey> {
  // Sort keys to ensure consistent ordering
  const sortedKeys = [...memberPublicKeys].sort();
  const combined = roomCode + sortedKeys.join('');
  
  const encoder = new TextEncoder();
  const data = encoder.encode(combined);
  
  // Hash the combined data
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
  
  // Import as AES key
  return await window.crypto.subtle.importKey(
    'raw',
    hashBuffer,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// Generate fingerprint for key verification
export async function getKeyFingerprint(publicKey: CryptoKey): Promise<string> {
  const exported = await window.crypto.subtle.exportKey('spki', publicKey);
  const hash = await window.crypto.subtle.digest('SHA-256', exported);
  const bytes = new Uint8Array(hash);
  
  // Format as readable hex groups
  let fingerprint = '';
  for (let i = 0; i < 8; i++) {
    if (i > 0) fingerprint += ' ';
    fingerprint += bytes[i].toString(16).padStart(2, '0').toUpperCase();
  }
  
  return fingerprint;
}

// ==================== MESSAGE ENCRYPTION ====================

// Encrypt a message using AES-GCM
export async function encryptMessage(sharedKey: CryptoKey, plaintext: string): Promise<EncryptedData> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);
  
  // Generate random IV for each message
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  
  const encrypted = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv
    },
    sharedKey,
    data
  );
  
  return {
    encryptedData: arrayBufferToBase64(encrypted),
    iv: arrayBufferToBase64(iv.buffer)
  };
}

// Decrypt a message using AES-GCM
export async function decryptMessage(sharedKey: CryptoKey, encryptedData: string, iv: string): Promise<string | null> {
  try {
    const decrypted = await window.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: base64ToArrayBuffer(iv)
      },
      sharedKey,
      base64ToArrayBuffer(encryptedData)
    );
    
    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch (error) {
    console.error('Decryption failed:', error);
    return null;
  }
}

// ==================== FILE ENCRYPTION ====================

/**
 * Encrypt a file using AES-GCM
 * Returns encrypted data that can be uploaded to server
 */
export async function encryptFile(sharedKey: CryptoKey, file: File): Promise<EncryptedFile> {
  // Read file as ArrayBuffer
  const fileBuffer = await file.arrayBuffer();
  
  // Generate random IV
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  
  // Encrypt the file content
  const encryptedData = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv
    },
    sharedKey,
    fileBuffer
  );
  
  return {
    encryptedData,
    iv: uint8ArrayToBase64(iv),
    originalName: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size
  };
}

/**
 * Decrypt a file using AES-GCM
 * Returns decrypted ArrayBuffer that can be converted to Blob/File
 */
export async function decryptFile(
  sharedKey: CryptoKey, 
  encryptedData: ArrayBuffer, 
  iv: string,
  originalName: string,
  mimeType: string
): Promise<DecryptedFile> {
  try {
    const decrypted = await window.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: base64ToArrayBuffer(iv)
      },
      sharedKey,
      encryptedData
    );
    
    return {
      data: decrypted,
      name: originalName,
      mimeType
    };
  } catch (error) {
    console.error('File decryption failed:', error);
    throw new Error('Failed to decrypt file');
  }
}

/**
 * Encrypt file and return as Blob for upload
 * Includes metadata (filename, mimetype) in encrypted payload
 */
export async function encryptFileForUpload(sharedKey: CryptoKey, file: File): Promise<{ blob: Blob; iv: string; metadata: string }> {
  // Create metadata object
  const metadata = {
    name: file.name,
    type: file.type || 'application/octet-stream',
    size: file.size
  };
  
  // Encrypt metadata
  const metadataEncrypted = await encryptMessage(sharedKey, JSON.stringify(metadata));
  
  // Encrypt file content
  const fileBuffer = await file.arrayBuffer();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  
  const encryptedContent = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    sharedKey,
    fileBuffer
  );
  
  // Return encrypted blob (server sees random bytes)
  return {
    blob: new Blob([encryptedContent], { type: 'application/octet-stream' }),
    iv: uint8ArrayToBase64(iv),
    metadata: JSON.stringify(metadataEncrypted) // Encrypted metadata
  };
}

/**
 * Decrypt file downloaded from server
 */
export async function decryptFileFromDownload(
  sharedKey: CryptoKey,
  encryptedBlob: Blob,
  iv: string,
  encryptedMetadata: string
): Promise<{ blob: Blob; filename: string; mimeType: string }> {
  // Decrypt metadata
  const metadataObj = JSON.parse(encryptedMetadata) as EncryptedData;
  const metadataJson = await decryptMessage(sharedKey, metadataObj.encryptedData, metadataObj.iv);
  
  if (!metadataJson) {
    throw new Error('Failed to decrypt file metadata');
  }
  
  const metadata = JSON.parse(metadataJson) as { name: string; type: string; size: number };
  
  // Decrypt file content
  const encryptedBuffer = await encryptedBlob.arrayBuffer();
  
  const decryptedContent = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToArrayBuffer(iv) },
    sharedKey,
    encryptedBuffer
  );
  
  return {
    blob: new Blob([decryptedContent], { type: metadata.type }),
    filename: metadata.name,
    mimeType: metadata.type
  };
}

/**
 * Create download link for decrypted file
 */
export function downloadDecryptedFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Display decrypted image
 */
export function createDecryptedImageUrl(blob: Blob): string {
  return URL.createObjectURL(blob);
}

// ==================== ROOM ENCRYPTION CLASS ====================

export class RoomEncryption {
  keyPair: CryptoKeyPair | null = null;
  roomKey: CryptoKey | null = null;
  publicKeyExported: string | null = null;

  async initialize(): Promise<string> {
    this.keyPair = await generateKeyPair();
    this.publicKeyExported = await exportPublicKey(this.keyPair.publicKey);
    return this.publicKeyExported;
  }

  async setRoomKey(roomCode: string, memberPublicKeys: string[]): Promise<void> {
    this.roomKey = await generateRoomKey(roomCode, memberPublicKeys);
  }

  async encrypt(plaintext: string): Promise<EncryptedData> {
    if (!this.roomKey) throw new Error('Room key not set');
    return await encryptMessage(this.roomKey, plaintext);
  }

  async decrypt(encryptedData: string, iv: string): Promise<string | null> {
    if (!this.roomKey) throw new Error('Room key not set');
    return await decryptMessage(this.roomKey, encryptedData, iv);
  }

  // NEW: File encryption methods
  async encryptFile(file: File): Promise<{ blob: Blob; iv: string; metadata: string }> {
    if (!this.roomKey) throw new Error('Room key not set');
    return await encryptFileForUpload(this.roomKey, file);
  }

  async decryptFile(encryptedBlob: Blob, iv: string, encryptedMetadata: string): Promise<{ blob: Blob; filename: string; mimeType: string }> {
    if (!this.roomKey) throw new Error('Room key not set');
    return await decryptFileFromDownload(this.roomKey, encryptedBlob, iv, encryptedMetadata);
  }

  async getFingerprint(): Promise<string> {
    if (!this.keyPair) throw new Error('Key pair not generated');
    return await getKeyFingerprint(this.keyPair.publicKey);
  }
}
