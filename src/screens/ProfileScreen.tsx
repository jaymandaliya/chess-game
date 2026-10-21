import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api } from '../api/client';
import { Profile } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { AppStackParams } from '../navigation/navigationRef';
import { Button, Card, Muted, Stat, styles as ui, Title } from '../components/ui';
import { colors } from '../theme';

export default function ProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParams>>();
  const { logout } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);

  useFocusEffect(
    useCallback(() => {
      api<Profile>('/player/profile').then(setProfile).catch(() => {});
    }, []),
  );

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.content}>
      <Card style={{ alignItems: 'center' }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primaryDark, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: colors.text, fontSize: 32, fontWeight: '800' }}>{profile?.displayName?.[0]?.toUpperCase() ?? '?'}</Text>
        </View>
        <Title>{profile?.displayName ?? ' '}</Title>
        <Muted>{profile?.email}</Muted>
        {profile?.bio ? <Text style={{ color: colors.text, textAlign: 'center' }}>{profile.bio}</Text> : null}
        <View style={[ui.row, { marginTop: 8 }]}>
          <Stat label="Rating" value={profile?.rating ?? '—'} />
          <Stat label="Peak" value={profile?.peakRating ?? '—'} />
          <Stat label="Country" value={profile?.country ?? '—'} />
        </View>
        {profile ? <Muted>Member since {new Date(profile.createdAt).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</Muted> : null}
      </Card>
      <Button title="Edit profile" variant="secondary" onPress={() => navigation.navigate('EditProfile')} />
      <Button title="Settings" variant="secondary" onPress={() => navigation.navigate('Settings')} />
      <Button
        title="Sign out"
        variant="danger"
        onPress={() =>
          Alert.alert('Sign out?', undefined, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign out', style: 'destructive', onPress: logout },
          ])
        }
      />
    </ScrollView>
  );
}
