import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import type { TextInputInstance } from 'react-native';
import { colors, spacing } from '../theme';

interface ButtonProps {
  title: string;
  onPress(): void;
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({ title, onPress, variant = 'primary', loading, disabled, style }: ButtonProps) {
  const background = variant === 'primary' ? colors.primary : variant === 'danger' ? colors.danger : colors.cardAlt;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: background, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={colors.text} /> : <Text style={styles.buttonText}>{title}</Text>}
    </Pressable>
  );
}

// forwardRef so forms can move focus to the next field when Return is pressed
export const Field = React.forwardRef<TextInputInstance, TextInputProps & { label: string; error?: string }>(
  function Field({ label, error, style, ...props }, ref) {
    return (
      <View style={styles.field}>
        <Text style={styles.label}>{label}</Text>
        <TextInput
          ref={ref}
          placeholderTextColor={colors.muted}
          style={[styles.input, error ? { borderColor: colors.danger } : null, style]}
          {...props}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    );
  },
);

// Small text button: its tap area is only the text itself, not the full row
export function LinkButton({ title, onPress }: { title: string; onPress(): void }) {
  return (
    <Pressable accessibilityRole="link" onPress={onPress} hitSlop={8} style={styles.link}>
      <Text style={styles.linkText}>{title}</Text>
    </Pressable>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Title({ children }: { children: React.ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Muted({ children, style }: { children: React.ReactNode; style?: object }) {
  return <Text style={[styles.muted, style]}>{children}</Text>;
}

export function ErrorText({ message }: { message?: string | null }) {
  return message ? <Text style={styles.errorBox}>{message}</Text> : null;
}

export function Loading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );
}

export function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  button: { height: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  buttonText: { color: colors.text, fontSize: 16, fontWeight: '700' },
  field: { gap: spacing.xs },
  label: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  input: {
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    color: colors.text,
    paddingHorizontal: spacing.md,
    fontSize: 16,
  },
  error: { color: colors.danger, fontSize: 12 },
  link: { alignSelf: 'center', paddingVertical: 6, paddingHorizontal: 4 },
  linkText: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  errorBox: { color: colors.text, backgroundColor: '#5c2626', padding: spacing.md, borderRadius: 8, overflow: 'hidden' },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: spacing.lg, gap: spacing.sm },
  title: { color: colors.text, fontSize: 20, fontWeight: '800' },
  muted: { color: colors.muted, fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { color: colors.text, fontSize: 20, fontWeight: '800' },
});
