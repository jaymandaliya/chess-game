export type Role = 'PLAYER' | 'ADMIN' | 'SUPER_ADMIN';

export interface SessionUser {
  id: string;
  displayName: string;
  email: string;
  role: Role;
  status: 'ACTIVE' | 'SUSPENDED';
  avatarUrl: string | null;
  rating: number;
}

export interface Profile {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  status: string;
  avatarUrl?: string;
  country?: string;
  bio?: string;
  rating: number;
  peakRating: number;
  createdAt: string;
}

export interface PlayerSettings {
  boardTheme: 'classic' | 'green' | 'blue' | 'wood';
  pieceSet: 'standard' | 'neo' | 'alpha';
  soundEnabled: boolean;
  notificationsEnabled: boolean;
  autoQueen: boolean;
  showLegalMoves: boolean;
  language: 'en' | 'hi';
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Page<T> {
  items: T[];
  pagination: Pagination;
}

export interface CoinPackage {
  id: string;
  name: string;
  coins: number;
  pricePaise: number;
  tag?: string;
  active: boolean;
}

export interface Order {
  id: string;
  orderNumber: string;
  coins: number;
  amountPaise: number;
  currency: string;
  status: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
  providerOrderId: string;
  package: { name: string; coins: number; pricePaise: number };
  createdAt: string;
}

export interface Checkout {
  provider: 'razorpay' | 'mock';
  keyId: string;
  providerOrderId: string;
  amountPaise: number;
  currency: string;
}

export interface WalletTransaction {
  id: string;
  type: 'PURCHASE' | 'ENTRY_FEE' | 'WINNINGS' | 'REFUND' | 'REVERSAL' | 'ADJUSTMENT';
  amount: number;
  balanceAfter: number;
  description?: string;
  createdAt: string;
}

export interface StatLine {
  played: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
}

export interface PlayerStats extends StatLine {
  rating: number;
  peakRating: number;
  byColor: { white: StatLine; black: StatLine };
  byMode: Record<string, StatLine>;
  recentForm: ('win' | 'loss' | 'draw')[];
}

export interface MatchSide {
  userId: string | null;
  displayName: string;
  ratingBefore?: number;
  ratingAfter?: number;
}

export interface HistoryItem {
  id: string;
  mode: 'RATED' | 'CASUAL' | 'VS_COMPUTER';
  timeControl: { label?: string };
  status: 'ONGOING' | 'COMPLETED' | 'ABORTED';
  result?: string;
  termination?: string;
  moveCount: number;
  startedAt: string;
  endedAt?: string;
  color: 'white' | 'black';
  outcome: 'win' | 'loss' | 'draw' | null;
  opponent: MatchSide;
  ratingChange: number | null;
}
