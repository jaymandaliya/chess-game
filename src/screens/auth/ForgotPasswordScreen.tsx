import React, { useState } from 'react';
import { ScrollView } from 'react-native';
import { api, errorMessage } from '../../api/client';
import { Button, Card, ErrorText, Field, Muted, styles, Title } from '../../components/ui';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setLoading(true);
    try {
      await api('/auth/forgot-password', { method: 'POST', auth: false, body: { email: email.trim() } });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Title>Reset your password</Title>
      {sent ? (
        <Card>
          <Muted>If {email} is registered, we have emailed a reset link. Open it to choose a new password.</Muted>
        </Card>
      ) : (
        <>
          <Muted>Enter your account email and we will send you a reset link.</Muted>
          <ErrorText message={error} />
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="username"
            returnKeyType="send"
            onSubmitEditing={() => email.trim() && !loading && submit()}
          />
          <Button title="Send reset link" onPress={submit} loading={loading} disabled={!email} />
        </>
      )}
    </ScrollView>
  );
}
