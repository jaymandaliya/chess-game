import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Search, X } from 'lucide-react-native';
import { useGame } from '../game/GameContext';
import { AppStackParams } from '../navigation/navigationRef';
import { Button, styles as ui } from '../components/ui';
import { colors, spacing, type } from '../theme';

type Props = NativeStackScreenProps<AppStackParams, 'Matchmaking'>;

export default function MatchmakingScreen({ route, navigation }: Props) {
  const { timeControl } = route.params;
  const { joinQueue, leaveQueue } = useGame();
  const [seconds, setSeconds] = useState(0);
  const leaveRef = useRef(leaveQueue);
  leaveRef.current = leaveQueue;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1600, easing: Easing.out(Easing.ease), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  useEffect(() => {
    joinQueue(timeControl).catch((err) => {
      Alert.alert('Could not join', err instanceof Error ? err.message : 'Try again');
      navigation.goBack();
    });
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => {
      clearInterval(timer);
      // No-op on the server if we were already paired
      leaveRef.current();
    };
  }, [timeControl, joinQueue, navigation]);

  const ring = {
    transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.6] }) }],
    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
  };

  return (
    <View style={[ui.center, styles.container]}>
      <View style={styles.radar}>
        <Animated.View style={[styles.ring, ring]} />
        <View style={styles.core}>
          <Search size={34} color={colors.onPrimary} strokeWidth={2.6} />
        </View>
      </View>
      <Text style={type.h1}>Finding an opponent</Text>
      <View style={styles.pill}>
        <Text style={styles.pillText}>
          {timeControl} · Rated · {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
        </Text>
      </View>
      <Text style={[type.caption, styles.hint]}>We pair you with a player of similar rating. The range widens the longer you wait.</Text>
      <Button title="Cancel" icon={X} variant="secondary" onPress={() => navigation.goBack()} style={styles.cancel} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.xl, gap: spacing.lg },
  radar: { width: 180, height: 180, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 140, height: 140, borderRadius: 70, backgroundColor: colors.primary },
  core: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  pill: { backgroundColor: colors.surfaceAlt, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  pillText: { color: colors.text, fontWeight: '700', fontVariant: ['tabular-nums'] },
  hint: { textAlign: 'center', maxWidth: 300 },
  cancel: { alignSelf: 'stretch', marginTop: spacing.md },
});
