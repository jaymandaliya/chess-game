import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import RazorpayCheckout from 'react-native-razorpay';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  Coins,
  ShieldCheck,
  Trophy,
} from 'lucide-react-native';
import { api, errorMessage, formatRupees } from '../api/client';
import {
  Checkout,
  CoinPackage,
  CoinType,
  Economy,
  Order,
  Page,
  WalletTransaction,
} from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { AppStackParams } from '../navigation/navigationRef';
import {
  GradientCard,
  IconBadge,
  Muted,
  SectionTitle,
  Segmented,
  styles as ui,
} from '../components/ui';
import { APP_NAME } from '../config';
import { colors, radius, spacing, type } from '../theme';

const TX_LABELS: Record<WalletTransaction['type'], string> = {
  PURCHASE: 'Coins purchased',
  BONUS: 'Tournament bonus',
  STAKE: 'Game entry',
  STAKE_REFUND: 'Game entry returned',
  WINNINGS: 'Game winnings',
  TOURNAMENT_ENTRY: 'Tournament entry',
  TOURNAMENT_REFUND: 'Tournament refund',
  TOURNAMENT_PRIZE: 'Tournament prize',
  WITHDRAWAL: 'Withdrawal',
  WITHDRAWAL_REVERSAL: 'Withdrawal returned',
  ENTRY_FEE: 'Match entry',
  REFUND: 'Refund',
  REVERSAL: 'Purchase refunded',
  ADJUSTMENT: 'Adjustment',
};

type Filter = 'ALL' | CoinType;

export default function WalletScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParams>>();
  const { user } = useAuth();
  const [economy, setEconomy] = useState<Economy | null>(null);
  const [packages, setPackages] = useState<CoinPackage[]>([]);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [txs, setTxs] = useState<WalletTransaction[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [buying, setBuying] = useState<string | null>(null);

  const txPath = useCallback(
    (p: number, f: Filter) =>
      `/player/transactions?page=${p}&limit=20${
        f === 'ALL' ? '' : `&coinType=${f}`
      }`,
    [],
  );

  const load = useCallback(
    async (f: Filter = filter) => {
      try {
        const [eco, pkgs, first] = await Promise.all([
          api<Economy>('/player/economy'),
          api<{ items: CoinPackage[] }>('/player/coin-packages'),
          api<Page<WalletTransaction>>(txPath(1, f)),
        ]);
        setEconomy(eco);
        setPackages(pkgs.items);
        setTxs(first.items);
        setPage(1);
        setTotalPages(first.pagination.totalPages);
      } catch (err) {
        Alert.alert('Could not load wallet', errorMessage(err));
      }
    },
    [filter, txPath],
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function loadMore() {
    if (loadingMore || page >= totalPages) return;
    setLoadingMore(true);
    try {
      const next = await api<Page<WalletTransaction>>(txPath(page + 1, filter));
      setTxs(t => [...t, ...next.items]);
      setPage(next.pagination.page);
      setTotalPages(next.pagination.totalPages);
    } finally {
      setLoadingMore(false);
    }
  }

  // Server decides price/coins; the app only sends the package id and passes the provider's proof back
  async function buy(pkg: CoinPackage) {
    setBuying(pkg.id);
    try {
      const { order, checkout } = await api<{
        order: Order;
        checkout: Checkout;
      }>('/player/coin-orders', {
        method: 'POST',
        body: { packageId: pkg.id },
      });

      let result: { order: Order };
      if (checkout.provider === 'mock') {
        const confirmed = await new Promise<boolean>(resolve =>
          Alert.alert(
            'Test payment',
            `Development mode: simulate paying ${formatRupees(
              order.amountPaise,
            )}?`,
            [
              {
                text: 'Cancel',
                style: 'cancel',
                onPress: () => resolve(false),
              },
              { text: 'Pay', onPress: () => resolve(true) },
            ],
          ),
        );
        if (!confirmed) return;
        result = await api('/payments/mock/complete', {
          method: 'POST',
          body: { providerOrderId: checkout.providerOrderId },
        });
      } else {
        const paid = await RazorpayCheckout.open({
          key: checkout.keyId,
          order_id: checkout.providerOrderId,
          amount: checkout.amountPaise,
          currency: checkout.currency,
          name: APP_NAME,
          description: `${pkg.name} – ${pkg.coins} coins`,
          prefill: { email: user?.email, name: user?.displayName },
          theme: { color: colors.primary },
        });
        result = await api('/payments/verify', {
          method: 'POST',
          body: {
            providerOrderId: paid.razorpay_order_id,
            providerPaymentId: paid.razorpay_payment_id,
            signature: paid.razorpay_signature,
          },
        });
      }

      if (result.order.status === 'PAID') {
        Alert.alert(
          'Coins added',
          `${pkg.coins.toLocaleString('en-IN')} coins${
            pkg.bonusTournamentCoins
              ? ` + ${pkg.bonusTournamentCoins} tournament coins`
              : ''
          } were added to your wallet.`,
        );
      } else {
        Alert.alert(
          'Payment processing',
          'Your coins will appear as soon as the payment is confirmed.',
        );
      }
      await load();
    } catch (err) {
      const description = (err as { description?: string })?.description;
      if (description) Alert.alert('Payment not completed', description);
      else Alert.alert('Payment failed', errorMessage(err));
    } finally {
      setBuying(null);
    }
  }

  const header = (
    <View style={styles.headerBlock}>
      <View style={styles.balances}>
        <GradientCard from="#14532D" to="#0F172A" style={styles.balanceCard}>
          <IconBadge icon={Coins} color={colors.gold} size={38} />
          <Text style={type.overline}>Play coins</Text>
          <Text style={styles.balance}>
            {economy ? economy.balances.play.toLocaleString('en-IN') : '—'}
          </Text>
          <Muted>Daily games</Muted>
        </GradientCard>
        <GradientCard from="#78350F" to="#1C1917" style={styles.balanceCard}>
          <IconBadge icon={Trophy} color={colors.gold} size={38} />
          <Text style={type.overline}>Tournament</Text>
          <Text style={styles.balance}>
            {economy
              ? economy.balances.tournament.toLocaleString('en-IN')
              : '—'}
          </Text>
          <Muted>Tournament entry only</Muted>
        </GradientCard>
      </View>

      {economy?.withdrawalsEnabled ? (
        <Pressable
          style={({ pressed }) => [styles.withdraw, pressed && styles.pressed]}
          onPress={() => navigation.navigate('Withdraw')}
        >
          <IconBadge icon={Banknote} color={colors.primary} size={36} />
          <View style={{ flex: 1 }}>
            <Text style={styles.withdrawTitle}>Withdraw to bank / UPI</Text>
            <Muted>Convert play coins to money</Muted>
          </View>
          <ArrowUpRight size={18} color={colors.muted} />
        </Pressable>
      ) : null}

      <SectionTitle title="Buy coins" />
      <View style={styles.grid}>
        {packages.map(pkg => (
          <Pressable
            key={pkg.id}
            onPress={() => buy(pkg)}
            disabled={buying !== null}
            style={({ pressed }) => [
              styles.pkg,
              pkg.tag ? styles.pkgTagged : null,
              pressed && styles.pressed,
            ]}
            accessibilityLabel={`${pkg.name}, ${pkg.coins} coins${
              pkg.bonusTournamentCoins
                ? ` plus ${pkg.bonusTournamentCoins} tournament coins`
                : ''
            } for ${formatRupees(pkg.pricePaise)}`}
          >
            {pkg.tag ? (
              <View style={styles.tag}>
                <Text style={styles.tagText}>{pkg.tag}</Text>
              </View>
            ) : (
              <View style={styles.tagSpacer} />
            )}
            <Text style={styles.pkgName}>{pkg.name}</Text>
            <Text style={styles.pkgCoins}>
              {pkg.coins.toLocaleString('en-IN')}
            </Text>
            <Text style={type.caption}>play coins</Text>
            {pkg.bonusTournamentCoins ? (
              <View style={styles.bonus}>
                <Trophy size={12} color={colors.gold} />
                <Text style={styles.bonusText}>
                  +{pkg.bonusTournamentCoins} tournament
                </Text>
              </View>
            ) : (
              <View style={styles.bonusSpacer} />
            )}
            <View style={styles.price}>
              {buying === pkg.id ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <Text style={styles.priceText}>
                  {formatRupees(pkg.pricePaise)}
                </Text>
              )}
            </View>
          </Pressable>
        ))}
        {packages.length === 0 ? (
          <Muted>No packages available right now.</Muted>
        ) : null}
      </View>
      <View style={styles.secure}>
        <ShieldCheck size={14} color={colors.muted} />
        <Muted>Payments are processed securely by Razorpay</Muted>
      </View>

      <SectionTitle title="Coin history" />
      <Segmented<Filter>
        options={[
          { key: 'ALL', label: 'All' },
          { key: 'PLAY', label: 'Play' },
          { key: 'TOURNAMENT', label: 'Tournament' },
        ]}
        value={filter}
        onChange={setFilter}
      />
    </View>
  );

  return (
    <FlatList
      showsVerticalScrollIndicator={false}
      style={ui.screen}
      contentContainerStyle={styles.list}
      data={txs}
      keyExtractor={t => t.id}
      ListHeaderComponent={header}
      ListEmptyComponent={<Muted>No coin movements yet.</Muted>}
      ListFooterComponent={
        loadingMore ? <ActivityIndicator color={colors.primary} /> : undefined
      }
      onEndReached={loadMore}
      onEndReachedThreshold={0.4}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={colors.primary}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }
      renderItem={({ item }) => {
        const credit = item.amount > 0;
        return (
          <View style={styles.tx}>
            <IconBadge
              icon={credit ? ArrowDownLeft : ArrowUpRight}
              color={credit ? colors.win : colors.loss}
              size={38}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.txTitle} numberOfLines={1}>
                {item.description ?? TX_LABELS[item.type]}
              </Text>
              <Muted>
                {item.coinType === 'TOURNAMENT' ? 'Tournament · ' : ''}
                {new Date(item.createdAt).toLocaleString('en-IN', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </Muted>
            </View>
            <Text
              style={[
                styles.txAmount,
                { color: credit ? colors.win : colors.loss },
              ]}
            >
              {credit ? '+' : ''}
              {item.amount.toLocaleString('en-IN')}
            </Text>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, paddingBottom: 56 },
  headerBlock: { gap: spacing.md, marginBottom: spacing.sm },
  balances: { flexDirection: 'row', gap: spacing.sm },
  balanceCard: { flex: 1, gap: 4 },
  balance: {
    color: colors.gold,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  withdraw: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  withdrawTitle: { color: colors.text, fontWeight: '700', fontSize: 15 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pkg: {
    width: '48.6%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    paddingBottom: spacing.lg,
    gap: 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  pkgTagged: { borderColor: colors.primary },
  pressed: {
    transform: [{ scale: 0.97 }],
    backgroundColor: colors.surfaceAlt,
  },
  tag: {
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  tagText: {
    color: colors.onPrimary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  tagSpacer: { height: 19 },
  pkgName: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
  pkgCoins: { color: colors.text, fontSize: 26, fontWeight: '800' },
  bonus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.goldSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    marginTop: 4,
  },
  bonusText: { color: colors.gold, fontSize: 12, fontWeight: '700' },
  bonusSpacer: { height: 23 },
  price: {
    alignSelf: 'stretch',
    marginTop: 8,
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: 9,
    alignItems: 'center',
  },
  priceText: { color: colors.onPrimary, fontSize: 15, fontWeight: '800' },
  secure: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'center',
  },
  tx: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  txTitle: { color: colors.text, fontWeight: '600', fontSize: 15 },
  txAmount: { fontSize: 17, fontWeight: '800' },
});
