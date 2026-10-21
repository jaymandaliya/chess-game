import React, { useCallback, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { useGame } from '../game/GameContext';
import { api } from '../api/client';
import { AppStackParams } from '../navigation/navigationRef';
import { Button, Card, Muted, styles as ui, Title } from '../components/ui';
import { colors, spacing } from '../theme';

const TIME_CONTROLS = [
  { key: '1+0', name: 'Bullet' },
  { key: '3+0', name: 'Blitz' },
  { key: '3+2', name: 'Blitz' },
  { key: '5+0', name: 'Blitz' },
  { key: '10+0', name: 'Rapid' },
  { key: '15+10', name: 'Rapid' },
];
const LEVELS = [
  { level: 1, name: 'Easy' },
  { level: 2, name: 'Medium' },
  { level: 3, name: 'Hard' },
];
const COLORS = [
  { key: 'white', label: 'White' },
  { key: 'random', label: 'Random' },
  { key: 'black', label: 'Black' },
] as const;

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress(): void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]} accessibilityState={{ selected: active }}>
      <Text style={[styles.chipText, active && { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

export default function PlayScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParams>>();
  const { user, refreshUser } = useAuth();
  const { connected, game, playComputer } = useGame();
  const [balance, setBalance] = useState<number | null>(null);
  const [level, setLevel] = useState(2);
  const [color, setColor] = useState<(typeof COLORS)[number]['key']>('random');
  const [starting, setStarting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [wallet] = await Promise.all([api<{ balance: number }>('/player/wallet'), refreshUser()]);
      setBalance(wallet.balance);
    } catch {
      // shown as "—"
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
      Alert.alert('Could not start', err instanceof Error ? err.message : 'Try again');
    } finally {
      setStarting(false);
    }
  }

  const activeGame = game && game.status === 'ACTIVE';

  return (
    <ScrollView
      style={ui.screen}
      contentContainerStyle={ui.content}
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.primary} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      <Card style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{user?.displayName}</Text>
          <Muted>Rating {user?.rating ?? '—'}</Muted>
        </View>
        <View style={styles.coins}>
          <Text style={styles.coinText}>● {balance ?? '—'}</Text>
          <Muted>coins</Muted>
        </View>
      </Card>

      {!connected ? <Text style={styles.offline}>Connecting to the game server…</Text> : null}

      {activeGame ? (
        <Card style={{ borderColor: colors.primary, borderWidth: 1 }}>
          <Title>Game in progress</Title>
          <Muted>
            vs {game.yourColor === 'w' ? game.black.displayName : game.white.displayName}
          </Muted>
          <Button title="Resume game" onPress={() => navigation.navigate('Game')} />
        </Card>
      ) : null}

      <Title>Play online</Title>
      <View style={styles.grid}>
        {TIME_CONTROLS.map((tc) => (
          <Pressable
            key={tc.key}
            disabled={!connected || Boolean(activeGame)}
            onPress={() => navigation.navigate('Matchmaking', { timeControl: tc.key })}
            style={({ pressed }) => [styles.tc, { opacity: !connected || activeGame ? 0.4 : pressed ? 0.8 : 1 }]}
          >
            <Text style={styles.tcKey}>{tc.key}</Text>
            <Muted>{tc.name}</Muted>
          </Pressable>
        ))}
      </View>

      <Title>Play vs computer</Title>
      <Card>
        <Muted>Difficulty</Muted>
        <View style={ui.row}>
          {LEVELS.map((l) => (
            <Chip key={l.level} label={l.name} active={level === l.level} onPress={() => setLevel(l.level)} />
          ))}
        </View>
        <Muted>Play as</Muted>
        <View style={ui.row}>
          {COLORS.map((c) => (
            <Chip key={c.key} label={c.label} active={color === c.key} onPress={() => setColor(c.key)} />
          ))}
        </View>
        <Button title="Start game" onPress={startComputer} loading={starting} disabled={!connected || Boolean(activeGame)} />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center' },
  name: { color: colors.text, fontSize: 22, fontWeight: '800' },
  coins: { alignItems: 'flex-end' },
  coinText: { color: colors.coin, fontSize: 20, fontWeight: '800' },
  offline: { color: colors.warning, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tc: {
    width: '31.5%',
    aspectRatio: 1.3,
    backgroundColor: colors.card,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  tcKey: { color: colors.text, fontSize: 24, fontWeight: '800' },
  chip: { flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: colors.cardAlt, alignItems: 'center' },
  chipActive: { backgroundColor: colors.primaryDark },
  chipText: { color: colors.muted, fontWeight: '700' },
});
