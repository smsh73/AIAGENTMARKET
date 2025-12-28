import { Server as SocketIOServer, Socket } from 'socket.io';
import http from 'http';
import jwt from 'jsonwebtoken';
import { logger } from './logger.js';

let io: SocketIOServer | null = null;

interface AuthenticatedSocket extends Socket {
  userId?: number;
  userEmail?: string;
}

export function initSocketIO(server: http.Server): SocketIOServer {
  io = new SocketIOServer(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      logger.info('WebSocket connection without auth - allowing for now', {
        screenName: 'WebSocket',
        callerFunction: 'auth.middleware',
        socketId: socket.id,
        logType: 'info',
      });
      return next();
    }

    try {
      const jwtSecret = process.env.JWT_SECRET || 'development-secret-key-min-32-chars';
      const decoded = jwt.verify(token, jwtSecret) as { userId: number; email: string };
      socket.userId = decoded.userId;
      socket.userEmail = decoded.email;
      logger.info('WebSocket authenticated', {
        screenName: 'WebSocket',
        callerFunction: 'auth.middleware',
        userId: decoded.userId,
        socketId: socket.id,
        logType: 'success',
      });
      next();
    } catch (error) {
      logger.info('WebSocket auth failed - allowing anonymous', {
        screenName: 'WebSocket',
        callerFunction: 'auth.middleware',
        error: error instanceof Error ? error.message : 'Unknown error',
        socketId: socket.id,
        logType: 'warning',
      });
      next();
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    logger.info('WebSocket client connected', {
      screenName: 'WebSocket',
      callerFunction: 'io.connection',
      socketId: socket.id,
      userId: socket.userId,
      logType: 'info',
    });

    socket.on('join_chat', (data: { conversationId?: string; userId?: number }) => {
      const room = data.conversationId ? `chat_${data.conversationId}` : `user_${data.userId}`;
      socket.join(room);
      logger.info('Client joined room', {
        screenName: 'WebSocket',
        callerFunction: 'join_chat',
        room,
        socketId: socket.id,
        logType: 'info',
      });
    });

    socket.on('start_a2a', (data: { sessionId: string }, callback?: (ack: { joined: boolean }) => void) => {
      const room = `a2a_${data.sessionId}`;
      socket.join(room);
      logger.info('A2A session room joined', {
        screenName: 'WebSocket',
        callerFunction: 'start_a2a',
        sessionId: data.sessionId,
        room,
        socketId: socket.id,
        logType: 'info',
      });
      if (callback) {
        callback({ joined: true });
      }
      socket.emit('a2a_joined', { sessionId: data.sessionId, room });
    });

    socket.on('disconnect', () => {
      logger.info('WebSocket client disconnected', {
        screenName: 'WebSocket',
        callerFunction: 'io.disconnect',
        socketId: socket.id,
        logType: 'info',
      });
    });
  });

  logger.info('Socket.io initialized', {
    screenName: 'WebSocket',
    callerFunction: 'initSocketIO',
    logType: 'success',
  });

  return io;
}

export function getIO(): SocketIOServer {
  if (!io) {
    throw new Error('Socket.io not initialized. Call initSocketIO first.');
  }
  return io;
}
