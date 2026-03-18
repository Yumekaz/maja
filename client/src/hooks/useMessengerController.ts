import { useEffect, useRef, useState } from 'react';
import socket, { reconnectWithAuth } from '../socket';
import authService from '../services/authService';
import useEncryption from './useEncryption';
import useToast from './useToast';
import type {
  AppPage,
  AuthUser,
  EncryptionStatus,
  JoinApprovedPayload,
  JoinRequest,
  RoomCreatedPayload,
  RoomState,
  RoomType,
  ServerToClientEvents,
} from '../types';

function resolveAppPage(useNewAuth: boolean): AppPage {
  return useNewAuth ? 'auth' : 'username';
}

function normalizeRoomType(roomType?: RoomType): RoomType {
  return roomType || 'legacy';
}

interface UseMessengerControllerResult {
  currentPage: AppPage;
  currentRoom: RoomState | null;
  encryption: ReturnType<typeof useEncryption>['encryption'];
  encryptionStatus: EncryptionStatus;
  isAuthenticated: boolean;
  joinRequests: JoinRequest[];
  toast: ReturnType<typeof useToast>['toast'];
  useNewAuth: boolean;
  username: string;
  handleApproveJoin: (data: { requestId: string }) => Promise<void>;
  handleAuth: (user: AuthUser) => Promise<void>;
  handleCreateRoom: () => void;
  handleDenyJoin: (requestId: string) => void;
  handleJoinRoom: (roomCode: string) => void;
  handleLeaveRoom: () => void;
  handleLogout: () => Promise<void>;
  handleRegister: (name: string) => Promise<void>;
  handleUpdateRoomKey: (memberKeys: Record<string, string>) => Promise<void>;
  toggleAuthMode: () => void;
}

function useMessengerController(): UseMessengerControllerResult {
  const [isAuthenticated, setIsAuthenticated] = useState(authService.isAuthenticated());
  const [useNewAuth, setUseNewAuth] = useState(true);
  const [currentPage, setCurrentPage] = useState<AppPage>('auth');
  const [username, setUsername] = useState('');
  const [currentRoom, setCurrentRoom] = useState<RoomState | null>(null);
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);

  const pendingRoomCodeRef = useRef<string | null>(null);
  const usernameRef = useRef('');
  const currentRoomRef = useRef<RoomState | null>(null);
  const { toast, showToast } = useToast();
  const showToastRef = useRef(showToast);
  const { encryption, encryptionRef, encryptionStatus } = useEncryption();

  useEffect(() => {
    usernameRef.current = username;
  }, [username]);

  useEffect(() => {
    currentRoomRef.current = currentRoom;
  }, [currentRoom]);

  useEffect(() => {
    showToastRef.current = showToast;
  }, [showToast]);

  const emitRegistration = (nextUsername: string): boolean => {
    const publicKey = encryptionRef.current?.publicKeyExported;
    if (!nextUsername || !publicKey) {
      return false;
    }

    socket.emit('register', {
      username: nextUsername,
      publicKey,
    });

    return true;
  };

  const requestJoinRoom = (roomCode: string): void => {
    socket.emit('request-join', { roomCode: roomCode.toUpperCase() });
    showToastRef.current('Join request sent...', 'info');
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');

    if (roomParam) {
      pendingRoomCodeRef.current = roomParam;

      if (!authService.isAuthenticated()) {
        setUseNewAuth(false);
      }

      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  useEffect(() => {
    const storedUser = authService.getUser();

    if (!authService.isAuthenticated() || !storedUser) {
      setIsAuthenticated(false);
      setCurrentPage(resolveAppPage(useNewAuth));
      return;
    }

    setUsername(storedUser.username);
    setIsAuthenticated(true);
    setCurrentPage('home');
    reconnectWithAuth();

    if (encryptionStatus !== 'ready') {
      return;
    }

    const registerOnConnect = () => {
      emitRegistration(storedUser.username);
      socket.off('connect', registerOnConnect);
    };

    const registerTimer = setTimeout(() => {
      if (socket.connected && emitRegistration(storedUser.username)) {
        return;
      }

      if (!socket.connected) {
        socket.on('connect', registerOnConnect);
      }
    }, 500);

    return () => {
      clearTimeout(registerTimer);
      socket.off('connect', registerOnConnect);
    };
  }, [useNewAuth, encryptionStatus]);

  useEffect(() => {
    if (encryptionStatus !== 'ready') {
      return;
    }

    const handleConnect = () => {
      const storedUser = authService.getUser();
      emitRegistration(storedUser?.username || usernameRef.current);
    };

    socket.on('connect', handleConnect);

    if (socket.connected && (authService.getUser()?.username || usernameRef.current)) {
      handleConnect();
    }

    return () => {
      socket.off('connect', handleConnect);
    };
  }, [encryptionStatus]);

  useEffect(() => {
    const handleRegistered: ServerToClientEvents['registered'] = ({
      username: acceptedUsername,
    }) => {
      setUsername(acceptedUsername);
      setCurrentPage('home');
      showToastRef.current('🔐 Secure session started', 'success');

      const pendingRoomCode = pendingRoomCodeRef.current;
      if (pendingRoomCode) {
        pendingRoomCodeRef.current = null;
        requestJoinRoom(pendingRoomCode);
      }
    };

    const handleUsernameTaken: ServerToClientEvents['username-taken'] = () => {
      showToastRef.current('Username taken. Try another!', 'error');
    };

    const handleRoomCreated: ServerToClientEvents['room-created'] = async ({
      roomId,
      roomCode,
      roomType,
    }: RoomCreatedPayload) => {
      const publicKey = encryptionRef.current?.publicKeyExported;
      if (!encryptionRef.current || !publicKey) {
        return;
      }

      await encryptionRef.current.setRoomKey(roomCode, [publicKey]);

      setCurrentRoom({
        roomId,
        roomCode,
        isOwner: true,
        memberKeys: { [usernameRef.current]: publicKey },
        roomType: normalizeRoomType(roomType),
      });
      setCurrentPage('room');

      const typeLabel =
        normalizeRoomType(roomType) === 'authenticated' ? ' (Authenticated)' : ' (Legacy)';
      showToastRef.current(`Room ${roomCode} created${typeLabel}`, 'success');
    };

    const handleJoinRequest: ServerToClientEvents['join-request'] = (request) => {
      setJoinRequests((prev) => [...prev, request]);
      showToastRef.current(`${request.username} wants to join`, 'info');
    };

    const handleJoinApproved: ServerToClientEvents['join-approved'] = async ({
      roomId,
      roomCode,
      roomType,
      memberKeys,
    }: JoinApprovedPayload) => {
      if (!encryptionRef.current) {
        return;
      }

      await encryptionRef.current.setRoomKey(roomCode, Object.values(memberKeys));

      setCurrentRoom({
        roomId,
        roomCode,
        isOwner: false,
        memberKeys,
        roomType: normalizeRoomType(roomType),
      });
      setCurrentPage('room');

      const typeLabel = normalizeRoomType(roomType) === 'authenticated' ? ' (Authenticated)' : '';
      showToastRef.current(`🔐 Joined secure room${typeLabel}`, 'success');
    };

    const handleJoinDenied: ServerToClientEvents['join-denied'] = () => {
      showToastRef.current('Join request denied', 'error');
    };

    const handleSocketError: ServerToClientEvents['error'] = ({ message }) => {
      showToastRef.current(message, 'error');
    };

    const handleRoomClosed: ServerToClientEvents['room-closed'] = () => {
      setCurrentRoom(null);
      setCurrentPage('home');
      showToastRef.current('Room was closed by owner', 'error');
    };

    socket.on('registered', handleRegistered);
    socket.on('username-taken', handleUsernameTaken);
    socket.on('room-created', handleRoomCreated);
    socket.on('join-request', handleJoinRequest);
    socket.on('join-approved', handleJoinApproved);
    socket.on('join-denied', handleJoinDenied);
    socket.on('error', handleSocketError);
    socket.on('room-closed', handleRoomClosed);

    return () => {
      socket.off('registered', handleRegistered);
      socket.off('username-taken', handleUsernameTaken);
      socket.off('room-created', handleRoomCreated);
      socket.off('join-request', handleJoinRequest);
      socket.off('join-approved', handleJoinApproved);
      socket.off('join-denied', handleJoinDenied);
      socket.off('error', handleSocketError);
      socket.off('room-closed', handleRoomClosed);
    };
  }, []);

  const handleAuth = async (user: AuthUser): Promise<void> => {
    setUsername(user.username);
    setIsAuthenticated(true);
    reconnectWithAuth();

    const registerAfterConnect = () => {
      if (encryptionStatus === 'ready') {
        emitRegistration(user.username);
      }

      socket.off('connect', registerAfterConnect);
    };

    if (socket.connected) {
      registerAfterConnect();
      return;
    }

    socket.on('connect', registerAfterConnect);
  };

  const handleLogout = async (): Promise<void> => {
    await authService.logout();
    setIsAuthenticated(false);
    setUsername('');
    setCurrentRoom(null);
    setJoinRequests([]);
    setCurrentPage(resolveAppPage(useNewAuth));
    showToastRef.current('Logged out successfully', 'success');
  };

  const handleRegister = async (name: string): Promise<void> => {
    if (encryptionStatus !== 'ready') {
      showToastRef.current('Encryption initializing...', 'info');
      return;
    }

    emitRegistration(name);
  };

  const handleCreateRoom = (): void => {
    socket.emit('create-room');
  };

  const handleJoinRoom = (roomCode: string): void => {
    requestJoinRoom(roomCode);
  };

  const handleApproveJoin = async ({ requestId }: { requestId: string }): Promise<void> => {
    socket.emit('approve-join', { requestId });
    setJoinRequests((prev) => prev.filter((request) => request.requestId !== requestId));
  };

  const handleDenyJoin = (requestId: string): void => {
    socket.emit('deny-join', { requestId });
    setJoinRequests((prev) => prev.filter((request) => request.requestId !== requestId));
  };

  const handleUpdateRoomKey = async (
    memberKeys: Record<string, string>
  ): Promise<void> => {
    const room = currentRoomRef.current;
    if (!room || !encryptionRef.current) {
      return;
    }

    await encryptionRef.current.setRoomKey(room.roomCode, Object.values(memberKeys));
    setCurrentRoom((prev) => (prev ? { ...prev, memberKeys } : null));
  };

  const handleLeaveRoom = (): void => {
    const room = currentRoomRef.current;
    if (room) {
      socket.emit('leave-room', { roomId: room.roomId });
    }

    setCurrentRoom(null);
    setCurrentPage('home');
  };

  const toggleAuthMode = (): void => {
    setUseNewAuth((prev) => {
      const next = !prev;
      setCurrentPage(resolveAppPage(next));
      return next;
    });
  };

  return {
    currentPage,
    currentRoom,
    encryption,
    encryptionStatus,
    isAuthenticated,
    joinRequests,
    toast,
    useNewAuth,
    username,
    handleApproveJoin,
    handleAuth,
    handleCreateRoom,
    handleDenyJoin,
    handleJoinRoom,
    handleLeaveRoom,
    handleLogout,
    handleRegister,
    handleUpdateRoomKey,
    toggleAuthMode,
  };
}

export default useMessengerController;
