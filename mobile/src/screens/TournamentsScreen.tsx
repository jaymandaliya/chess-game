import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  CalendarClock,
  ChevronRight,
  Trophy,
  Users,
} from 'lucide-react-native';
import { api } from '../api/client';
import { Tournament } from '../api/types';
import { useGame } from '../game/GameContext';
import { AppStackParams } from '../navigation/navigationRef';
import { IconBadge, Muted, Segmented, styles as ui } from '../components/ui';
import { colors, radius, spacing, type } from '../theme';

type Scope = 'open' | 'mine' | 'past';

const STATUS: Record<Tournament['status'], { label: string; color: string }> = {
  REGISTRATION: { label: 'Open', color: colors.primary },
  RUNNING: { label: 'Live', color: colors.warning },
  COMPLETED: { label: 'Finished', color: colors.muted },
  CANCELLED: { label: 'Cancelled', color: colors.danger },
};

export function startsLabel(iso: string) {
  const d = new Date(iso);
  const diff = d.getTime() - Date.now();
  if (diff > 0 && diff < 60 * 60 * 1000)
    return `Starts in ${Math.max(1, Math.round(diff / 60000))} min`;
  return d.toLocaleString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function TournamentsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParams>>();
  const { subscribe } = useGame();
  const [scope, setScope] = useState<Scope>('open');
  const [items, setItems] = useState<Tournament[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api<{ items: Tournament[] }>(
        `/player/tournaments?scope=${scope}`,
      );
      setItems(res.items);
    } catch {
      setItems(i => i ?? []);
    }
  }, [scope]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(
    () => subscribe('tournament:update', () => load()),
    [subscribe, load],
  );

  return (
    <FlatList
      showsVerticalScrollIndicator={false}
      style={ui.screen}
      contentContainerStyle={styles.list}
      data={items ?? []}
      keyExtractor={t => t.id}
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
      ListHeaderComponent={
        <View style={styles.header}>
          <Segmented<Scope>
            options={[
              { key: 'open', label: 'Upcoming' },
              { key: 'mine', label: 'Joined' },
              { key: 'past', label: 'Past' },
            ]}
            value={scope}
            onChange={s => {
              setItems(null);
              setScope(s);
            }}
          />
        </View>
      }
      ListEmptyComponent={
        items === null ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <View style={styles.empty}>
            <IconBadge icon={Trophy} color={colors.gold} size={56} />
            <Text style={type.h2}>No tournaments here yet</Text>
            <Muted>New events are announced here. Pull down to refresh.</Muted>
          </View>
        )
      }
      renderItem={({ item }) => {
        const s = STATUS[item.status];
        const full = item.playerCount >= item.maxPlayers;
        return (
          <Pressable
            onPress={() =>
              navigation.navigate('TournamentDetail', { id: item.id })
            }
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
          >
            <View style={styles.cardTop}>
              <IconBadge icon={Trophy} color={colors.gold} size={44} />
              <View style={{ flex: 1 }}>
                <Text style={type.h2} numberOfLines={1}>
                  {item.name}
                </Text>
                <Muted>
                  {item.timeControl.label} · Knockout · {item.maxPlayers}{' '}
                  players
                </Muted>
              </View>
              <View
                style={[styles.status, { backgroundColor: `${s.color}22` }]}
              >
                <Text style={[styles.statusText, { color: s.color }]}>
                  {item.joined && item.status !== 'COMPLETED'
                    ? 'Joined'
                    : s.label}
                </Text>
              </View>
            </View>
            <View style={styles.meta}>
              <View style={styles.metaItem}>
                <Users size={14} color={colors.muted} />
                <Text style={styles.metaText}>
                  {item.playerCount}/{item.maxPlayers}
                  {full && item.status === 'REGISTRATION' ? ' · full' : ''}
                </Text>
              </View>
              <View style={styles.metaItem}>
                <CalendarClock size={14} color={colors.muted} />
                <Text style={styles.metaText}>
                  {startsLabel(item.startsAt)}
                </Text>
              </View>
            </View>
            <View style={styles.footer}>
              <View>
                <Text style={type.overline}>Entry</Text>
                <Text style={styles.money}>
                  {item.entryFee ? `${item.entryFee} T-coins` : 'Free'}
                </Text>
              </View>
              <View>
                <Text style={type.overline}>Prize pool</Text>
                <Text style={[styles.money, { color: colors.gold }]}>
                  {item.prizePool.toLocaleString('en-IN')}
                </Text>
              </View>
              <ChevronRight size={20} color={colors.muted} />
            </View>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, gap: spacing.md, paddingBottom: 56 },
  header: { marginBottom: spacing.xs },
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xxl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  pressed: { backgroundColor: colors.surfaceAlt, transform: [{ scale: 0.99 }] },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  status: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  statusText: { fontSize: 12, fontWeight: '800' },
  meta: { flexDirection: 'row', gap: spacing.lg },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  money: { color: colors.text, fontSize: 17, fontWeight: '800', marginTop: 2 },
});
