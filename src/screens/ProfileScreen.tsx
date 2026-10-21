import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { KeyRound, LogOut, Palette, Pencil } from 'lucide-react-native';
import { api } from '../api/client';
import { Profile } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { AppStackParams } from '../navigation/navigationRef';
import { Avatar, Card, ListRow, Stat, styles as ui } from '../components/ui';
import { colors, spacing, type } from '../theme';

export default function ProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParams>>();
  const { user, logout } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);

  useFocusEffect(
    useCallback(() => {
      api<Profile>('/player/profile')
        .then(setProfile)
        .catch(() => {});
    }, []),
  );

  const name = profile?.displayName ?? user?.displayName ?? '';

  return (
    <SafeAreaView style={ui.screen} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={ui.content}
      >
        <View style={styles.header}>
          <Avatar name={name || '?'} size={88} />
          <Text style={type.h1}>{name}</Text>
          <Text style={type.caption}>{profile?.email ?? user?.email}</Text>
          {profile?.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
        </View>

        <Card>
          <View style={ui.row}>
            <Stat label="Rating" value={profile?.rating ?? '—'} />
            <View style={styles.sep} />
            <Stat label="Peak" value={profile?.peakRating ?? '—'} />
            <View style={styles.sep} />
            <Stat label="Country" value={profile?.country ?? '—'} />
          </View>
        </Card>

        <Text style={[type.overline, styles.groupLabel]}>Account</Text>
        <Card style={styles.menu}>
          <ListRow
            icon={Pencil}
            title="Edit profile"
            subtitle="Name, country, bio"
            onPress={() => navigation.navigate('EditProfile')}
          />
          <View style={styles.divider} />
          <ListRow
            icon={KeyRound}
            iconColor={colors.gold}
            title="Change password"
            onPress={() => navigation.navigate('ChangePassword')}
          />
          <View style={styles.divider} />
          <ListRow
            icon={Palette}
            iconColor={colors.accent}
            title="Board & gameplay"
            subtitle="Theme, legal moves, auto-queen"
            onPress={() => navigation.navigate('Settings')}
          />
        </Card>

        <Card style={styles.menu}>
          <ListRow
            icon={LogOut}
            title="Sign out"
            danger
            onPress={() =>
              Alert.alert('Sign out?', 'You can sign back in any time.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Sign out', style: 'destructive', onPress: logout },
              ])
            }
          />
        </Card>

        {profile ? (
          <Text style={[type.caption, styles.since]}>
            Member since{' '}
            {new Date(profile.createdAt).toLocaleDateString('en-IN', {
              month: 'long',
              year: 'numeric',
            })}
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', gap: 6, paddingVertical: spacing.lg },
  bio: {
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 300,
  },
  sep: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    backgroundColor: colors.border,
  },
  groupLabel: { marginTop: spacing.sm, marginLeft: spacing.xs },
  menu: { padding: 0, gap: 0, overflow: 'hidden' },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: 68,
  },
  since: { textAlign: 'center', marginTop: spacing.sm },
});
