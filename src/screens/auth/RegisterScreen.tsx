import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useAuth } from '../../auth/AuthContext';
import { ApiError, errorMessage } from '../../api/client';
import { Button, ErrorText, Field, Muted, styles, Title } from '../../components/ui';

export default function RegisterScreen() {
  const { register } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function submit() {
    setError(null);
    setFieldErrors({});
    setLoading(true);
    try {
      await register(email.trim(), password, displayName.trim());
    } catch (err) {
      if (err instanceof ApiError && err.details) {
        setFieldErrors(Object.fromEntries(err.details.map((d) => [d.path, d.message])));
      }
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Title>Create your account</Title>
        <Muted>Everyone starts at 1200 rating.</Muted>
        <ErrorText message={error} />
        <Field label="Display name" value={displayName} onChangeText={setDisplayName} autoCapitalize="words" maxLength={30} error={fieldErrors.displayName} />
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" error={fieldErrors.email} />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry placeholder="8+ characters, a letter and a number" error={fieldErrors.password} />
        <Button title="Create account" onPress={submit} loading={loading} disabled={!displayName || !email || !password} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
