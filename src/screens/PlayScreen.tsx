import React, { useCallback, useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Bot,
  Coins,
  Flame,
  Play,
  Swords,
  Timer,
  Trophy,
  WifiOff,
  Zap,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useAuth } from '../auth/AuthContext';
import { useGame } from '../game/GameContext';
import { api } from '../api/client';
import { Economy } from '../api/types';
import { AppStackParams } from '../navigation/navigationRef';
import {
  Avatar,
  Button,
  Card,
  GradientCard,
  IconBadge,
  Segmented,
  SectionTitle,
  styles as ui,
} from '../components/ui';
import { colors, radius, spacing, type } from '../theme';

const TIME_CONTROLS: {
  key: string;
  name: string;
  icon: LucideIcon;
  color: string;
}[] = [
  { key: '1+0', name: 'Bullet', icon: Zap, color: '#F59E0B' },
  { key: '3+0', name: 'Blitz', icon: Flame, color: '#F43F5E' },
  { key: '3+2', name: 'Blitz', icon: Flame, color: '#F43F5E' },
  { key: '5+0', name: 'Blitz', icon: Flame, color: '#F43F5E' },
  { key: '10+0', name: 'Rapid', icon: Timer, color: '#22C55E' },
  { key: '15+10', name: 'Rapid', icon: Timer, color: '#22C55E' },
];

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function PlayScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParams>>();
  const { user, refreshUser } = useAuth();
  const { connected, game, playComputer } = useGame();
  const [balance, setBalance] = useState<number | null>(null);
  const [economy, setEconomy] = useState<Economy | null>(null);
  const [stake, setStake] = useState(0);
  const [level, setLevel] = useState(2);
  const [color, setColor] = useState<'white' | 'random' | 'black'>('random');
  const [starting, setStarting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [eco] = await Promise.all([
        api<Economy>('/player/economy'),
        refreshUser(),
      ]);
      setEconomy(eco);
      setBalance(eco.balances.play);
    } catch {
      // keeps the last known values
    }
  }, [refreshUser]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function startComputer() {
    setStarting(true);
    try {
      await playComputer(level, color);
    } catch (err) {
      Alert.alert(
        'Could not start',
        err instanceof Error ? err.message : 'Try again',
      );
    } finally {
      setStarting(false);
    }
  }

  const activeGame = game && game.status === 'ACTIVE' ? game : null;
  const canPlay = connected && !activeGame;

  return (
    <SafeAreaView style={ui.screen} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={ui.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.primary}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Avatar name={user?.displayName ?? '?'} size={48} />
          <View style={{ flex: 1 }}>
            <Text style={type.caption}>{greeting()},</Text>
            <Text style={type.h1} numberOfLines={1}>
              {user?.displayName}
            </Text>
          </View>
          <Pressable
            style={styles.coinPill}
            onPress={() =>
              navigation.navigate('Tabs', { screen: 'Wallet' } as never)
            }
            accessibilityLabel="Coin balance"
          >
            <Coins size={16} color={colors.gold} />
            <Text style={styles.coinText}>
              {balance === null ? '—' : balance.toLocaleString('en-IN')}
            </Text>
          </Pressable>
        </View>

        {/* Rating hero */}
        <GradientCard from="#14532D" to="#0F172A" style={styles.hero}>
          <View style={ui.row}>
            <IconBadge icon={Trophy} color={colors.gold} size={44} />
            <View style={{ flex: 1 }}>
              <Text style={type.overline}>Your rating</Text>
              <Text style={styles.rating}>{user?.rating ?? '—'}</Text>
            </View>
            <View
              style={[
                styles.status,
                {
                  backgroundColor: connected
                    ? colors.primarySoft
                    : colors.dangerSoft,
                },
              ]}
            >
              <View
                style={[
                  styles.dot,
                  {
                    backgroundColor: connected ? colors.primary : colors.danger,
                  },
                ]}
              />
              <Text
                style={[
                  styles.statusText,
                  { color: connected ? colors.primary : colors.danger },
                ]}
              >
                {connected ? 'Online' : 'Offline'}
              </Text>
            </View>
          </View>
        </GradientCard>

        {!connected ? (
          <View style={styles.offline}>
            <WifiOff size={16} color={colors.warning} />
            <Text style={styles.offlineText}>
              Connecting to the game server…
            </Text>
          </View>
        ) : null}

        {activeGame ? (
          <GradientCard from="#4C1D95" to="#1E1B4B">
            <View style={ui.row}>
              <IconBadge icon={Swords} color="#C4B5FD" />
              <View style={{ flex: 1 }}>
                <Text style={type.h2}>Game in progress</Text>
                <Text style={type.caption}>
                  vs{' '}
                  {activeGame.yourColor === 'w'
                    ? activeGame.black.displayName
                    : activeGame.white.displayName}
                </Text>
              </View>
            </View>
            <Button
              title="Resume game"
              icon={Play}
              onPress={() => navigation.navigate('Game')}
            />
          </GradientCard>
        ) : null}

        {/* Quick play */}
        <SectionTitle title="Quick play" />
        {economy && economy.stakeOptions.length > 1 ? (
          <Card style={styles.stakeCard}>
            <View style={ui.row}>
              <Coins size={16} color={colors.gold} />
              <Text style={[type.overline, { flex: 1 }]}>Entry per player</Text>
              {stake > 0 ? (
                <Text style={styles.winText}>
                  Win{' '}
                  {stake * 2 -
                    Math.floor(
                      (stake * 2 * economy.winningsFeePercent) / 100,
                    )}{' '}
                  coins
                </Text>
              ) : (
                <Text style={type.caption}>Free · just rating</Text>
              )}
            </View>
            <Segmented<number>
              options={economy.stakeOptions.map(s => ({
                key: s,
                label: s === 0 ? 'Free' : String(s),
              }))}
              value={stake}
              onChange={setStake}
            />
            {stake > 0 ? (
              <Text style={type.caption}>
                Both players put in {stake} coins. Winner takes the pot minus a{' '}
                {economy.winningsFeePercent}% platform fee. Draws are refunded.
              </Text>
            ) : null}
          </Card>
        ) : null}
        <View style={styles.grid}>
          {TIME_CONTROLS.map(tc => {
            const Icon = tc.icon;
            return (
              <Pressable
                key={tc.key}
                disabled={!canPlay}
                onPress={() =>
                  stake > (balance ?? 0)
                    ? Alert.alert(
                        'Not enough coins',
                        `You need ${stake} coins for this entry. Buy coins in the Wallet tab.`,
                      )
                    : navigation.navigate('Matchmaking', {
                        timeControl: tc.key,
                        stake,
                      })
                }
                style={({ pressed }) => [
                  styles.tc,
                  { opacity: !canPlay ? 0.4 : 1 },
                  pressed && styles.tcPressed,
                ]}
                accessibilityLabel={`${tc.name} ${tc.key}`}
              >
                <Icon size={18} color={tc.color} strokeWidth={2.4} />
                <Text style={styles.tcKey}>{tc.key}</Text>
                <Text style={type.caption}>{tc.name}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Vs computer */}
        <SectionTitle title="Practice vs computer" />
        <Card style={styles.computer}>
          <View style={ui.row}>
            <IconBadge icon={Bot} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={type.h2}>Train with the engine</Text>
              <Text style={type.caption}>Unrated · no clock</Text>
            </View>
          </View>
          <Text style={type.overline}>Difficulty</Text>
          <Segmented<number>
            options={[
              { key: 1, label: 'Easy' },
              { key: 2, label: 'Medium' },
              { key: 3, label: 'Hard' },
            ]}
            value={level}
            onChange={setLevel}
          />
          <Text style={type.overline}>Play as</Text>
          <Segmented<'white' | 'random' | 'black'>
            options={[
              { key: 'white', label: 'White' },
              { key: 'random', label: 'Random' },
              { key: 'black', label: 'Black' },
            ]}
            value={color}
            onChange={setColor}
          />
          <Button
            title="Start game"
            icon={Play}
            onPress={startComputer}
            loading={starting}
            disabled={!canPlay}
            style={{ marginTop: spacing.xs }}
          />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  stakeCard: { gap: spacing.md },
  winText: { color: colors.gold, fontWeight: '800' },
  coinPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.goldSoft,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  coinText: { color: colors.gold, fontWeight: '800', fontSize: 15 },
  hero: { paddingVertical: spacing.xl },
  rating: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: '700' },
  offline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  offlineText: { color: colors.warning, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tc: {
    width: '31.8%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  tcPressed: {
    backgroundColor: colors.surfaceAlt,
    transform: [{ scale: 0.97 }],
  },
  tcKey: { color: colors.text, fontSize: 22, fontWeight: '800' },
  computer: { gap: spacing.md },
});
