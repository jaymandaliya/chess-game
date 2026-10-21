import React, { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api, ApiError, errorMessage } from '../api/client';
import { Profile } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { AppStackParams } from '../navigation/navigationRef';
import {
  Button,
  ErrorText,
  Field,
  Loading,
  styles as ui,
} from '../components/ui';

type Props = NativeStackScreenProps<AppStackParams, 'EditProfile'>;

export default function EditProfileScreen({ navigation }: Props) {
  const { refreshUser } = useAuth();
  const [loaded, setLoaded] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [country, setCountry] = useState('');
  const [bio, setBio] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    api<Profile>('/player/profile')
      .then(p => {
        setDisplayName(p.displayName);
        setCountry(p.country ?? '');
        setBio(p.bio ?? '');
      })
      .catch(err => setError(errorMessage(err)))
      .finally(() => setLoaded(true));
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    setFieldErrors({});
    try {
      await api('/player/profile', {
        method: 'PATCH',
        body: {
          displayName: displayName.trim(),
          country: country.trim() || null,
          bio: bio.trim() || null,
        },
      });
      await refreshUser();
      navigation.goBack();
    } catch (err) {
      if (err instanceof ApiError && err.details)
        setFieldErrors(
          Object.fromEntries(err.details.map(d => [d.path, d.message])),
        );
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return <Loading />;

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      style={ui.screen}
      contentContainerStyle={ui.content}
      keyboardShouldPersistTaps="handled"
    >
      <ErrorText message={error} />
      <Field
        label="Display name"
        value={displayName}
        onChangeText={setDisplayName}
        maxLength={30}
        error={fieldErrors.displayName}
      />
      <Field
        label="Country code"
        value={country}
        onChangeText={setCountry}
        placeholder="IN"
        autoCapitalize="characters"
        maxLength={2}
        error={fieldErrors.country}
      />
      <Field
        label="Bio"
        value={bio}
        onChangeText={setBio}
        maxLength={200}
        multiline
        style={{ height: 96 }}
        error={fieldErrors.bio}
      />
      <Button
        title="Save"
        onPress={save}
        loading={saving}
        disabled={displayName.trim().length < 3}
      />
    </ScrollView>
  );
}
