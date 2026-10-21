import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Bot, Crown, Swords, Target, TrendingUp } from 'lucide-react-native';
import { api } from '../api/client';
import { HistoryItem, Page, PlayerStats } from '../api/types';
import {
  Avatar,
  Card,
  IconBadge,
  Muted,
  SectionTitle,
  styles as ui,
} from '../components/ui';
import { colors, radius, spacing, type } from '../theme';

const OUTCOME = {
  win: { label: 'W', color: colors.win },
  loss: { label: 'L', color: colors.loss },
  draw: { label: 'D', color: colors.draw },
};

function StatTile({
  icon,
  color,
  label,
  value,
}: {
  icon: typeof Crown;
  color: string;
  label: string;
  value: string | number;
}) {
  return (
    <View style={styles.tile}>
      <IconBadge icon={icon} color={color} size={34} />
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={type.overline}>{label}</Text>
    </View>
  );
}

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
        api<Page<HistoryItem>>(
          '/player/game-history?page=1&limit=20&sortBy=startedAt',
        ),
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
      const next = await api<Page<HistoryItem>>(
        `/player/game-history?page=${page + 1}&limit=20&sortBy=startedAt`,
      );
      setItems(i => [...i, ...next.items]);
      setPage(next.pagination.page);
      setTotalPages(next.pagination.totalPages);
    } finally {
      setLoadingMore(false);
    }
  }

  if (loading) {
    return (
      <View style={ui.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const header = stats ? (
    <View style={styles.headerBlock}>
      <View style={styles.tiles}>
        <StatTile
          icon={Crown}
          color={colors.gold}
          label="Rating"
          value={stats.rating}
        />
        <StatTile
          icon={TrendingUp}
          color={colors.accent}
          label="Peak"
          value={stats.peakRating}
        />
        <StatTile
          icon={Target}
          color={colors.primary}
          label="Win rate"
          value={`${stats.winRate}%`}
        />
        <StatTile
          icon={Swords}
          color="#06B6D4"
          label="Games"
          value={stats.played}
        />
      </View>

      <Card>
        <View style={styles.wldHeader}>
          <Text style={type.h2}>Results</Text>
          <Muted>
            {stats.wins}W · {stats.losses}L · {stats.draws}D
          </Muted>
        </View>
        {stats.played ? (
          <View style={styles.wldBar}>
            <View style={{ flex: stats.wins, backgroundColor: colors.win }} />
            <View style={{ flex: stats.draws, backgroundColor: colors.draw }} />
            <View
              style={{ flex: stats.losses, backgroundColor: colors.loss }}
            />
          </View>
        ) : null}
        {stats.recentForm.length ? (
          <>
            <Text style={[type.overline, { marginTop: spacing.sm }]}>
              Last {stats.recentForm.length} games
            </Text>
            <View style={styles.form}>
              {stats.recentForm.map((o, i) => (
                <View
                  key={i}
                  style={[
                    styles.formDot,
                    { backgroundColor: `${OUTCOME[o].color}26` },
                  ]}
                >
                  <Text style={[styles.formText, { color: OUTCOME[o].color }]}>
                    {OUTCOME[o].label}
                  </Text>
                </View>
              ))}
            </View>
          </>
        ) : null}
      </Card>
      <SectionTitle title="Recent games" />
    </View>
  ) : undefined;

  return (
    <FlatList
      showsVerticalScrollIndicator={false}
      style={ui.screen}
      contentContainerStyle={styles.list}
      data={items}
      keyExtractor={m => m.id}
      ListHeaderComponent={header}
      ListEmptyComponent={
        <Muted>No games yet. Start one from the Play tab.</Muted>
      }
      ListFooterComponent={
        loadingMore ? <ActivityIndicator color={colors.primary} /> : undefined
      }
      onEndReached={loadMore}
      onEndReachedThreshold={0.4}
      refreshControl={
        <RefreshControl
          refreshing={false}
          tintColor={colors.primary}
          onRefresh={load}
        />
      }
      renderItem={({ item }) => {
        const outcome = item.outcome ? OUTCOME[item.outcome] : null;
        const isBot = item.mode === 'VS_COMPUTER';
        return (
          <View style={styles.row}>
            {isBot ? (
              <IconBadge icon={Bot} color={colors.accent} size={42} />
            ) : (
              <Avatar name={item.opponent.displayName} size={42} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.opponent} numberOfLines={1}>
                {item.opponent.displayName}
                {item.opponent.ratingBefore ? (
                  <Text style={styles.oppRating}>
                    {' '}
                    {item.opponent.ratingBefore}
                  </Text>
                ) : null}
              </Text>
              <Muted>
                {isBot ? 'Practice' : item.timeControl.label} ·{' '}
                {item.status === 'ABORTED'
                  ? 'aborted'
                  : (item.termination ?? '')
                      .toLowerCase()
                      .replace(/_/g, ' ')}{' '}
                ·{' '}
                {new Date(item.startedAt).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                })}
              </Muted>
            </View>
            <View style={styles.right}>
              <View
                style={[
                  styles.badge,
                  {
                    backgroundColor: outcome
                      ? `${outcome.color}26`
                      : colors.surfaceAlt,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.badgeText,
                    { color: outcome?.color ?? colors.muted },
                  ]}
                >
                  {outcome?.label ?? '–'}
                </Text>
              </View>
              {item.ratingChange !== null ? (
                <Text
                  style={{
                    color: item.ratingChange >= 0 ? colors.win : colors.loss,
                    fontWeight: '700',
                    fontSize: 12,
                  }}
                >
                  {item.ratingChange >= 0 ? '+' : ''}
                  {item.ratingChange}
                </Text>
              ) : null}
            </View>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, paddingBottom: spacing.xxl },
  headerBlock: { gap: spacing.md, marginBottom: spacing.xs },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
    width: '48.6%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  tileValue: { color: colors.text, fontSize: 26, fontWeight: '800' },
  wldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  wldBar: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
  },
  form: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  formDot: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formText: { fontSize: 12, fontWeight: '800' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  opponent: { color: colors.text, fontWeight: '700', fontSize: 15 },
  oppRating: { color: colors.muted, fontWeight: '500' },
  right: { alignItems: 'center', gap: 2 },
  badge: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontWeight: '800' },
});
