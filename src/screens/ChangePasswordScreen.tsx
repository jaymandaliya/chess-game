import React, { useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api, errorMessage, SessionPayload, storeSession } from '../api/client';
import { AppStackParams } from '../navigation/navigationRef';
import { Button, ErrorText, Field, Muted, styles as ui } from '../components/ui';

type Props = NativeStackScreenProps<AppStackParams, 'ChangePassword'>;

export default function ChangePasswordScreen({ navigation }: Props) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    if (next !== confirm) {
      setError('The new passwords do not match');
      return;
    }
    setSaving(true);
    try {
      // Other devices are signed out; this device gets a fresh session
      const session = await api<SessionPayload>('/auth/change-password', {
        method: 'POST',
        body: { currentPassword: current, newPassword: next },
      });
      await storeSession(session);
      Alert.alert('Password changed', 'Other devices have been signed out.');
      navigation.goBack();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled">
      <ErrorText message={error} />
      <Field label="Current password" value={current} onChangeText={setCurrent} secureTextEntry autoComplete="current-password" />
      <Field label="New password" value={next} onChangeText={setNext} secureTextEntry autoComplete="new-password" />
      <Field label="Confirm new password" value={confirm} onChangeText={setConfirm} secureTextEntry autoComplete="new-password" />
      <Muted>At least 8 characters, with a letter and a number.</Muted>
      <Button title="Change password" onPress={save} loading={saving} disabled={!current || !next || !confirm} />
    </ScrollView>
  );
}
