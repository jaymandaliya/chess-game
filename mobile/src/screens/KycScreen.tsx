import React, { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  BadgeCheck,
  Building2,
  Calendar,
  Clock,
  CreditCard,
  Send,
  ShieldCheck,
  Smartphone,
  User,
  XCircle,
} from 'lucide-react-native';
import { api, ApiError, errorMessage } from '../api/client';
import { Kyc } from '../api/types';
import { AppStackParams } from '../navigation/navigationRef';
import {
  Button,
  Card,
  ErrorText,
  Field,
  IconBadge,
  Loading,
  Muted,
  Segmented,
  styles as ui,
} from '../components/ui';
import { colors, spacing, type } from '../theme';

type Props = NativeStackScreenProps<AppStackParams, 'Kyc'>;

const STATUS = {
  PENDING: {
    icon: Clock,
    color: colors.warning,
    title: 'Under review',
    text: 'We are checking your details. This usually takes less than a day.',
  },
  APPROVED: {
    icon: BadgeCheck,
    color: colors.primary,
    title: 'Verified',
    text: 'You can withdraw play coins to your account below.',
  },
  REJECTED: {
    icon: XCircle,
    color: colors.danger,
    title: 'Not approved',
    text: 'Please correct your details and submit again.',
  },
} as const;

export default function KycScreen({ navigation }: Props) {
  const [kyc, setKyc] = useState<Kyc | null>(null);
  const [fullName, setFullName] = useState('');
  const [dob, setDob] = useState('');
  const [pan, setPan] = useState('');
  const [method, setMethod] = useState<'UPI' | 'BANK'>('UPI');
  const [upiId, setUpiId] = useState('');
  const [account, setAccount] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [holder, setHolder] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    api<Kyc>('/player/kyc')
      .then(k => {
        setKyc(k);
        if (k.fullName) setFullName(k.fullName);
      })
      .catch(err => setError(errorMessage(err)));
  }, []);

  if (!kyc)
    return error ? (
      <View style={[ui.screen, ui.content]}>
        <ErrorText message={error} />
      </View>
    ) : (
      <Loading />
    );

  async function submit() {
    setSaving(true);
    setError(null);
    setFieldErrors({});
    try {
      const body =
        method === 'UPI'
          ? {
              fullName: fullName.trim(),
              dateOfBirth: dob.trim(),
              pan: pan.trim(),
              payoutMethod: method,
              upiId: upiId.trim(),
            }
          : {
              fullName: fullName.trim(),
              dateOfBirth: dob.trim(),
              pan: pan.trim(),
              payoutMethod: method,
              bankAccount: account.trim(),
              ifsc: ifsc.trim(),
              accountHolderName: holder.trim(),
            };
      setKyc(await api<Kyc>('/player/kyc', { method: 'POST', body }));
      Alert.alert('Submitted', 'Your details are under review.');
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

  const status = kyc.status !== 'NOT_SUBMITTED' ? STATUS[kyc.status] : null;
  const canSubmit = kyc.status === 'NOT_SUBMITTED' || kyc.status === 'REJECTED';

  return (
    <KeyboardAvoidingView
      style={ui.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={ui.content}
        keyboardShouldPersistTaps="handled"
      >
        {status ? (
          <Card style={styles.status}>
            <IconBadge icon={status.icon} color={status.color} size={48} />
            <Text style={type.h2}>{status.title}</Text>
            <Muted style={styles.center}>
              {kyc.status === 'REJECTED' && kyc.rejectionReason
                ? kyc.rejectionReason
                : status.text}
            </Muted>
            {kyc.pan ? (
              <Muted>
                PAN {kyc.pan} · {kyc.payoutMethod} {kyc.payoutTo}
              </Muted>
            ) : null}
            {kyc.status === 'APPROVED' ? (
              <Button
                title="Go to withdraw"
                onPress={() => navigation.replace('Withdraw')}
                style={styles.stretch}
              />
            ) : null}
          </Card>
        ) : (
          <View style={styles.intro}>
            <IconBadge icon={ShieldCheck} color={colors.primary} size={52} />
            <Text style={type.h1}>Verify your identity</Text>
            <Muted>
              Needed once before your first withdrawal. Your PAN and account
              details are encrypted and only visible to our verification team.
            </Muted>
          </View>
        )}

        {canSubmit ? (
          <>
            <ErrorText message={error} />
            <Field
              label="Full name (as on PAN)"
              icon={User}
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
              error={fieldErrors.fullName}
            />
            <Field
              label="Date of birth"
              icon={Calendar}
              value={dob}
              onChangeText={setDob}
              placeholder="YYYY-MM-DD"
              keyboardType="numbers-and-punctuation"
              maxLength={10}
              error={fieldErrors.dateOfBirth}
            />
            <Field
              label="PAN"
              icon={CreditCard}
              value={pan}
              onChangeText={v => setPan(v.toUpperCase())}
              placeholder="ABCDE1234F"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={10}
              error={fieldErrors.pan}
            />
            <Text style={type.overline}>Receive money by</Text>
            <Segmented<'UPI' | 'BANK'>
              options={[
                { key: 'UPI', label: 'UPI' },
                { key: 'BANK', label: 'Bank account' },
              ]}
              value={method}
              onChange={setMethod}
            />
            {method === 'UPI' ? (
              <Field
                label="UPI ID"
                icon={Smartphone}
                value={upiId}
                onChangeText={setUpiId}
                placeholder="name@okaxis"
                autoCapitalize="none"
                autoCorrect={false}
                error={fieldErrors.upiId}
              />
            ) : (
              <>
                <Field
                  label="Account holder name"
                  icon={User}
                  value={holder}
                  onChangeText={setHolder}
                  autoCapitalize="words"
                  error={fieldErrors.accountHolderName}
                />
                <Field
                  label="Account number"
                  icon={Building2}
                  value={account}
                  onChangeText={setAccount}
                  keyboardType="number-pad"
                  maxLength={18}
                  error={fieldErrors.bankAccount}
                />
                <Field
                  label="IFSC"
                  icon={Building2}
                  value={ifsc}
                  onChangeText={v => setIfsc(v.toUpperCase())}
                  placeholder="SBIN0001234"
                  autoCapitalize="characters"
                  maxLength={11}
                  error={fieldErrors.ifsc}
                />
              </>
            )}
            <Muted>
              You must be 18 or older. Payouts go only to an account in your own
              name.
            </Muted>
            <Button
              title="Submit for verification"
              icon={Send}
              onPress={submit}
              loading={saving}
              disabled={!fullName || !dob || !pan}
            />
          </>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  status: { alignItems: 'center', paddingVertical: spacing.xl },
  center: { textAlign: 'center' },
  stretch: { alignSelf: 'stretch', marginTop: spacing.sm },
  intro: { gap: spacing.sm, marginBottom: spacing.sm },
});
