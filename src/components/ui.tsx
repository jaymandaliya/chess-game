import React, { useId, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import type { TextInputInstance } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { ChevronRight, Eye, EyeOff } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { avatarColor, colors, radius, spacing, type } from '../theme';

// ---------- Layout ----------

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

// Card with a diagonal gradient background (drawn with SVG, no extra native module)
export function GradientCard({
  from,
  to,
  children,
  style,
}: {
  from: string;
  to: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const id = `g${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <View style={[styles.gradientCard, style]}>
      <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={from} />
            <Stop offset="1" stopColor={to} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
      {children}
    </View>
  );
}

export function SectionTitle({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <View style={styles.sectionTitle}>
      <Text style={type.h2}>{title}</Text>
      {action}
    </View>
  );
}

// ---------- Text ----------

export function Title({ children }: { children: React.ReactNode }) {
  return <Text style={type.h1}>{children}</Text>;
}

export function Muted({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[type.caption, style]}>{children}</Text>;
}

export function ErrorText({ message }: { message?: string | null }) {
  return message ? (
    <View style={styles.errorBox}>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  ) : null;
}

// ---------- Controls ----------

interface ButtonProps {
  title: string;
  onPress(): void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: LucideIcon;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

const BUTTON_COLORS = {
  primary: { bg: colors.primary, fg: colors.onPrimary, border: colors.primary },
  secondary: { bg: colors.surfaceAlt, fg: colors.text, border: colors.border },
  ghost: { bg: 'transparent', fg: colors.text, border: colors.border },
  danger: { bg: colors.dangerSoft, fg: colors.danger, border: 'transparent' },
};

export function Button({ title, onPress, variant = 'primary', icon: Icon, loading, disabled, style }: ButtonProps) {
  const c = BUTTON_COLORS[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: c.bg, borderColor: c.border, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 },
        pressed && !disabled ? styles.pressed : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={c.fg} />
      ) : (
        <>
          {Icon ? <Icon size={19} color={c.fg} strokeWidth={2.4} /> : null}
          <Text style={[styles.buttonText, { color: c.fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

type FieldProps = TextInputProps & { label: string; error?: string; icon?: LucideIcon };

// forwardRef so forms can move focus to the next field when Return is pressed
export const Field = React.forwardRef<TextInputInstance, FieldProps>(function Field(
  { label, error, icon: Icon, secureTextEntry, style, onFocus, onBlur, ...props },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(true);
  const isPassword = Boolean(secureTextEntry);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputWrap, focused && styles.inputFocused, error ? styles.inputError : null]}>
        {Icon ? <Icon size={18} color={focused ? colors.primary : colors.muted} /> : null}
        <TextInput
          ref={ref}
          placeholderTextColor={colors.muted}
          selectionColor={colors.primary}
          secureTextEntry={isPassword && hidden}
          style={[styles.input, style]}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...props}
        />
        {isPassword ? (
          <Pressable
            onPress={() => setHidden((h) => !h)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
          >
            {hidden ? <Eye size={18} color={colors.muted} /> : <EyeOff size={18} color={colors.muted} />}
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
});

// Small text button: its tap area is only the text itself, not the full row
export function LinkButton({ title, onPress, align = 'center' }: { title: string; onPress(): void; align?: 'center' | 'flex-end' }) {
  return (
    <Pressable accessibilityRole="link" onPress={onPress} hitSlop={8} style={[styles.link, { alignSelf: align }]}>
      <Text style={styles.linkText}>{title}</Text>
    </Pressable>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange(key: T): void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={String(o.key)}
            onPress={() => onChange(o.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------- Data display ----------

export function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
  const bg = avatarColor(name);
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: `${bg}33`, borderColor: bg }]}>
      <Text style={{ color: bg, fontSize: size * 0.38, fontWeight: '800' }}>{initials || '?'}</Text>
    </View>
  );
}

export function IconBadge({ icon: Icon, color = colors.primary, size = 40 }: { icon: LucideIcon; color?: string; size?: number }) {
  return (
    <View style={[styles.iconBadge, { width: size, height: size, borderRadius: size * 0.32, backgroundColor: `${color}22` }]}>
      <Icon size={size * 0.5} color={color} strokeWidth={2.2} />
    </View>
  );
}

export function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
      <Text style={type.overline}>{label}</Text>
    </View>
  );
}

export function ListRow({
  icon,
  iconColor,
  title,
  subtitle,
  onPress,
  right,
  danger,
}: {
  icon?: LucideIcon;
  iconColor?: string;
  title: string;
  subtitle?: string;
  onPress?(): void;
  right?: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [styles.listRow, pressed && onPress ? { backgroundColor: colors.surfaceAlt } : null]}
    >
      {icon ? <IconBadge icon={icon} color={danger ? colors.danger : iconColor ?? colors.primary} size={36} /> : null}
      <View style={{ flex: 1 }}>
        <Text style={[styles.listTitle, danger && { color: colors.danger }]}>{title}</Text>
        {subtitle ? <Muted>{subtitle}</Muted> : null}
      </View>
      {right ?? (onPress ? <ChevronRight size={18} color={colors.muted} /> : null)}
    </Pressable>
  );
}

export function Loading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  gradientCard: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm, overflow: 'hidden' },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  button: {
    height: 54,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  pressed: { transform: [{ scale: 0.985 }] },
  buttonText: { fontSize: 16, fontWeight: '700' },
  field: { gap: 6 },
  label: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  inputWrap: {
    height: 54,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md + 2,
  },
  inputFocused: { borderColor: colors.primary, backgroundColor: colors.surfaceAlt },
  inputError: { borderColor: colors.danger },
  input: { flex: 1, height: '100%', color: colors.text, fontSize: 16 },
  fieldError: { color: colors.danger, fontSize: 12 },
  errorBox: { backgroundColor: colors.dangerSoft, borderRadius: radius.md, padding: spacing.md },
  errorText: { color: '#FECDD3', fontSize: 14 },
  link: { paddingVertical: 6, paddingHorizontal: 4 },
  linkText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  segmented: { flexDirection: 'row', backgroundColor: colors.bg, borderRadius: radius.md, padding: 4, gap: 4 },
  segment: { flex: 1, paddingVertical: 10, borderRadius: radius.sm, alignItems: 'center' },
  segmentActive: { backgroundColor: colors.elevated },
  segmentText: { color: colors.muted, fontWeight: '700', fontSize: 14 },
  segmentTextActive: { color: colors.text },
  avatar: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  iconBadge: { alignItems: 'center', justifyContent: 'center' },
  stat: { flex: 1, alignItems: 'center', gap: 4 },
  statValue: { color: colors.text, fontSize: 22, fontWeight: '800' },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  listTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
});
