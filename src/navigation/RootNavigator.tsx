import React from 'react';
import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  History,
  Swords,
  Trophy,
  UserRound,
  Wallet,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useAuth } from '../auth/AuthContext';
import { GameProvider } from '../game/GameContext';
import { Loading } from '../components/ui';
import { colors } from '../theme';
import {
  AppStackParams,
  AuthStackParams,
  navigationRef,
  TabParams,
} from './navigationRef';
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';
import PlayScreen from '../screens/PlayScreen';
import HistoryScreen from '../screens/HistoryScreen';
import WalletScreen from '../screens/WalletScreen';
import ProfileScreen from '../screens/ProfileScreen';
import MatchmakingScreen from '../screens/MatchmakingScreen';
import GameScreen from '../screens/GameScreen';
import SettingsScreen from '../screens/SettingsScreen';
import EditProfileScreen from '../screens/EditProfileScreen';
import ChangePasswordScreen from '../screens/ChangePasswordScreen';
import TournamentsScreen from '../screens/TournamentsScreen';
import TournamentDetailScreen from '../screens/TournamentDetailScreen';
import KycScreen from '../screens/KycScreen';
import WithdrawScreen from '../screens/WithdrawScreen';

const AuthStack = createNativeStackNavigator<AuthStackParams>();
const AppStack = createNativeStackNavigator<AppStackParams>();
const Tabs = createBottomTabNavigator<TabParams>();

const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.bg,
    primary: colors.primary,
    text: colors.text,
    border: colors.border,
  },
};

const headerOptions = {
  headerStyle: { backgroundColor: colors.bg },
  headerTintColor: colors.text,
  headerShadowVisible: false,
  headerTitleStyle: { fontWeight: '700' as const },
};

const TAB_ICONS: Record<keyof TabParams, LucideIcon> = {
  Play: Swords,
  Events: Trophy,
  History,
  Wallet,
  Profile: UserRound,
};

const renderTabIcon =
  (name: keyof TabParams) =>
  ({ color, focused }: { color: string; focused: boolean }) => {
    const Icon = TAB_ICONS[name];
    return <Icon size={24} color={color} strokeWidth={focused ? 2.5 : 2} />;
  };

function MainTabs() {
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        ...headerOptions,
        headerTitleAlign: 'left',
        headerTitleStyle: { fontWeight: '800', fontSize: 26 },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        tabBarIcon: renderTabIcon(route.name),
      })}
    >
      <Tabs.Screen
        name="Play"
        component={PlayScreen}
        options={{ headerShown: false }}
      />
      <Tabs.Screen
        name="Events"
        component={TournamentsScreen}
        options={{ title: 'Tournaments', tabBarLabel: 'Events' }}
      />
      <Tabs.Screen name="History" component={HistoryScreen} />
      <Tabs.Screen name="Wallet" component={WalletScreen} />
      <Tabs.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ headerShown: false }}
      />
    </Tabs.Navigator>
  );
}

function AppNavigator() {
  return (
    <GameProvider>
      <AppStack.Navigator screenOptions={headerOptions}>
        <AppStack.Screen
          name="Tabs"
          component={MainTabs}
          options={{ headerShown: false }}
        />
        <AppStack.Screen
          name="Matchmaking"
          component={MatchmakingScreen}
          options={{ title: 'Quick pairing', presentation: 'modal' }}
        />
        <AppStack.Screen
          name="Game"
          component={GameScreen}
          options={{ title: '' }}
        />
        <AppStack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{ title: 'Board & gameplay' }}
        />
        <AppStack.Screen
          name="EditProfile"
          component={EditProfileScreen}
          options={{ title: 'Edit profile' }}
        />
        <AppStack.Screen
          name="ChangePassword"
          component={ChangePasswordScreen}
          options={{ title: 'Change password' }}
        />
        <AppStack.Screen
          name="TournamentDetail"
          component={TournamentDetailScreen}
          options={{ title: 'Tournament' }}
        />
        <AppStack.Screen
          name="Kyc"
          component={KycScreen}
          options={{ title: 'KYC verification' }}
        />
        <AppStack.Screen
          name="Withdraw"
          component={WithdrawScreen}
          options={{ title: 'Withdraw' }}
        />
      </AppStack.Navigator>
    </GameProvider>
  );
}

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ ...headerOptions, title: '' }}>
      <AuthStack.Screen
        name="Login"
        component={LoginScreen}
        options={{ headerShown: false }}
      />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
      <AuthStack.Screen
        name="ForgotPassword"
        component={ForgotPasswordScreen}
      />
    </AuthStack.Navigator>
  );
}

export default function RootNavigator() {
  const { user, booting } = useAuth();
  if (booting) return <Loading />;
  return (
    <NavigationContainer ref={navigationRef} theme={theme}>
      {user ? <AppNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}
