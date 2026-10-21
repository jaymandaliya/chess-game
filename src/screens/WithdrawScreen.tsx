import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Banknote,
  BadgeCheck,
  Clock,
  Coins,
  Lock,
  Send,
  XCircle,
} from 'lucide-react-native';
import { api, errorMessage, formatRupees } from '../api/client';
import {
  Page,
  Withdrawal,
  WithdrawalConfig,
  WithdrawalQuote,
} from '../api/types';
import { AppStackParams } from '../navigation/navigationRef';
import {
  Button,
  Card,
  Field,
  GradientCard,
  IconBadge,
  Loading,
  Muted,
  SectionTitle,
  styles as ui,
} from '../components/ui';
import { colors, spacing, type } from '../theme';

type Props = NativeStackScreenProps<AppStackParams, 'Withdraw'>;

const STATUS = {
  PENDING: { icon: Clock, color: colors.warning, label: 'Processing' },
  PAID: { icon: BadgeCheck, color: colors.primary, label: 'Paid' },
  REJECTED: {
    icon: XCircle,
    color: colors.danger,
    label: 'Rejected · coins returned',
  },
} as const;

export default function WithdrawScreen({ navigation }: Props) {
  const [config, setConfig] = useState<WithdrawalConfig | null>(null);
  const [history, setHistory] = useState<Withdrawal[]>([]);
  const [coins, setCoins] = useState('');
  const [quote, setQuote] = useState<WithdrawalQuote | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, h] = await Promise.all([
        api<WithdrawalConfig>('/player/withdrawals/config'),
        api<Page<Withdrawal>>('/player/withdrawals?limit=20'),
      ]);
      setConfig(c);
      setHistory(h.items);
    } catch (err) {
      Alert.alert('Could not load', errorMessage(err));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Server computes the money, rate and tax; the app only shows the quote
  const amount = Number(coins);
  useEffect(() => {
    if (!Number.isInteger(amount) || amount <= 0) {
      setQuote(null);
      return undefined;
    }
    const t = setTimeout(() => {
      api<WithdrawalQuote>(`/player/withdrawals/quote?coins=${amount}`)
        .then(setQuote)
        .catch(() => setQuote(null));
    }, 250);
    return () => clearTimeout(t);
  }, [amount]);

  if (!config) return <Loading />;

  async function submit() {
    setSubmitting(true);
    try {
      await api('/player/withdrawals', {
        method: 'POST',
        body: { coins: amount },
      });
      setCoins('');
      Alert.alert(
        'Request sent',
        'We will transfer the money after a quick check. Coins are held until then.',
      );
      await load();
    } catch (err) {
      Alert.alert('Withdrawal failed', errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const tooLow = amount > 0 && amount < config.minCoins;
  const tooHigh = amount > config.balance;

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      style={ui.screen}
      contentContainerStyle={ui.content}
      keyboardShouldPersistTaps="handled"
    >
      <GradientCard from="#14532D" to="#0F172A">
        <View style={ui.row}>
          <IconBadge icon={Coins} color={colors.gold} size={40} />
          <View style={{ flex: 1 }}>
            <Text style={type.overline}>Withdrawable play coins</Text>
            <Text style={styles.balance}>
              {config.balance.toLocaleString('en-IN')}
            </Text>
          </View>
        </View>
        <Muted>
          1 coin = {formatRupees(config.coinValuePaise)} · minimum{' '}
          {config.minCoins} coins · TDS {config.tdsPercent}%
        </Muted>
      </GradientCard>

      {!config.enabled ? (
        <Card style={styles.center}>
          <IconBadge icon={Lock} color={colors.muted} size={48} />
          <Text style={type.h2}>Withdrawals are not available yet</Text>
          <Muted style={styles.centerText}>
            We will let you know as soon as you can convert coins to money.
          </Muted>
        </Card>
      ) : config.kycStatus !== 'APPROVED' ? (
        <Card style={styles.center}>
          <IconBadge icon={BadgeCheck} color={colors.warning} size={48} />
          <Text style={type.h2}>
            {config.kycStatus === 'PENDING'
              ? 'KYC under review'
              : 'Verify your identity first'}
          </Text>
          <Muted style={styles.centerText}>
            A one-time PAN and payout account check is required before your
            first withdrawal.
          </Muted>
          {config.kycStatus !== 'PENDING' ? (
            <Button
              title="Complete KYC"
              onPress={() => navigation.navigate('Kyc')}
              style={styles.stretch}
            />
          ) : null}
        </Card>
      ) : (
        <Card style={styles.form}>
          <Field
            label="Coins to withdraw"
            icon={Coins}
            value={coins}
            onChangeText={v => setCoins(v.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            placeholder={`At least ${config.minCoins}`}
            error={
              tooLow
                ? `Minimum is ${config.minCoins} coins`
                : tooHigh
                ? 'More than your balance'
                : undefined
            }
          />
          {quote && !tooLow && !tooHigh ? (
            <View style={styles.quote}>
              <Row label="Value" value={formatRupees(quote.grossPaise)} />
              <Row
                label={`TDS (${quote.tdsPercent}%)`}
                value={`− ${formatRupees(quote.tdsPaise)}`}
              />
              <View style={styles.divider} />
              <Row
                label="You receive"
                value={formatRupees(quote.netPaise)}
                strong
              />
            </View>
          ) : null}
          <Button
            title="Request withdrawal"
            icon={Send}
            loading={submitting}
            disabled={!quote || tooLow || tooHigh}
            onPress={() =>
              Alert.alert(
                'Confirm withdrawal',
                `Withdraw ${amount} coins for ${
                  quote ? formatRupees(quote.netPaise) : ''
                }?`,
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Withdraw', onPress: submit },
                ],
              )
            }
          />
        </Card>
      )}

      <SectionTitle title="Withdrawal history" />
      {history.length === 0 ? <Muted>No withdrawals yet.</Muted> : null}
      {history.map(w => {
        const s = STATUS[w.status];
        return (
          <View key={w.id} style={styles.item}>
            <IconBadge
              icon={w.status === 'PAID' ? Banknote : s.icon}
              color={s.color}
              size={38}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>
                {formatRupees(w.netPaise)} · {w.coins} coins
              </Text>
              <Muted>
                {s.label} ·{' '}
                {new Date(w.createdAt).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                })}
                {w.rejectionReason ? ` · ${w.rejectionReason}` : ''}
              </Muted>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, strong && styles.strong]}>{label}</Text>
      <Text style={[styles.rowValue, strong && styles.strongValue]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  balance: { color: colors.gold, fontSize: 32, fontWeight: '800' },
  center: { alignItems: 'center', paddingVertical: spacing.xl },
  centerText: { textAlign: 'center' },
  stretch: { alignSelf: 'stretch', marginTop: spacing.sm },
  form: { gap: spacing.md },
  quote: {
    backgroundColor: colors.bg,
    borderRadius: 12,
    padding: spacing.md,
    gap: 8,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  rowLabel: { color: colors.textSecondary },
  rowValue: { color: colors.text, fontWeight: '600' },
  strong: { color: colors.text, fontWeight: '800' },
  strongValue: { color: colors.primary, fontWeight: '800', fontSize: 18 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  itemTitle: { color: colors.text, fontWeight: '700' },
});
