import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { API_URL } from '../config';
import { refreshSession } from '../api/client';
import { getAccessToken } from '../api/tokenStore';
import { useAuth } from '../auth/AuthContext';
import { goToGame } from '../navigation/navigationRef';

export type Color = 'w' | 'b';

export interface Side {
  userId: string | null;
  displayName: string;
  rating: number | null;
  isComputer: boolean;
}

export interface Clocks {
  white: number;
  black: number;
}

export interface GameEnd {
  result: 'WHITE_WIN' | 'BLACK_WIN' | 'DRAW' | 'ABORTED';
  termination: string | null;
  winner: Color | null;
  ratings: { white: { before: number; after: number }; black: { before: number; after: number } } | null;
}

export interface GameState {
  gameId: string;
  mode: 'RATED' | 'CASUAL' | 'VS_COMPUTER';
  timeControl: { initialSeconds: number; incrementSeconds: number; label: string };
  white: Side;
  black: Side;
  yourColor: Color;
  fen: string;
  turn: Color;
  moves: string[];
  lastMove: { from: string; to: string } | null;
  clocks: Clocks | null;
  clocksRunning: boolean;
  // Local time the clocks were last reported, used to tick the running clock
  clocksAt: number;
  status: 'ACTIVE' | 'ENDED';
  drawOfferBy: Color | null;
  opponentDisconnected: boolean;
  end: GameEnd | null;
}

interface Ack<T = unknown> {
  ok: boolean;
  data?: T;
  code?: string;
  message?: string;
}

export class GameActionError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

interface GameApi {
  connected: boolean;
  game: GameState | null;
  searching: string | null;
  joinQueue(timeControl: string): Promise<void>;
  leaveQueue(): Promise<void>;
  playComputer(level: number, color: 'white' | 'black' | 'random'): Promise<void>;
  move(from: string, to: string, promotion?: string): Promise<void>;
  resign(): Promise<void>;
  abort(): Promise<void>;
  offerDraw(): Promise<void>;
  respondDraw(accept: boolean): Promise<void>;
  clearGame(): void;
}

const GameContext = createContext<GameApi | null>(null);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  // Reconnect only when the signed-in account changes, not when the profile/rating is refreshed
  const userId = user?.id;
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [game, setGame] = useState<GameState | null>(null);
  const [searching, setSearching] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return undefined;

    const socket = io(API_URL, {
      transports: ['websocket'],
      // Function form: every (re)connect uses the newest access token
      auth: (cb) => cb({ token: getAccessToken() }),
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', async (err: Error & { data?: { code?: string } }) => {
      if (err.data?.code === 'TOKEN_EXPIRED' || err.data?.code === 'UNAUTHORIZED') {
        if (await refreshSession()) socket.connect();
      }
    });

    const fullState = (state: Omit<GameState, 'clocksAt' | 'opponentDisconnected' | 'end'>) => {
      setSearching(null);
      setGame({ ...state, clocksAt: Date.now(), opponentDisconnected: false, end: null });
    };
    // A new game opens the board; a reconnect only restores state (Play shows "Resume game")
    socket.on('game:start', (state) => {
      fullState(state);
      goToGame();
    });
    socket.on('game:state', fullState);

    socket.on('queue:joined', ({ timeControl }: { timeControl: string }) => setSearching(timeControl));

    socket.on('game:move', (msg: {
      gameId: string;
      move: { from: string; to: string; san: string };
      fen: string;
      turn: Color;
      clocks: Clocks | null;
      clocksRunning: boolean;
    }) => {
      setGame((g) =>
        g && g.gameId === msg.gameId
          ? {
              ...g,
              fen: msg.fen,
              turn: msg.turn,
              moves: [...g.moves, msg.move.san],
              lastMove: { from: msg.move.from, to: msg.move.to },
              clocks: msg.clocks,
              clocksRunning: msg.clocksRunning,
              clocksAt: Date.now(),
              drawOfferBy: null,
            }
          : g,
      );
    });

    socket.on('game:end', (msg: GameEnd & { gameId: string }) => {
      setGame((g) => (g && g.gameId === msg.gameId ? { ...g, status: 'ENDED', clocksRunning: false, end: msg } : g));
    });
    socket.on('game:drawOffer', ({ gameId, by }: { gameId: string; by: Color }) =>
      setGame((g) => (g && g.gameId === gameId ? { ...g, drawOfferBy: by } : g)),
    );
    socket.on('game:drawDeclined', ({ gameId }: { gameId: string }) =>
      setGame((g) => (g && g.gameId === gameId ? { ...g, drawOfferBy: null } : g)),
    );
    socket.on('game:opponentDisconnected', ({ gameId }: { gameId: string }) =>
      setGame((g) => (g && g.gameId === gameId ? { ...g, opponentDisconnected: true } : g)),
    );
    socket.on('game:opponentReconnected', ({ gameId }: { gameId: string }) =>
      setGame((g) => (g && g.gameId === gameId ? { ...g, opponentDisconnected: false } : g)),
    );

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
      setGame(null);
      setSearching(null);
    };
  }, [userId]);

  const emit = useCallback(<T,>(event: string, payload?: object) => {
    return new Promise<T | undefined>((resolve, reject) => {
      const socket = socketRef.current;
      if (!socket || !socket.connected) {
        reject(new GameActionError('OFFLINE', 'Not connected to the game server'));
        return;
      }
      socket.timeout(10000).emit(event, payload ?? {}, (err: Error | null, ack: Ack<T>) => {
        if (err) reject(new GameActionError('TIMEOUT', 'The server did not respond'));
        else if (!ack.ok) reject(new GameActionError(ack.code ?? 'ERROR', ack.message ?? 'Action failed'));
        else resolve(ack.data);
      });
    });
  }, []);

  // Current game id read through a ref so the actions below stay stable across renders
  const gameIdRef = useRef<string | null>(null);
  gameIdRef.current = game?.gameId ?? null;

  const actions = useMemo(
    () => ({
      async joinQueue(timeControl: string) {
        await emit('queue:join', { timeControl });
        setSearching(timeControl);
      },
      async leaveQueue() {
        setSearching(null);
        await emit('queue:leave').catch(() => {});
      },
      async playComputer(level: number, color: 'white' | 'black' | 'random') {
        await emit('game:computer', { level, color });
      },
      async move(from: string, to: string, promotion?: string) {
        await emit('game:move', { gameId: gameIdRef.current, from, to, promotion });
      },
      async resign() {
        await emit('game:resign', { gameId: gameIdRef.current });
      },
      async abort() {
        await emit('game:abort', { gameId: gameIdRef.current });
      },
      async offerDraw() {
        await emit('game:offerDraw', { gameId: gameIdRef.current });
      },
      async respondDraw(accept: boolean) {
        await emit('game:respondDraw', { gameId: gameIdRef.current, accept });
      },
      clearGame() {
        setGame((g) => (g && g.status === 'ENDED' ? null : g));
      },
    }),
    [emit],
  );

  const value = useMemo<GameApi>(() => ({ connected, game, searching, ...actions }), [connected, game, searching, actions]);

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameApi {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used inside GameProvider');
  return ctx;
}
