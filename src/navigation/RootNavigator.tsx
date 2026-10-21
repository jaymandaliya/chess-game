import React from 'react';
import { Text } from 'react-native';
import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../auth/AuthContext';
import { GameProvider } from '../game/GameContext';
import { Loading } from '../components/ui';
import { colors } from '../theme';
import { AppStackParams, AuthStackParams, navigationRef, TabParams } from './navigationRef';
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

const AuthStack = createNativeStackNavigator<AuthStackParams>();
const AppStack = createNativeStackNavigator<AppStackParams>();
const Tabs = createBottomTabNavigator<TabParams>();

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg, card: colors.card, primary: colors.primary, text: colors.text, border: colors.border },
};

const headerOptions = {
  headerStyle: { backgroundColor: colors.card },
  headerTintColor: colors.text,
  headerShadowVisible: false,
};

const TAB_ICONS: Record<keyof TabParams, string> = { Play: '♞', History: '☰', Wallet: '●', Profile: '♚' };

function TabIcon({ name, color }: { name: keyof TabParams; color: string }) {
  return <Text style={{ color, fontSize: 20 }}>{`${TAB_ICONS[name]}︎`}</Text>;
}

const renderTabIcon = (name: keyof TabParams) => ({ color }: { color: string }) => <TabIcon name={name} color={color} />;

function MainTabs() {
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        ...headerOptions,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        tabBarIcon: renderTabIcon(route.name),
      })}
    >
      <Tabs.Screen name="Play" component={PlayScreen} />
      <Tabs.Screen name="History" component={HistoryScreen} />
      <Tabs.Screen name="Wallet" component={WalletScreen} />
      <Tabs.Screen name="Profile" component={ProfileScreen} />
    </Tabs.Navigator>
  );
}

function AppNavigator() {
  return (
    <GameProvider>
      <AppStack.Navigator screenOptions={headerOptions}>
        <AppStack.Screen name="Tabs" component={MainTabs} options={{ headerShown: false }} />
        <AppStack.Screen name="Matchmaking" component={MatchmakingScreen} options={{ title: 'Quick pairing', presentation: 'modal' }} />
        <AppStack.Screen name="Game" component={GameScreen} options={{ title: 'Game' }} />
        <AppStack.Screen name="Settings" component={SettingsScreen} />
        <AppStack.Screen name="EditProfile" component={EditProfileScreen} options={{ title: 'Edit profile' }} />
      </AppStack.Navigator>
    </GameProvider>
  );
}

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={headerOptions}>
      <AuthStack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
      <AuthStack.Screen name="Register" component={RegisterScreen} options={{ title: 'Sign up' }} />
      <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={{ title: 'Forgot password' }} />
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
