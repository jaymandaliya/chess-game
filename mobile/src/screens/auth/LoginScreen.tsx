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
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Lock, LogIn, Mail, UserPlus } from 'lucide-react-native';
import { useAuth } from '../../auth/AuthContext';
import { errorMessage } from '../../api/client';
import { DEMO_LOGIN } from '../../config';
import { AuthStackParams } from '../../navigation/navigationRef';
import {
  Button,
  ErrorText,
  Field,
  LinkButton,
  styles as ui,
} from '../../components/ui';
import BrandMark from '../../components/BrandMark';
import { colors, spacing, type } from '../../theme';

type Props = NativeStackScreenProps<AuthStackParams, 'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const { login } = useAuth();
  const [email, setEmail] = useState(DEMO_LOGIN?.email ?? '');
  const [password, setPassword] = useState(DEMO_LOGIN?.password ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<TextInputInstance>(null);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !loading;

  async function submit() {
    if (!canSubmit) return;
    Keyboard.dismiss();
    setError(null);
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(
        err instanceof Error && !('code' in err)
          ? err.message
          : errorMessage(err),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={ui.screen} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={ui.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.hero}>
            <BrandMark size={84} />
            <Text style={[type.hero, styles.center]}>Welcome back</Text>
            <Text style={[type.caption, styles.center]}>
              Sign in to play rated games and track your progress.
            </Text>
          </View>

          <View style={styles.form}>
            <ErrorText message={error} />
            {/* Return on Email moves to Password; Return on Password signs in */}
            <Field
              label="Email"
              icon={Mail}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              keyboardType="email-address"
              textContentType="username"
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
              placeholder="Your password"
              secureTextEntry
              autoComplete="password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={submit}
            />
            <LinkButton
              title="Forgot password?"
              align="flex-end"
              onPress={() => navigation.navigate('ForgotPassword')}
            />
            <Button
              title="Sign in"
              icon={LogIn}
              onPress={submit}
              loading={loading}
              disabled={!canSubmit}
            />
          </View>

          <View style={styles.divider}>
            <View style={styles.line} />
            <Text style={type.caption}>New to Chess Platform?</Text>
            <View style={styles.line} />
          </View>
          <Button
            title="Create an account"
            icon={UserPlus}
            variant="secondary"
            onPress={() => navigation.navigate('Register')}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.lg,
  },
  hero: { alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  center: { textAlign: 'center' },
  form: { gap: spacing.md },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  line: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
});
