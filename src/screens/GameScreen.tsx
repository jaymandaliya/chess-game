import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import ChessBoard from '../components/ChessBoard';
import { Button, Muted, styles as ui } from '../components/ui';
import { useAuth } from '../auth/AuthContext';
import { Color, GameState, Side, useGame } from '../game/GameContext';
import { AppStackParams } from '../navigation/navigationRef';
import { colors, spacing } from '../theme';

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
  const running = Boolean(game?.clocks && game.clocksRunning && game.status === 'ACTIVE' && game.turn === color);
  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => setTick((t) => t + 1), 100);
    return () => clearInterval(id);
  }, [running]);
  if (!game?.clocks) return null;
  const base = color === 'w' ? game.clocks.white : game.clocks.black;
  return running ? base - (Date.now() - game.clocksAt) : base;
}

function PlayerBar({ side, ms, active, captured }: { side: Side; ms: number | null; active: boolean; captured?: string }) {
  return (
    <View style={styles.bar}>
      <View style={{ flex: 1 }}>
        <Text style={styles.player} numberOfLines={1}>
          {side.displayName}
          {side.rating ? <Text style={styles.rating}> ({side.rating})</Text> : null}
        </Text>
        {captured ? <Muted>{captured}</Muted> : null}
      </View>
      {ms !== null ? (
        <View style={[styles.clock, active && styles.clockActive, ms < 20000 && active && styles.clockLow]}>
          <Text style={[styles.clockText, active && { color: '#111' }]}>{formatClock(ms)}</Text>
        </View>
      ) : null}
    </View>
  );
}

function resultText(game: GameState): { title: string; detail: string } {
  const end = game.end!;
  if (end.result === 'ABORTED') return { title: 'Game aborted', detail: 'No rating change' };
  const reason = (end.termination ?? '').toLowerCase().replace(/_/g, ' ');
  if (end.result === 'DRAW') return { title: 'Draw', detail: reason ? `by ${reason}` : '' };
  const won = end.winner === game.yourColor;
  return { title: won ? 'You won!' : 'You lost', detail: reason ? `by ${reason}` : '' };
}

export default function GameScreen({ navigation }: Props) {
  const { settings } = useAuth();
  const { game, move, resign, abort, offerDraw, respondDraw, clearGame } = useGame();
  const [error, setError] = useState<string | null>(null);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      <View style={[ui.center, { gap: 12, padding: 24 }]}>
        <Muted>No active game.</Muted>
        <Button title="Back" onPress={() => navigation.goBack()} />
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
  const result = game.end ? resultText(game) : null;
  const myRatingChange = game.end?.ratings
    ? (me === 'w' ? game.end.ratings.white : game.end.ratings.black)
    : null;

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ paddingVertical: spacing.sm, gap: spacing.sm }}>
      <PlayerBar side={sides[opp]} ms={oppMs} active={active && game.turn === opp} />
      {game.opponentDisconnected && active ? (
        <Text style={styles.notice}>Opponent disconnected — they lose if they do not return within 60s.</Text>
      ) : null}

      <ChessBoard
        fen={game.fen}
        orientation={me}
        interactive={active && game.turn === me}
        lastMove={game.lastMove}
        settings={settings}
        onMove={(from, to, promotion) => run(() => move(from, to, promotion))}
      />

      <PlayerBar side={sides[me]} ms={myMs} active={active && game.turn === me} />
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {opponentOffersDraw ? (
        <View style={[styles.panel, { borderColor: colors.primary, borderWidth: 1 }]}>
          <Text style={styles.panelTitle}>Your opponent offers a draw</Text>
          <View style={ui.row}>
            <Button title="Accept" style={{ flex: 1 }} onPress={() => run(() => respondDraw(true))} />
            <Button title="Decline" variant="secondary" style={{ flex: 1 }} onPress={() => run(() => respondDraw(false))} />
          </View>
        </View>
      ) : null}

      {result ? (
        <View style={styles.panel}>
          <Text style={styles.resultTitle}>{result.title}</Text>
          {result.detail ? <Muted>{result.detail}</Muted> : null}
          {myRatingChange ? (
            <Text style={{ color: myRatingChange.after >= myRatingChange.before ? colors.win : colors.loss, fontWeight: '700' }}>
              Rating {myRatingChange.before} → {myRatingChange.after} ({myRatingChange.after >= myRatingChange.before ? '+' : ''}
              {myRatingChange.after - myRatingChange.before})
            </Text>
          ) : null}
          <Button title="Back to lobby" onPress={() => navigation.goBack()} style={{ alignSelf: 'stretch' }} />
        </View>
      ) : (
        <View style={[ui.row, { paddingHorizontal: spacing.lg }]}>
          {canAbort ? (
            <Button title="Abort" variant="secondary" style={{ flex: 1 }} onPress={() => run(abort)} />
          ) : (
            <Button
              title="Resign"
              variant="danger"
              style={{ flex: 1 }}
              onPress={() =>
                Alert.alert('Resign?', 'You will lose this game.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Resign', style: 'destructive', onPress: () => run(resign) },
                ])
              }
            />
          )}
          {game.mode !== 'VS_COMPUTER' ? (
            <Button
              title={game.drawOfferBy === me ? 'Draw offered' : 'Offer draw'}
              variant="secondary"
              style={{ flex: 1 }}
              disabled={canAbort || game.drawOfferBy === me}
              onPress={() => run(offerDraw)}
            />
          ) : null}
        </View>
      )}

      <View style={[styles.panel, { alignItems: 'stretch' }]}>
        <Muted>
          {game.mode === 'VS_COMPUTER' ? 'vs computer · unrated' : `${game.timeControl.label} · rated`}
        </Muted>
        <Text style={styles.moves}>{movePairs.length ? movePairs.join('   ') : 'No moves yet. White to move.'}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, gap: spacing.md },
  player: { color: colors.text, fontSize: 16, fontWeight: '700' },
  rating: { color: colors.muted, fontWeight: '400' },
  clock: { backgroundColor: colors.cardAlt, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6, minWidth: 84, alignItems: 'center' },
  clockActive: { backgroundColor: '#f0efed' },
  clockLow: { backgroundColor: '#ff8a80' },
  clockText: { color: colors.text, fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] },
  notice: { color: colors.warning, textAlign: 'center', paddingHorizontal: spacing.lg },
  error: { color: colors.danger, textAlign: 'center' },
  panel: { backgroundColor: colors.card, marginHorizontal: spacing.lg, borderRadius: 12, padding: spacing.lg, gap: spacing.sm, alignItems: 'center' },
  panelTitle: { color: colors.text, fontWeight: '700', fontSize: 16 },
  resultTitle: { color: colors.text, fontSize: 26, fontWeight: '800' },
  moves: { color: colors.text, fontSize: 14, lineHeight: 22 },
});
