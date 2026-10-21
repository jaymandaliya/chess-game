import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { errorMessage } from '../api/client';
import { PlayerSettings } from '../api/types';
import { Card, Muted, styles as ui, Title } from '../components/ui';
import { boardThemes, colors, spacing } from '../theme';

const TOGGLES: { key: keyof PlayerSettings; label: string; hint: string }[] = [
  { key: 'showLegalMoves', label: 'Show legal moves', hint: 'Dots on squares the selected piece can move to' },
  { key: 'autoQueen', label: 'Auto-queen', hint: 'Always promote pawns to a queen' },
];

export default function SettingsScreen() {
  const { settings, updateSettings } = useAuth();

  const save = (patch: Partial<PlayerSettings>) =>
    updateSettings(patch).catch((err) => Alert.alert('Not saved', errorMessage(err)));

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.content}>
      <Title>Board</Title>
      <View style={styles.themes}>
        {(Object.keys(boardThemes) as PlayerSettings['boardTheme'][]).map((name) => (
          <Pressable
            key={name}
            onPress={() => save({ boardTheme: name })}
            style={[styles.theme, settings.boardTheme === name && styles.themeActive]}
            accessibilityLabel={`${name} board`}
            accessibilityState={{ selected: settings.boardTheme === name }}
          >
            <View style={styles.preview}>
              {[0, 1, 2, 3].map((i) => (
                <View key={i} style={{ width: '50%', height: '50%', backgroundColor: i === 0 || i === 3 ? boardThemes[name].light : boardThemes[name].dark }} />
              ))}
            </View>
            <Text style={styles.themeName}>{name}</Text>
          </Pressable>
        ))}
      </View>

      <Title>Gameplay</Title>
      <Card style={{ gap: 0, paddingVertical: spacing.sm }}>
        {TOGGLES.map((t, i) => (
          <View key={t.key} style={[styles.toggle, i > 0 && styles.divider]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>{t.label}</Text>
              <Muted>{t.hint}</Muted>
            </View>
            <Switch
              value={Boolean(settings[t.key])}
              onValueChange={(v) => save({ [t.key]: v } as Partial<PlayerSettings>)}
              trackColor={{ true: colors.primary, false: colors.border }}
            />
          </View>
        ))}
      </Card>

      <Muted>Settings are saved to your account and follow you to other devices.</Muted>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  themes: { flexDirection: 'row', gap: spacing.sm },
  theme: { flex: 1, backgroundColor: colors.card, borderRadius: 10, padding: spacing.sm, alignItems: 'center', gap: 6, borderWidth: 2, borderColor: 'transparent' },
  themeActive: { borderColor: colors.primary },
  preview: { width: 48, height: 48, flexDirection: 'row', flexWrap: 'wrap', borderRadius: 4, overflow: 'hidden' },
  themeName: { color: colors.text, fontWeight: '600', textTransform: 'capitalize' },
  toggle: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, gap: spacing.md },
  divider: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
  toggleLabel: { color: colors.text, fontSize: 15, fontWeight: '600' },
});
