import React, { useState } from 'react';
import { Keyboard, ScrollView, StyleSheet, Text, View } from 'react-native';
import { KeyRound, Mail, MailCheck, Send } from 'lucide-react-native';
import { api, errorMessage } from '../../api/client';
import { Button, Card, ErrorText, Field, IconBadge, styles as ui } from '../../components/ui';
import { colors, spacing, type } from '../../theme';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!email.trim() || loading) return;
    Keyboard.dismiss();
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
    <ScrollView style={ui.screen} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <IconBadge icon={KeyRound} color={colors.gold} size={52} />
        <Text style={type.h1}>Reset your password</Text>
        <Text style={type.caption}>Enter your account email and we will send you a reset link.</Text>
      </View>
      {sent ? (
        <Card style={styles.sent}>
          <IconBadge icon={MailCheck} size={44} />
          <Text style={type.h2}>Check your inbox</Text>
          <Text style={[type.caption, styles.centerText]}>If {email} is registered, a reset link is on its way.</Text>
        </Card>
      ) : (
        <>
          <ErrorText message={error} />
          <Field
            label="Email"
            icon={Mail}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="username"
            returnKeyType="send"
            onSubmitEditing={submit}
          />
          <Button title="Send reset link" icon={Send} onPress={submit} loading={loading} disabled={!email.trim()} />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.xl, gap: spacing.md },
  header: { gap: spacing.sm, marginBottom: spacing.sm },
  sent: { alignItems: 'center', paddingVertical: spacing.xl },
  centerText: { textAlign: 'center' },
});
