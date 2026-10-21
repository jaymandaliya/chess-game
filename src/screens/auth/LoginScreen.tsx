import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../../auth/AuthContext';
import { errorMessage } from '../../api/client';
import { AuthStackParams } from '../../navigation/navigationRef';
import { Button, ErrorText, Field, Muted, styles } from '../../components/ui';
import { colors } from '../../theme';

type Props = NativeStackScreenProps<AuthStackParams, 'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
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
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.content, { flexGrow: 1, justifyContent: 'center' }]} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', marginBottom: 24 }}>
          <Text style={{ fontSize: 64, color: colors.text }}>{'♞︎'}</Text>
          <Text style={{ color: colors.text, fontSize: 28, fontWeight: '800' }}>Chess Platform</Text>
          <Muted>Play, improve, win.</Muted>
        </View>
        <ErrorText message={error} />
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" textContentType="password" onSubmitEditing={submit} />
        <Button title="Sign in" onPress={submit} loading={loading} disabled={!email || !password} />
        <Button title="Create an account" variant="secondary" onPress={() => navigation.navigate('Register')} />
        <Text style={{ color: colors.primary, textAlign: 'center', padding: 8 }} onPress={() => navigation.navigate('ForgotPassword')}>
          Forgot password?
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
