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
  bonusTournamentCoins: number;
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
  coinType: 'PLAY' | 'TOURNAMENT';
  type:
    | 'PURCHASE'
    | 'BONUS'
    | 'STAKE'
    | 'STAKE_REFUND'
    | 'WINNINGS'
    | 'TOURNAMENT_ENTRY'
    | 'TOURNAMENT_REFUND'
    | 'TOURNAMENT_PRIZE'
    | 'WITHDRAWAL'
    | 'WITHDRAWAL_REVERSAL'
    | 'ENTRY_FEE'
    | 'REFUND'
    | 'REVERSAL'
    | 'ADJUSTMENT';
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
  mode: 'RATED' | 'CASUAL' | 'VS_COMPUTER' | 'TOURNAMENT';
  stakeCoins?: number;
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

// ---------- Coin economy ----------

export type CoinType = 'PLAY' | 'TOURNAMENT';

export interface Economy {
  stakeOptions: number[];
  winningsFeePercent: number;
  withdrawalsEnabled: boolean;
  balances: { play: number; tournament: number };
}

export interface TournamentSide {
  userId: string;
  displayName: string;
  seed: number;
}

export interface TournamentPairing {
  _id?: string;
  id?: string;
  a: TournamentSide | null;
  b: TournamentSide | null;
  status: 'WAITING' | 'PLAYING' | 'DONE';
  winnerId: string | null;
  decidedBy?: 'GAME' | 'BYE' | 'FORFEIT' | 'TIEBREAK';
  draws: number;
}

export interface Tournament {
  id: string;
  name: string;
  description?: string;
  entryFee: number;
  timeControl: { label: string };
  maxPlayers: number;
  prizeSplit: number[];
  feePercent: number;
  roundMinutes: number;
  startsAt: string;
  status: 'REGISTRATION' | 'RUNNING' | 'COMPLETED' | 'CANCELLED';
  playerCount: number;
  prizePool: number;
  players: {
    userId: string;
    displayName: string;
    rating: number;
    seed?: number;
    eliminatedInRound?: number;
  }[];
  rounds: {
    number: number;
    deadlineAt: string;
    pairings: TournamentPairing[];
  }[];
  payouts: {
    userId: string;
    displayName: string;
    place: number;
    coins: number;
  }[];
  winnerId?: string;
  cancelReason?: string;
  joined: boolean;
  eliminated: boolean;
  myPairing: {
    id: string;
    round: number;
    deadlineAt: string;
    status: 'WAITING' | 'PLAYING' | 'DONE';
    opponent: TournamentSide | null;
    iAmReady: boolean;
    opponentReady: boolean;
    currentGameId: string | null;
    winnerId: string | null;
    draws: number;
  } | null;
}

export interface Kyc {
  status: 'NOT_SUBMITTED' | 'PENDING' | 'APPROVED' | 'REJECTED';
  fullName?: string;
  dateOfBirth?: string;
  pan?: string;
  payoutMethod?: 'UPI' | 'BANK';
  payoutTo?: string;
  rejectionReason?: string | null;
  submittedAt?: string;
}

export interface WithdrawalConfig {
  enabled: boolean;
  coinValuePaise: number;
  minCoins: number;
  tdsPercent: number;
  kycStatus: Kyc['status'];
  balance: number;
}

export interface WithdrawalQuote {
  coinValuePaise: number;
  grossPaise: number;
  tdsPercent: number;
  tdsPaise: number;
  netPaise: number;
}

export interface Withdrawal extends WithdrawalQuote {
  id: string;
  requestNumber: string;
  coins: number;
  payoutMethod: 'UPI' | 'BANK';
  payoutTo: string;
  status: 'PENDING' | 'PAID' | 'REJECTED';
  payoutReference?: string;
  rejectionReason?: string;
  createdAt: string;
}
