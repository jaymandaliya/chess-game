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
import { useFocusEffect } from '@react-navigation/native';
import RazorpayCheckout from 'react-native-razorpay';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Coins,
  ShieldCheck,
} from 'lucide-react-native';
import { api, errorMessage, formatRupees } from '../api/client';
import {
  Checkout,
  CoinPackage,
  Order,
  Page,
  WalletTransaction,
} from '../api/types';
import { useAuth } from '../auth/AuthContext';
import {
  GradientCard,
  IconBadge,
  Muted,
  SectionTitle,
  styles as ui,
} from '../components/ui';
import { APP_NAME } from '../config';
import { colors, radius, spacing, type } from '../theme';

const TX_LABELS: Record<WalletTransaction['type'], string> = {
  PURCHASE: 'Coins purchased',
  ENTRY_FEE: 'Match entry',
  WINNINGS: 'Match winnings',
  REFUND: 'Refund',
  REVERSAL: 'Purchase refunded',
  ADJUSTMENT: 'Adjustment',
};

export default function WalletScreen() {
  const { user } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [packages, setPackages] = useState<CoinPackage[]>([]);
  const [txs, setTxs] = useState<WalletTransaction[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [buying, setBuying] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [wallet, pkgs, first] = await Promise.all([
        api<{ balance: number }>('/player/wallet'),
        api<{ items: CoinPackage[] }>('/player/coin-packages'),
        api<Page<WalletTransaction>>('/player/transactions?page=1&limit=20'),
      ]);
      setBalance(wallet.balance);
      setPackages(pkgs.items);
      setTxs(first.items);
      setPage(1);
      setTotalPages(first.pagination.totalPages);
    } catch (err) {
      Alert.alert('Could not load wallet', errorMessage(err));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function loadMore() {
    if (loadingMore || page >= totalPages) return;
    setLoadingMore(true);
    try {
      const next = await api<Page<WalletTransaction>>(
        `/player/transactions?page=${page + 1}&limit=20`,
      );
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

      if (result.order.status === 'PAID')
        Alert.alert(
          'Coins added',
          `${pkg.coins.toLocaleString(
            'en-IN',
          )} coins were added to your wallet.`,
        );
      else
        Alert.alert(
          'Payment processing',
          'Your coins will appear as soon as the payment is confirmed.',
        );
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
      <GradientCard from="#78350F" to="#1C1917" style={styles.balanceCard}>
        <View style={ui.row}>
          <IconBadge icon={Coins} color={colors.gold} size={44} />
          <Text style={type.overline}>Coin balance</Text>
        </View>
        <Text style={styles.balance}>
          {balance === null ? '—' : balance.toLocaleString('en-IN')}
        </Text>
        <Muted>Use coins across Chess Platform</Muted>
      </GradientCard>

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
            accessibilityLabel={`${pkg.name}, ${
              pkg.coins
            } coins for ${formatRupees(pkg.pricePaise)}`}
          >
            {pkg.tag ? (
              <View style={styles.tag}>
                <Text style={styles.tagText}>{pkg.tag}</Text>
              </View>
            ) : (
              <View style={styles.tagSpacer} />
            )}
            <Coins size={26} color={colors.gold} />
            <Text style={styles.pkgCoins}>
              {pkg.coins.toLocaleString('en-IN')}
            </Text>
            <Text style={type.caption}>{pkg.name}</Text>
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

      <SectionTitle title="Activity" />
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
      ListEmptyComponent={<Muted>No transactions yet.</Muted>}
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
  list: { padding: spacing.lg, paddingBottom: spacing.xxl },
  headerBlock: { gap: spacing.md, marginBottom: spacing.sm },
  balanceCard: { paddingVertical: spacing.xl },
  balance: {
    color: colors.gold,
    fontSize: 44,
    fontWeight: '800',
    letterSpacing: -1,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pkg: {
    width: '48.6%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    paddingBottom: spacing.lg,
    gap: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  pkgTagged: { borderColor: colors.primary },
  pressed: { transform: [{ scale: 0.97 }], backgroundColor: colors.surfaceAlt },
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
  pkgCoins: { color: colors.text, fontSize: 24, fontWeight: '800' },
  price: {
    alignSelf: 'stretch',
    marginTop: 6,
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
