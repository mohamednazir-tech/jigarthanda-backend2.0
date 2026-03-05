import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Share,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';
import { useOrders } from '@/context/OrdersContext';
import { useCart } from '@/context/CartContext';
import { useRouter } from "expo-router";



export default function BillScreen() {
  const router = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { orders, allOrders, settings } = useOrders();
  const { clearCart } = useCart();

  const order = allOrders.find(o => o.id === orderId);

  if (!order) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorState}>
          <Text style={styles.errorText}>Order not found</Text>
          <TouchableOpacity style={styles.homeBtn} onPress={() => router.replace('/')}>
            <Ionicons name="home" size={20} color={Colors.white} />
            <Text style={styles.homeBtnText}>Go Home</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const formatDate = useMemo(() => (date: Date) => {
    return new Date(date).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }, []);

  const formatTime = useMemo(() => (date: Date) => {
    return new Date(date).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }, []);

  const billText = useMemo(() => {
    // Pre-calculate all items to avoid repeated operations
    const itemLines = order.items.map(item => {
      const name = item.item.name.substring(0, 20).padEnd(20);
      const qty = `x${item.quantity}`.padStart(4);
      const price = `₹${item.item.price * item.quantity}`.padStart(8);
      return `${name}${qty}${price}`;
    }).join('\n');

    return `
================================
     மதுரை விளக்குத்தூண்
     ஹனிஃபா ஜிகர்தண்டா
     Madurai Vilakkuthoon
     Hanifa Jigarthanda
================================
${settings.address}
Phone: ${settings.phone}
${settings.gstNumber ? `GST: ${settings.gstNumber}` : ''}
--------------------------------
Bill No: ${order.id.slice(-8)}
Date: ${formatDate(order.createdAt)}
Time: ${formatTime(order.createdAt)}
--------------------------------
ITEMS
--------------------------------
${itemLines}
--------------------------------
Subtotal:              ₹${order.total}
--------------------------------
GRAND TOTAL:           ₹${order.grandTotal}
--------------------------------
Payment: ${order.paymentMethod.toUpperCase()}
================================
   Thank You! Visit Again!
      நன்றி! மீண்டும் வாருங்கள்!
================================
`;
  }, [order, settings, formatDate, formatTime]);

  const handleShare = async () => {
    try {
      await Share.share({
        message: billText,
        title: `Bill - ${order.id}`,
      });
    } catch (error) {
      console.log('Error sharing:', error);
    }
  };

  const handlePrint = () => {
    if (Platform.OS === 'web') {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(`<pre style="font-family: monospace; font-size: 14px;">${billText}</pre>`);
        printWindow.document.close();
        printWindow.print();
      }
    } else {
      handleShare();
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.successHeader}>
        <View style={styles.successIcon}>
          <Ionicons name="checkmark" size={40} color={Colors.white} />
        </View>
        <Text style={styles.successTitle}>Order Complete!</Text>
        <Text style={styles.successSubtitle}>Bill #{order.id.slice(-8)}</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.billCard}>
          <View style={styles.billHeader}>
            <Text style={styles.shopNameFirstLine}>மதுரை விளக்குத்தூண்</Text>
            <Text style={styles.shopNameSecondLine}>ஹனிஃபா ஜிகர்தண்டா</Text>
            <Text style={styles.shopNameEnglishFirstLine}>Madurai Vilakkuthoon</Text>
            <Text style={styles.shopNameEnglishSecondLine}>Hanifa Jigarthanda</Text>
            <Text style={styles.shopAddress}>{settings.address}</Text>
            <Text style={styles.shopPhone}>{settings.phone}</Text>
            {settings.gstNumber && (
              <Text style={styles.shopGst}>GST: {settings.gstNumber}</Text>
            )}
          </View>

          <View style={styles.billDividerDashed} />

          <View style={styles.billMeta}>
            <View style={styles.billMetaRow}>
              <Text style={styles.billMetaLabel}>Bill No:</Text>
              <Text style={styles.billMetaValue}>{order.id.slice(-8)}</Text>
            </View>
            <View style={styles.billMetaRow}>
              <Text style={styles.billMetaLabel}>Date:</Text>
              <Text style={styles.billMetaValue}>{formatDate(order.createdAt)}</Text>
            </View>
            <View style={styles.billMetaRow}>
              <Text style={styles.billMetaLabel}>Time:</Text>
              <Text style={styles.billMetaValue}>{formatTime(order.createdAt)}</Text>
            </View>
          </View>

          <View style={styles.billDivider} />

          <View style={styles.billItems}>
            <View style={styles.billItemHeader}>
              <Text style={[styles.billItemHeaderText, { flex: 2 }]}>Item</Text>
              <Text style={[styles.billItemHeaderText, { flex: 1, textAlign: 'center' }]}>Qty</Text>
              <Text style={[styles.billItemHeaderText, { flex: 1, textAlign: 'right' }]}>Amount</Text>
            </View>

            {order.items.map((item, idx) => (
              <View key={idx} style={styles.billItem}>
                <Text style={[styles.billItemName, { flex: 2 }]} numberOfLines={1}>
                  {item.item.name}
                </Text>
                <Text style={[styles.billItemQty, { flex: 1, textAlign: 'center' }]}>
                  x{item.quantity}
                </Text>
                <Text style={[styles.billItemPrice, { flex: 1, textAlign: 'right' }]}>
                  ₹{item.item.price * item.quantity}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.billDivider} />

          <View style={styles.billTotals}>
            <View style={styles.billTotalRow}>
              <Text style={styles.billTotalLabel}>Subtotal</Text>
              <Text style={styles.billTotalValue}>₹{order.total}</Text>
            </View>
          </View>

          <View style={styles.billGrandTotal}>
            <Text style={styles.grandTotalLabel}>Grand Total</Text>
            <Text style={styles.grandTotalValue}>₹{order.grandTotal}</Text>
          </View>

          <View style={styles.paymentInfo}>
            <Text style={styles.paymentText}>
              Paid via {order.paymentMethod.toUpperCase()}
            </Text>
          </View>

          <View style={styles.billDividerDashed} />

          <View style={styles.billFooter}>
            <Text style={styles.thankYou}>Thank You! Visit Again!</Text>
            <Text style={styles.thankYouLocal}>நன்றி! மீண்டும் வாருங்கள்!</Text>
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.actionBtn} onPress={handleShare}>
          <Ionicons name="share" size={20} color={Colors.primary} />
          <Text style={styles.actionBtnText}>Share</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn} onPress={handlePrint}>
          <Ionicons name="print" size={20} color={Colors.primary} />
          <Text style={styles.actionBtnText}>Print</Text>
        </TouchableOpacity>

        <TouchableOpacity
  style={styles.doneBtn}
  onPress={() => {
    clearCart();
    router.replace('/');
  }}
  activeOpacity={0.8}
>
  <Ionicons name="home" size={20} color={Colors.white} />
  <Text style={styles.doneBtnText}>New Order</Text>
</TouchableOpacity>


      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.primary,
  },
  errorState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 18,
    color: Colors.white,
    marginBottom: 20,
  },
  homeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.gold,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  homeBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.white,
  },
  successHeader: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  successIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.success,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.white,
    marginBottom: 4,
  },
  successSubtitle: {
    fontSize: 16,
    color: Colors.rose,
  },
  content: {
    flex: 1,
    backgroundColor: Colors.cream,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
  },
  billCard: {
    backgroundColor: Colors.white,
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 24,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 5,
    marginBottom: 100,
  },
  billHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  shopLogo: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  shopLogoText: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.gold,
  },
  shopName: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.primary,
    marginBottom: 2,
  },
  shopNameFirstLine: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.primary,
    textAlign: 'center',
    marginBottom: 1,
  },
  shopNameSecondLine: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.primary,
    textAlign: 'center',
    marginBottom: 4,
  },
  shopNameEnglishFirstLine: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 1,
  },
  shopNameEnglishSecondLine: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  shopNameLocal: {
    fontSize: 14,
    color: Colors.textLight,
    marginBottom: 8,
  },
  shopAddress: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  shopPhone: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  shopGst: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 4,
  },
  billDividerDashed: {
    height: 1,
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: Colors.border,
    marginVertical: 16,
  },
  billDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 12,
  },
  billMeta: {
    gap: 6,
  },
  billMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  billMetaLabel: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  billMetaValue: {
    fontSize: 12,
    color: Colors.text,
    fontWeight: '500',
  },
  billItems: {
    marginVertical: 8,
  },
  billItemHeader: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  billItemHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
  },
  billItem: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  billItemName: {
    fontSize: 14,
    color: Colors.text,
  },
  billItemQty: {
    fontSize: 14,
    color: Colors.textLight,
  },
  billItemPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  billTotals: {
    gap: 6,
  },
  billTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  billTotalLabel: {
    fontSize: 13,
    color: Colors.textLight,
  },
  billTotalValue: {
    fontSize: 13,
    color: Colors.text,
  },
  billGrandTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.creamDark,
    marginTop: 12,
    marginHorizontal: -24,
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  grandTotalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  grandTotalValue: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.gold,
  },
  paymentInfo: {
    alignItems: 'center',
    marginTop: 16,
  },
  paymentText: {
    fontSize: 12,
    color: Colors.success,
    fontWeight: '600',
    backgroundColor: 'rgba(46, 125, 50, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  billFooter: {
    alignItems: 'center',
  },
  thankYou: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
    marginBottom: 4,
  },
  thankYouLocal: {
    fontSize: 13,
    color: Colors.textLight,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 28,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.creamDark,
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
  },
  doneBtn: {
    flex: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.primary,
  },
  doneBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.white,
  },
});
