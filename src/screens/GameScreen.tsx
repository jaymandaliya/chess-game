import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Bot,
  Flag,
  Frown,
  Handshake,
  Scale,
  Trophy,
  WifiOff,
  X,
} from 'lucide-react-native';
import ChessBoard from '../components/ChessBoard';
import {
  Avatar,
  Button,
  Card,
  IconBadge,
  Muted,
  styles as ui,
} from '../components/ui';
import { useAuth } from '../auth/AuthContext';
import { Color, GameState, Side, useGame } from '../game/GameContext';
import { AppStackParams } from '../navigation/navigationRef';
import { colors, radius, spacing, type } from '../theme';

type Props = NativeStackScreenProps<AppStackParams, 'Game'>;

function formatClock(ms: number): string {
  const total = Math.max(0, ms);
  const minutes = Math.floor(total / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  if (total < 10000) return `${seconds}.${Math.floor((total % 1000) / 100)}`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

// Ticks the side to move locally between server updates
function useClock(game: GameState | null, color: Color): number | null {
  const [, setTick] = useState(0);
  const running = Boolean(
    game?.clocks &&
      game.clocksRunning &&
      game.status === 'ACTIVE' &&
      game.turn === color,
  );
  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => setTick(t => t + 1), 100);
    return () => clearInterval(id);
  }, [running]);
  if (!game?.clocks) return null;
  const base = color === 'w' ? game.clocks.white : game.clocks.black;
  return running ? base - (Date.now() - game.clocksAt) : base;
}

function PlayerBar({
  side,
  ms,
  active,
  color,
}: {
  side: Side;
  ms: number | null;
  active: boolean;
  color: Color;
}) {
  const low = ms !== null && ms < 20000;
  return (
    <View style={[styles.bar, active && styles.barActive]}>
      {side.isComputer ? (
        <IconBadge icon={Bot} color={colors.accent} size={38} />
      ) : (
        <Avatar name={side.displayName} size={38} />
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.player} numberOfLines={1}>
          {side.displayName}
        </Text>
        <Muted>
          {color === 'w' ? 'White' : 'Black'}
          {side.rating ? ` · ${side.rating}` : ''}
        </Muted>
      </View>
      {ms !== null ? (
        <View
          style={[
            styles.clock,
            active && styles.clockActive,
            active && low && styles.clockLow,
          ]}
        >
          <Text
            style={[
              styles.clockText,
              active && { color: low ? '#fff' : colors.onPrimary },
            ]}
          >
            {formatClock(ms)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function resultInfo(game: GameState) {
  const end = game.end!;
  const reason = (end.termination ?? '').toLowerCase().replace(/_/g, ' ');
  if (end.result === 'ABORTED')
    return {
      title: 'Game aborted',
      detail: 'No rating change',
      icon: X,
      color: colors.muted,
    };
  if (end.result === 'DRAW')
    return {
      title: 'Draw',
      detail: reason ? `by ${reason}` : '',
      icon: Scale,
      color: colors.draw,
    };
  const won = end.winner === game.yourColor;
  return won
    ? {
        title: 'You won!',
        detail: reason ? `by ${reason}` : '',
        icon: Trophy,
        color: colors.gold,
      }
    : {
        title: 'You lost',
        detail: reason ? `by ${reason}` : '',
        icon: Frown,
        color: colors.loss,
      };
}

export default function GameScreen({ navigation }: Props) {
  const { settings } = useAuth();
  const { game, move, resign, abort, offerDraw, respondDraw, clearGame } =
    useGame();
  const [error, setError] = useState<string | null>(null);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const insets = useSafeAreaInsets();
  const me: Color = game?.yourColor ?? 'w';
  const opp: Color = me === 'w' ? 'b' : 'w';
  const myMs = useClock(game, me);
  const oppMs = useClock(game, opp);

  useEffect(() => () => clearGame(), [clearGame]);

  const movePairs = useMemo(() => {
    const pairs: string[] = [];
    game?.moves.forEach((san, i) => {
      if (i % 2 === 0) pairs.push(`${i / 2 + 1}. ${san}`);
      else pairs[pairs.length - 1] += ` ${san}`;
    });
    return pairs;
  }, [game?.moves]);

  if (!game) {
    return (
      <View style={[ui.center, { gap: spacing.md, padding: spacing.xl }]}>
        <Muted>No active game.</Muted>
        <Button
          title="Back to lobby"
          icon={ArrowLeft}
          variant="secondary"
          onPress={() => navigation.goBack()}
        />
      </View>
    );
  }

  function flash(message: string) {
    setError(message);
    if (errorTimer.current) clearTimeout(errorTimer.current);
    errorTimer.current = setTimeout(() => setError(null), 2500);
  }

  async function run(action: () => Promise<void>) {
    try {
      await action();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Action failed');
    }
  }

  const sides = { w: game.white, b: game.black };
  const active = game.status === 'ACTIVE';
  const canAbort = active && game.moves.length < 2;
  const opponentOffersDraw = active && game.drawOfferBy === opp;
  const result = game.end ? resultInfo(game) : null;
  const myRating = game.end?.ratings
    ? me === 'w'
      ? game.end.ratings.white
      : game.end.ratings.black
    : null;
  const diff = myRating ? myRating.after - myRating.before : 0;

  return (
    <View style={ui.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={ui.screen}
        contentContainerStyle={styles.content}
      >
        <View style={styles.meta}>
          <Text style={type.overline}>
            {game.mode === 'VS_COMPUTER'
              ? 'Practice · unrated'
              : `${game.timeControl.label} · Rated`}
          </Text>
        </View>

        <PlayerBar
          side={sides[opp]}
          ms={oppMs}
          active={active && game.turn === opp}
          color={opp}
        />
        {game.opponentDisconnected && active ? (
          <View style={styles.notice}>
            <WifiOff size={14} color={colors.warning} />
            <Text style={styles.noticeText}>
              Opponent disconnected — they lose if not back within 60s
            </Text>
          </View>
        ) : null}

        <View style={styles.board}>
          <ChessBoard
            fen={game.fen}
            orientation={me}
            interactive={active && game.turn === me}
            lastMove={game.lastMove}
            settings={settings}
            onMove={(from, to, promotion) =>
              run(() => move(from, to, promotion))
            }
          />
        </View>

        <PlayerBar
          side={sides[me]}
          ms={myMs}
          active={active && game.turn === me}
          color={me}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Card style={styles.moves}>
          <Text style={type.overline}>Moves</Text>
          {movePairs.length ? (
            <View style={styles.moveWrap}>
              {movePairs.map((p, i) => (
                <View
                  key={i}
                  style={[
                    styles.moveChip,
                    i === movePairs.length - 1 && styles.moveChipLast,
                  ]}
                >
                  <Text style={styles.moveText}>{p}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Muted>No moves yet — White to move.</Muted>
          )}
        </Card>
      </ScrollView>

      {/* Fixed bottom dock: always visible and kept above the iPhone home indicator */}
      <View
        style={[styles.dock, { paddingBottom: insets.bottom + spacing.md }]}
      >
        {opponentOffersDraw ? (
          <View style={styles.dockBlock}>
            <View style={ui.row}>
              <IconBadge icon={Handshake} color={colors.primary} size={36} />
              <Text style={[type.h2, { flex: 1 }]}>
                Your opponent offers a draw
              </Text>
            </View>
            <View style={ui.row}>
              <Button
                title="Accept"
                style={{ flex: 1 }}
                onPress={() => run(() => respondDraw(true))}
              />
              <Button
                title="Decline"
                variant="secondary"
                style={{ flex: 1 }}
                onPress={() => run(() => respondDraw(false))}
              />
            </View>
          </View>
        ) : null}

        {result ? (
          <View style={styles.dockBlock}>
            <View style={ui.row}>
              <IconBadge icon={result.icon} color={result.color} size={48} />
              <View style={{ flex: 1 }}>
                <Text style={type.h1}>{result.title}</Text>
                {result.detail ? <Muted>{result.detail}</Muted> : null}
              </View>
              {myRating ? (
                <View
                  style={[
                    styles.ratingChange,
                    {
                      backgroundColor:
                        diff >= 0 ? colors.primarySoft : colors.dangerSoft,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: diff >= 0 ? colors.win : colors.loss,
                      fontWeight: '800',
                      fontSize: 15,
                    }}
                  >
                    {diff >= 0 ? '+' : ''}
                    {diff}
                  </Text>
                </View>
              ) : null}
            </View>
            {myRating ? (
              <Muted>
                Rating {myRating.before} → {myRating.after}
              </Muted>
            ) : null}
            <Button
              title="Back to lobby"
              icon={ArrowLeft}
              onPress={() => navigation.goBack()}
            />
          </View>
        ) : (
          <View style={ui.row}>
            {canAbort ? (
              <Button
                title="Abort"
                icon={X}
                variant="secondary"
                style={{ flex: 1 }}
                onPress={() => run(abort)}
              />
            ) : (
              <Button
                title="Resign"
                icon={Flag}
                variant="danger"
                style={{ flex: 1 }}
                onPress={() =>
                  Alert.alert(
                    'Resign this game?',
                    'Your opponent will be awarded the win.',
                    [
                      { text: 'Keep playing', style: 'cancel' },
                      {
                        text: 'Resign',
                        style: 'destructive',
                        onPress: () => run(resign),
                      },
                    ],
                  )
                }
              />
            )}
            {game.mode !== 'VS_COMPUTER' ? (
              <Button
                title={game.drawOfferBy === me ? 'Offered' : 'Draw'}
                icon={Handshake}
                variant="secondary"
                style={{ flex: 1 }}
                disabled={canAbort || game.drawOfferBy === me}
                onPress={() => run(offerDraw)}
              />
            ) : null}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingVertical: spacing.md,
    gap: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  meta: { alignItems: 'center' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.md,
    padding: spacing.sm,
    paddingRight: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  barActive: { borderColor: colors.primary },
  player: { color: colors.text, fontSize: 16, fontWeight: '700' },
  clock: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minWidth: 92,
    alignItems: 'center',
  },
  clockActive: { backgroundColor: colors.primary },
  clockLow: { backgroundColor: colors.danger },
  clockText: {
    color: colors.textSecondary,
    fontSize: 22,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  board: { borderRadius: radius.sm, overflow: 'hidden', marginHorizontal: 0 },
  notice: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  noticeText: { color: colors.warning, fontSize: 13, fontWeight: '600' },
  error: { color: colors.danger, textAlign: 'center', fontWeight: '600' },
  dock: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  dockBlock: { gap: spacing.md },
  ratingChange: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  moves: { marginHorizontal: spacing.md },
  moveWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  moveChip: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  moveChipLast: { backgroundColor: colors.primarySoft },
  moveText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
});
