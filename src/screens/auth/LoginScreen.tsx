import React, { useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { TextInputInstance } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../../auth/AuthContext';
import { errorMessage } from '../../api/client';
import { DEMO_LOGIN } from '../../config';
import { AuthStackParams } from '../../navigation/navigationRef';
import { Button, ErrorText, Field, LinkButton, Muted, styles as ui } from '../../components/ui';
import { colors } from '../../theme';

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
      setError(err instanceof Error && !('code' in err) ? err.message : errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={ui.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[ui.content, styles.container]} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.logo}>{'♞︎'}</Text>
          <Text style={styles.title}>Chess Platform</Text>
          <Muted>Play, improve, win.</Muted>
        </View>
        <ErrorText message={error} />
        {/* Return on Email moves to Password; Return on Password signs in */}
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
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
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
        <Button title="Sign in" onPress={submit} loading={loading} disabled={!canSubmit} />
        <Button title="Create an account" variant="secondary" onPress={() => navigation.navigate('Register')} />
        <LinkButton title="Forgot password?" onPress={() => navigation.navigate('ForgotPassword')} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: 24 },
  logo: { fontSize: 64, color: colors.text },
  title: { color: colors.text, fontSize: 28, fontWeight: '800' },
});
