import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useGame } from '../game/GameContext';
import { AppStackParams } from '../navigation/navigationRef';
import { Button, Muted, styles } from '../components/ui';
import { colors } from '../theme';

type Props = NativeStackScreenProps<AppStackParams, 'Matchmaking'>;

export default function MatchmakingScreen({ route, navigation }: Props) {
  const { timeControl } = route.params;
  const { joinQueue, leaveQueue } = useGame();
  const [seconds, setSeconds] = useState(0);
  const leaveRef = useRef(leaveQueue);
  leaveRef.current = leaveQueue;

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

  return (
    <View style={[styles.center, { padding: 24, gap: 16 }]}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800' }}>Finding an opponent…</Text>
      <Muted>
        {timeControl} · rated · {seconds}s
      </Muted>
      <Muted style={{ textAlign: 'center' }}>We match you with a player of similar rating. The range widens the longer you wait.</Muted>
      <Button title="Cancel" variant="secondary" onPress={() => navigation.goBack()} style={{ alignSelf: 'stretch' }} />
    </View>
  );
}
