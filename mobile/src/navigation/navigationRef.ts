import { createNavigationContainerRef } from '@react-navigation/native';

export type AppStackParams = {
  Tabs: undefined;
  Matchmaking: { timeControl: string; stake: number };
  TournamentDetail: { id: string };
  Kyc: undefined;
  Withdraw: undefined;
  Game: undefined;
  Settings: undefined;
  EditProfile: undefined;
  ChangePassword: undefined;
};

export type AuthStackParams = {
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
};

export type TabParams = {
  Play: undefined;
  Events: undefined;
  History: undefined;
  Wallet: undefined;
  Profile: undefined;
};

export const navigationRef = createNavigationContainerRef<AppStackParams>();

export function goToGame() {
  if (!navigationRef.isReady()) return;
  const current = navigationRef.getCurrentRoute();
  if (current?.name === 'Game') return;
  if (current?.name === 'Matchmaking')
    navigationRef.dispatch({ type: 'REPLACE', payload: { name: 'Game' } });
  else navigationRef.navigate('Game');
}
