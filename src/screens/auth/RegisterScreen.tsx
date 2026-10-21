import React, { useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { TextInputInstance } from 'react-native';
import { Lock, Mail, Sparkles, User, UserPlus } from 'lucide-react-native';
import { useAuth } from '../../auth/AuthContext';
import { ApiError, errorMessage } from '../../api/client';
import {
  Button,
  ErrorText,
  Field,
  IconBadge,
  styles as ui,
} from '../../components/ui';
import { colors, spacing, type } from '../../theme';

export default function RegisterScreen() {
  const { register } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const emailRef = useRef<TextInputInstance>(null);
  const passwordRef = useRef<TextInputInstance>(null);

  const canSubmit =
    displayName.trim().length > 0 &&
    email.trim().length > 0 &&
    password.length > 0 &&
    !loading;

  async function submit() {
    if (!canSubmit) return;
    Keyboard.dismiss();
    setError(null);
    setFieldErrors({});
    setLoading(true);
    try {
      await register(email.trim(), password, displayName.trim());
    } catch (err) {
      if (err instanceof ApiError && err.details) {
        setFieldErrors(
          Object.fromEntries(err.details.map(d => [d.path, d.message])),
        );
      }
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={ui.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <IconBadge icon={Sparkles} color={colors.accent} size={52} />
          <Text style={type.h1}>Create your account</Text>
          <Text style={type.caption}>
            Everyone starts at 1200. Play rated games to climb.
          </Text>
        </View>
        <ErrorText message={error} />
        <Field
          label="Display name"
          icon={User}
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="How other players see you"
          autoCapitalize="words"
          textContentType="nickname"
          maxLength={30}
          error={fieldErrors.displayName}
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => emailRef.current?.focus()}
        />
        <Field
          ref={emailRef}
          label="Email"
          icon={Mail}
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="username"
          error={fieldErrors.email}
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => passwordRef.current?.focus()}
        />
        <Field
          ref={passwordRef}
          label="Password"
          icon={Lock}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType="newPassword"
          placeholder="8+ characters, a letter and a number"
          error={fieldErrors.password}
          returnKeyType="go"
          onSubmitEditing={submit}
        />
        <Button
          title="Create account"
          icon={UserPlus}
          onPress={submit}
          loading={loading}
          disabled={!canSubmit}
          style={styles.cta}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.xl, gap: spacing.md },
  header: { gap: spacing.sm, marginBottom: spacing.sm },
  cta: { marginTop: spacing.sm },
});
