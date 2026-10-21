import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import RazorpayCheckout from 'react-native-razorpay';
import { api, errorMessage, formatRupees } from '../api/client';
import { Checkout, CoinPackage, Order, Page, WalletTransaction } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Card, Muted, styles as ui, Title } from '../components/ui';
import { APP_NAME } from '../config';
import { colors, spacing } from '../theme';

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
      const next = await api<Page<WalletTransaction>>(`/player/transactions?page=${page + 1}&limit=20`);
      setTxs((t) => [...t, ...next.items]);
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
      const { order, checkout } = await api<{ order: Order; checkout: Checkout }>('/player/coin-orders', {
        method: 'POST',
        body: { packageId: pkg.id },
      });

      let result: { order: Order };
      if (checkout.provider === 'mock') {
        const confirmed = await new Promise<boolean>((resolve) =>
          Alert.alert('Test payment', `Development mode: simulate paying ${formatRupees(order.amountPaise)}?`, [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Pay', onPress: () => resolve(true) },
          ]),
        );
        if (!confirmed) return;
        result = await api('/payments/mock/complete', { method: 'POST', body: { providerOrderId: checkout.providerOrderId } });
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

      if (result.order.status === 'PAID') Alert.alert('Coins added', `${pkg.coins} coins were added to your wallet.`);
      else Alert.alert('Payment processing', 'Your coins will appear as soon as the payment is confirmed.');
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
    <View style={{ gap: spacing.md, marginBottom: spacing.md }}>
      <Card style={{ alignItems: 'center' }}>
        <Muted>Balance</Muted>
        <Text style={styles.balance}>● {balance ?? '—'}</Text>
        <Muted>coins</Muted>
      </Card>
      <Title>Buy coins</Title>
      <View style={styles.grid}>
        {packages.map((pkg) => (
          <Pressable
            key={pkg.id}
            onPress={() => buy(pkg)}
            disabled={buying !== null}
            style={({ pressed }) => [styles.pkg, pkg.tag ? styles.pkgTagged : null, { opacity: pressed ? 0.85 : 1 }]}
          >
            {pkg.tag ? <Text style={styles.tag}>{pkg.tag}</Text> : null}
            <Text style={styles.pkgName}>{pkg.name}</Text>
            <Text style={styles.pkgCoins}>● {pkg.coins.toLocaleString('en-IN')}</Text>
            {buying === pkg.id ? <ActivityIndicator color={colors.text} /> : <Text style={styles.price}>{formatRupees(pkg.pricePaise)}</Text>}
          </Pressable>
        ))}
        {packages.length === 0 ? <Muted>No packages available right now.</Muted> : null}
      </View>
      <Title>History</Title>
    </View>
  );

  return (
    <FlatList
      style={ui.screen}
      contentContainerStyle={{ padding: spacing.lg }}
      data={txs}
      keyExtractor={(t) => t.id}
      ListHeaderComponent={header}
      ListEmptyComponent={<Muted>No transactions yet.</Muted>}
      ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} /> : undefined}
      onEndReached={loadMore}
      onEndReachedThreshold={0.4}
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.primary} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      renderItem={({ item }) => (
        <View style={styles.tx}>
          <View style={{ flex: 1 }}>
            <Text style={styles.txTitle}>{item.description ?? TX_LABELS[item.type]}</Text>
            <Muted>{new Date(item.createdAt).toLocaleString('en-IN')}</Muted>
          </View>
          <Text style={[styles.txAmount, { color: item.amount > 0 ? colors.win : colors.loss }]}>
            {item.amount > 0 ? '+' : ''}
            {item.amount}
          </Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  balance: { color: colors.coin, fontSize: 40, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pkg: { width: '48.5%', backgroundColor: colors.card, borderRadius: 12, padding: spacing.lg, gap: 4, alignItems: 'center' },
  pkgTagged: { borderWidth: 1, borderColor: colors.primary },
  tag: { color: '#111', backgroundColor: colors.primary, fontSize: 10, fontWeight: '800', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' },
  pkgName: { color: colors.text, fontSize: 16, fontWeight: '700' },
  pkgCoins: { color: colors.coin, fontSize: 22, fontWeight: '800' },
  price: { color: colors.text, fontSize: 16, fontWeight: '700', backgroundColor: colors.primaryDark, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, overflow: 'hidden', marginTop: 4 },
  tx: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  txTitle: { color: colors.text, fontWeight: '600' },
  txAmount: { fontSize: 18, fontWeight: '800' },
});
