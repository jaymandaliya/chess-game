import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  CalendarClock,
  Check,
  Hourglass,
  LogIn,
  LogOut,
  Medal,
  Play,
  Swords,
  Trophy,
  Users,
} from 'lucide-react-native';
import { api, errorMessage } from '../api/client';
import { Tournament } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useGame } from '../game/GameContext';
import { AppStackParams } from '../navigation/navigationRef';
import {
  Avatar,
  Button,
  Card,
  GradientCard,
  IconBadge,
  Loading,
  Muted,
  SectionTitle,
  styles as ui,
} from '../components/ui';
import { colors, radius, spacing, type } from '../theme';
import { startsLabel } from './TournamentsScreen';

type Props = NativeStackScreenProps<AppStackParams, 'TournamentDetail'>;

const PLACE = ['', '1st', '2nd', '3rd–4th'];

function useCountdown(iso?: string) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!iso) return undefined;
    const id = setInterval(() => tick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [iso]);
  if (!iso) return '';
  const ms = Math.max(0, new Date(iso).getTime() - Date.now());
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function TournamentDetailScreen({ route, navigation }: Props) {
  const { id } = route.params;
  const { user } = useAuth();
  const { subscribe, game } = useGame();
  const [t, setT] = useState<Tournament | null>(null);
  const [tournamentBalance, setTournamentBalance] = useState<number | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [detail, wallet] = await Promise.all([
        api<Tournament>(`/player/tournaments/${id}`),
        api<{ tournamentBalance: number }>('/player/wallet'),
      ]);
      setT(detail);
      setTournamentBalance(wallet.tournamentBalance);
    } catch (err) {
      Alert.alert('Could not load tournament', errorMessage(err));
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(
    () =>
      subscribe(
        'tournament:update',
        ({ tournamentId }: { tournamentId: string }) => {
          if (tournamentId === id) load();
        },
      ),
    [subscribe, id, load],
  );

  const countdown = useCountdown(t?.myPairing?.deadlineAt);

  if (!t) return <Loading />;

  async function act(action: 'join' | 'leave' | 'ready') {
    setBusy(true);
    try {
      setT(
        await api<Tournament>(`/player/tournaments/${id}/${action}`, {
          method: 'POST',
        }),
      );
      if (action !== 'ready') {
        const wallet = await api<{ tournamentBalance: number }>(
          '/player/wallet',
        );
        setTournamentBalance(wallet.tournamentBalance);
      }
    } catch (err) {
      Alert.alert('Not possible', errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const net = Math.floor(t.prizePool * (1 - t.feePercent / 100));
  const mine = t.myPairing;
  const canAfford = (tournamentBalance ?? 0) >= t.entryFee;
  const myId = user?.id;

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      style={ui.screen}
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
      <GradientCard from="#78350F" to="#0F172A" style={styles.hero}>
        <IconBadge icon={Trophy} color={colors.gold} size={52} />
        <Text style={type.h1}>{t.name}</Text>
        {t.description ? <Muted>{t.description}</Muted> : null}
        <View style={styles.heroMeta}>
          <View style={styles.metaItem}>
            <Swords size={14} color={colors.textSecondary} />
            <Text style={styles.metaText}>{t.timeControl.label} knockout</Text>
          </View>
          <View style={styles.metaItem}>
            <Users size={14} color={colors.textSecondary} />
            <Text style={styles.metaText}>
              {t.playerCount}/{t.maxPlayers}
            </Text>
          </View>
          <View style={styles.metaItem}>
            <CalendarClock size={14} color={colors.textSecondary} />
            <Text style={styles.metaText}>{startsLabel(t.startsAt)}</Text>
          </View>
        </View>
      </GradientCard>

      {/* Registration */}
      {t.status === 'REGISTRATION' ? (
        <Card style={styles.block}>
          <View style={ui.row}>
            <View style={{ flex: 1 }}>
              <Text style={type.overline}>Entry</Text>
              <Text style={styles.big}>
                {t.entryFee ? `${t.entryFee} tournament coins` : 'Free'}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={type.overline}>You have</Text>
              <Text style={[styles.big, { color: colors.gold }]}>
                {tournamentBalance ?? '—'}
              </Text>
            </View>
          </View>
          {t.joined ? (
            <>
              <View style={styles.joined}>
                <Check size={16} color={colors.primary} />
                <Text style={styles.joinedText}>
                  You're in. We'll start when it's full or at the start time.
                </Text>
              </View>
              <Button
                title="Leave and get refund"
                icon={LogOut}
                variant="secondary"
                loading={busy}
                onPress={() => act('leave')}
              />
            </>
          ) : (
            <Button
              title={
                canAfford ? 'Join tournament' : 'Not enough tournament coins'
              }
              icon={LogIn}
              loading={busy}
              disabled={!canAfford || t.playerCount >= t.maxPlayers}
              onPress={() => act('join')}
            />
          )}
          {!canAfford && !t.joined ? (
            <Muted>
              Tournament coins come as a bonus with every coin package in the
              Wallet.
            </Muted>
          ) : null}
        </Card>
      ) : null}

      {/* My match in the running round */}
      {t.status === 'RUNNING' && mine ? (
        <Card style={[styles.block, styles.matchCard]}>
          <Text style={type.overline}>Round {mine.round} · your match</Text>
          <View style={ui.row}>
            <Avatar name={user?.displayName ?? '?'} size={40} />
            <Text style={styles.vs}>vs</Text>
            {mine.opponent ? (
              <Avatar name={mine.opponent.displayName} size={40} />
            ) : null}
            <View style={{ flex: 1 }}>
              <Text style={type.h2}>
                {mine.opponent ? mine.opponent.displayName : 'Bye'}
              </Text>
              {mine.draws ? (
                <Muted>{mine.draws} drawn game(s) — replay</Muted>
              ) : null}
            </View>
          </View>
          {mine.status === 'DONE' ? (
            <Text
              style={[
                styles.result,
                { color: mine.winnerId === myId ? colors.win : colors.loss },
              ]}
            >
              {mine.winnerId === myId
                ? 'You advance to the next round'
                : 'You are out of this tournament'}
            </Text>
          ) : mine.status === 'PLAYING' ? (
            <Button
              title={
                game && game.status === 'ACTIVE'
                  ? 'Open game'
                  : 'Game starting…'
              }
              icon={Play}
              onPress={() => game && navigation.navigate('Game')}
            />
          ) : (
            <>
              <View style={styles.readyRow}>
                <ReadyPill label="You" ready={mine.iAmReady} />
                <ReadyPill
                  label={mine.opponent?.displayName ?? 'Opponent'}
                  ready={mine.opponentReady}
                />
              </View>
              <Button
                title={
                  mine.iAmReady
                    ? 'Waiting for opponent…'
                    : "I'm ready — start game"
                }
                icon={mine.iAmReady ? Hourglass : Play}
                loading={busy}
                disabled={mine.iAmReady}
                onPress={() => act('ready')}
              />
              <Muted>
                Round closes in {countdown}. If only one player is ready by
                then, that player advances.
              </Muted>
            </>
          )}
        </Card>
      ) : null}

      {t.status === 'RUNNING' && t.joined && !mine ? (
        <Card>
          <Text style={type.h2}>
            {t.eliminated
              ? 'You were knocked out'
              : 'Waiting for the next round'}
          </Text>
          <Muted>You can keep following the bracket below.</Muted>
        </Card>
      ) : null}

      {t.status === 'CANCELLED' ? (
        <Card>
          <Text style={type.h2}>Tournament cancelled</Text>
          <Muted>{t.cancelReason ?? ''} Entry fees were refunded.</Muted>
        </Card>
      ) : null}

      {/* Prizes */}
      <SectionTitle title="Prizes" />
      <Card style={styles.block}>
        {t.status === 'COMPLETED' && t.payouts.length
          ? t.payouts.map(p => (
              <View key={p.userId} style={styles.prizeRow}>
                <IconBadge
                  icon={Medal}
                  color={p.place === 1 ? colors.gold : colors.textSecondary}
                  size={34}
                />
                <Text
                  style={[
                    styles.prizeName,
                    p.userId === myId && { color: colors.primary },
                  ]}
                >
                  {PLACE[p.place]} · {p.displayName}
                </Text>
                <Text style={styles.prizeCoins}>
                  {p.coins.toLocaleString('en-IN')}
                </Text>
              </View>
            ))
          : t.prizeSplit.map((pct, i) =>
              pct ? (
                <View key={i} style={styles.prizeRow}>
                  <IconBadge
                    icon={Medal}
                    color={i === 0 ? colors.gold : colors.textSecondary}
                    size={34}
                  />
                  <Text style={styles.prizeName}>
                    {PLACE[i + 1]} place{i === 2 ? ' (each)' : ''}
                  </Text>
                  <Text style={styles.prizeCoins}>
                    {Math.floor(
                      (net * pct) / 100 / (i === 2 ? 2 : 1),
                    ).toLocaleString('en-IN')}
                  </Text>
                </View>
              ) : null,
            )}
        <Muted>
          Paid in play coins from the pool after a {t.feePercent}% platform fee.
          Pool grows as players join.
        </Muted>
      </Card>

      {/* Bracket */}
      {t.rounds.length ? (
        <>
          <SectionTitle title="Bracket" />
          {t.rounds.map(r => (
            <Card key={r.number} style={styles.block}>
              <Text style={type.overline}>Round {r.number}</Text>
              {r.pairings.map((p, i) => (
                <View key={p._id ?? p.id ?? i} style={styles.pairing}>
                  {[p.a, p.b].map((s, j) => (
                    <View
                      key={j}
                      style={[
                        styles.side,
                        s && p.winnerId === s.userId ? styles.sideWin : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.sideName,
                          s?.userId === myId && { color: colors.primary },
                        ]}
                        numberOfLines={1}
                      >
                        {s ? s.displayName : 'bye'}
                      </Text>
                      {s && p.winnerId === s.userId ? (
                        <Check size={14} color={colors.primary} />
                      ) : null}
                    </View>
                  ))}
                </View>
              ))}
            </Card>
          ))}
        </>
      ) : null}

      <SectionTitle title={`Players (${t.players.length})`} />
      <Card style={styles.block}>
        {t.players.length ? (
          t.players.map(p => (
            <View key={p.userId} style={styles.player}>
              <Avatar name={p.displayName} size={32} />
              <Text
                style={[
                  styles.playerName,
                  p.eliminatedInRound ? styles.out : null,
                ]}
              >
                {p.displayName}
              </Text>
              <Muted>
                {p.seed ? `#${p.seed} · ` : ''}
                {p.rating}
              </Muted>
            </View>
          ))
        ) : (
          <Muted>Be the first to join.</Muted>
        )}
      </Card>
    </ScrollView>
  );
}

function ReadyPill({ label, ready }: { label: string; ready: boolean }) {
  return (
    <View
      style={[
        styles.pill,
        { backgroundColor: ready ? colors.primarySoft : colors.surfaceAlt },
      ]}
    >
      {ready ? (
        <Check size={14} color={colors.primary} />
      ) : (
        <Hourglass size={14} color={colors.muted} />
      )}
      <Text
        style={[
          styles.pillText,
          { color: ready ? colors.primary : colors.muted },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  heroMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  block: { gap: spacing.md },
  big: { color: colors.text, fontSize: 20, fontWeight: '800', marginTop: 2 },
  joined: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  joinedText: { color: colors.primary, fontWeight: '600', flex: 1 },
  matchCard: { borderColor: colors.primary, borderWidth: 1 },
  vs: { color: colors.muted, fontWeight: '800' },
  result: { fontSize: 16, fontWeight: '800', textAlign: 'center' },
  readyRow: { flexDirection: 'row', gap: spacing.sm },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  pillText: { fontWeight: '700', flexShrink: 1 },
  prizeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  prizeName: { color: colors.text, fontWeight: '700', flex: 1 },
  prizeCoins: { color: colors.gold, fontWeight: '800', fontSize: 17 },
  pairing: {
    borderRadius: radius.sm,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  side: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    backgroundColor: colors.surfaceAlt,
  },
  sideWin: { backgroundColor: colors.primarySoft },
  sideName: { color: colors.text, fontWeight: '600', flex: 1 },
  player: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  playerName: { color: colors.text, fontWeight: '600', flex: 1 },
  out: { color: colors.muted, textDecorationLine: 'line-through' },
});
