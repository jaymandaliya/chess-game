import React from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Check, Crown, Target } from 'lucide-react-native';
import { useAuth } from '../auth/AuthContext';
import { errorMessage } from '../api/client';
import { PlayerSettings } from '../api/types';
import { Card, ListRow, styles as ui } from '../components/ui';
import { boardThemes, colors, radius, spacing, type } from '../theme';

const TOGGLES = [
  {
    key: 'showLegalMoves' as const,
    icon: Target,
    label: 'Show legal moves',
    hint: 'Dots on squares the selected piece can reach',
  },
  {
    key: 'autoQueen' as const,
    icon: Crown,
    label: 'Auto-queen',
    hint: 'Always promote pawns to a queen',
  },
];

export default function SettingsScreen() {
  const { settings, updateSettings } = useAuth();

  const save = (patch: Partial<PlayerSettings>) =>
    updateSettings(patch).catch(err =>
      Alert.alert('Not saved', errorMessage(err)),
    );

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      style={ui.screen}
      contentContainerStyle={ui.content}
    >
      <Text style={type.overline}>Board theme</Text>
      <View style={styles.themes}>
        {(Object.keys(boardThemes) as PlayerSettings['boardTheme'][]).map(
          name => {
            const active = settings.boardTheme === name;
            return (
              <Pressable
                key={name}
                onPress={() => save({ boardTheme: name })}
                style={[styles.theme, active && styles.themeActive]}
                accessibilityLabel={`${name} board`}
                accessibilityState={{ selected: active }}
              >
                <View style={styles.preview}>
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                    <View
                      key={i}
                      style={[
                        styles.cell,
                        {
                          backgroundColor:
                            i % 2 === 0
                              ? boardThemes[name].light
                              : boardThemes[name].dark,
                        },
                      ]}
                    />
                  ))}
                </View>
                <View style={styles.themeLabel}>
                  <Text style={styles.themeName}>{name}</Text>
                  {active ? (
                    <Check size={14} color={colors.primary} strokeWidth={3} />
                  ) : null}
                </View>
              </Pressable>
            );
          },
        )}
      </View>

      <Text style={[type.overline, { marginTop: spacing.md }]}>Gameplay</Text>
      <Card style={styles.menu}>
        {TOGGLES.map((t, i) => (
          <View key={t.key}>
            {i > 0 ? <View style={styles.divider} /> : null}
            <ListRow
              icon={t.icon}
              title={t.label}
              subtitle={t.hint}
              right={
                <Switch
                  value={Boolean(settings[t.key])}
                  onValueChange={v => save({ [t.key]: v })}
                  trackColor={{ true: colors.primary, false: colors.border }}
                  thumbColor="#ffffff"
                />
              }
            />
          </View>
        ))}
      </Card>
      <Text style={[type.caption, { textAlign: 'center' }]}>
        Saved to your account and synced across devices.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  themes: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  theme: {
    width: '48.6%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.sm,
    gap: spacing.sm,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  themeActive: { borderColor: colors.primary },
  preview: {
    aspectRatio: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  cell: { width: '33.333%', height: '33.333%' },
  themeLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  themeName: {
    color: colors.text,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  menu: { padding: 0, gap: 0, overflow: 'hidden' },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: 68,
  },
});
