import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/client';
import { HistoryItem, Page, PlayerStats } from '../api/types';
import { Card, Muted, Stat, styles as ui } from '../components/ui';
import { colors, spacing } from '../theme';

const OUTCOME = {
  win: { label: 'W', color: colors.win },
  loss: { label: 'L', color: colors.loss },
  draw: { label: 'D', color: colors.draw },
};

export default function HistoryScreen() {
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, first] = await Promise.all([
        api<PlayerStats>('/player/stats'),
        api<Page<HistoryItem>>('/player/game-history?page=1&limit=20&sortBy=startedAt'),
      ]);
      setStats(s);
      setItems(first.items);
      setPage(1);
      setTotalPages(first.pagination.totalPages);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => {});
    }, [load]),
  );

  async function loadMore() {
    if (loadingMore || page >= totalPages) return;
    setLoadingMore(true);
    try {
      const next = await api<Page<HistoryItem>>(`/player/game-history?page=${page + 1}&limit=20&sortBy=startedAt`);
      setItems((i) => [...i, ...next.items]);
      setPage(next.pagination.page);
      setTotalPages(next.pagination.totalPages);
    } finally {
      setLoadingMore(false);
    }
  }

  const header = stats ? (
    <View style={{ gap: spacing.md, marginBottom: spacing.md }}>
      <Card>
        <View style={ui.row}>
          <Stat label="Rating" value={stats.rating} />
          <Stat label="Peak" value={stats.peakRating} />
          <Stat label="Win rate" value={`${stats.winRate}%`} />
        </View>
        <View style={[ui.row, { marginTop: spacing.sm }]}>
          <Stat label="Played" value={stats.played} />
          <Stat label="Won" value={stats.wins} color={colors.win} />
          <Stat label="Lost" value={stats.losses} color={colors.loss} />
          <Stat label="Drawn" value={stats.draws} />
        </View>
        {stats.recentForm.length ? (
          <View style={[ui.row, { justifyContent: 'center', marginTop: spacing.sm }]}>
            {stats.recentForm.map((o, i) => (
              <View key={i} style={[styles.formDot, { backgroundColor: OUTCOME[o].color }]}>
                <Text style={styles.formText}>{OUTCOME[o].label}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </Card>
    </View>
  ) : undefined;

  if (loading) {
    return (
      <View style={ui.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <FlatList
      style={ui.screen}
      contentContainerStyle={{ padding: spacing.lg }}
      data={items}
      keyExtractor={(m) => m.id}
      ListHeaderComponent={header}
      ListEmptyComponent={<Muted>No games yet. Play your first game from the Play tab.</Muted>}
      ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} /> : undefined}
      onEndReached={loadMore}
      onEndReachedThreshold={0.4}
      refreshControl={<RefreshControl refreshing={false} tintColor={colors.primary} onRefresh={load} />}
      renderItem={({ item }) => {
        const outcome = item.outcome ? OUTCOME[item.outcome] : null;
        return (
          <View style={styles.row}>
            <View style={[styles.badge, { backgroundColor: outcome?.color ?? colors.cardAlt }]}>
              <Text style={styles.badgeText}>{outcome?.label ?? '–'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.opponent} numberOfLines={1}>
                vs {item.opponent.displayName}
                {item.opponent.ratingBefore ? <Text style={styles.muted}> ({item.opponent.ratingBefore})</Text> : null}
              </Text>
              <Muted>
                {item.mode === 'VS_COMPUTER' ? 'Computer' : item.timeControl.label} · {item.color} ·{' '}
                {item.status === 'ABORTED' ? 'aborted' : (item.termination ?? '').toLowerCase().replace(/_/g, ' ')} ·{' '}
                {new Date(item.startedAt).toLocaleDateString('en-IN')}
              </Muted>
            </View>
            {item.ratingChange !== null ? (
              <Text style={{ color: item.ratingChange >= 0 ? colors.win : colors.loss, fontWeight: '800' }}>
                {item.ratingChange >= 0 ? '+' : ''}
                {item.ratingChange}
              </Text>
            ) : null}
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  badge: { width: 32, height: 32, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#111', fontWeight: '800' },
  opponent: { color: colors.text, fontWeight: '700', fontSize: 15 },
  muted: { color: colors.muted, fontWeight: '400' },
  formDot: { width: 22, height: 22, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  formText: { color: '#111', fontSize: 11, fontWeight: '800' },
});
