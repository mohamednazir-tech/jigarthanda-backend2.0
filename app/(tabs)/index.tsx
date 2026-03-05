import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';
import { menuItems, categories } from '@/mocks/menu';
import { useCart } from '@/context/CartContext';
import { useOrders } from '@/context/OrdersContext';
import { useAuth } from '@/context/AuthContext';
import { MenuItem } from '@/types';

function MenuItemCard({ item }: { item: MenuItem }) {
  const { addItem, removeItem, getItemQuantity } = useCart();
  const quantity = getItemQuantity(item.id);
  const scaleAnim = React.useRef(new Animated.Value(1)).current;

  const handlePress = useCallback(() => {
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.95,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
    addItem(item);
  }, [addItem, item, scaleAnim]);

  return (
    <Animated.View style={[styles.itemCard, { transform: [{ scale: scaleAnim }] }]}>
      <Pressable onPress={handlePress} style={styles.itemContent}>
        <View style={styles.itemInfo}>
          <Text style={styles.itemName}>{item.name}</Text>
          <Text style={styles.itemNameLocal}>{item.nameLocal}</Text>
          {item.description && (
            <Text style={styles.itemDescription} numberOfLines={2}>
              {item.description}
            </Text>
          )}
          <Text style={styles.itemPrice}>₹{item.price}</Text>
        </View>
        
        {quantity > 0 ? (
          <View style={styles.quantityControl}>
            <TouchableOpacity
              onPress={() => removeItem(item.id)}
              style={styles.quantityBtn}
            >
              <Ionicons name="remove-circle" size={16} color={Colors.primary} />
            </TouchableOpacity>
            <Text style={styles.quantityText}>{quantity}</Text>
            <TouchableOpacity
              onPress={() => addItem(item)}
              style={styles.quantityBtn}
            >
              <Ionicons name="add-circle" size={16} color={Colors.primary} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.addBtn} onPress={handlePress}>
              <Ionicons name="add-circle" size={20} color={Colors.white} />
            </TouchableOpacity>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

export default function MenuScreen() {
  const router = useRouter();
  const { totalItems, subtotal } = useCart();
  const { todayTotal, todayOrders } = useOrders();
  const { user } = useAuth();
  const [selectedCategory, setSelectedCategory] = useState<string>('jigarthanda');

  const filteredItems = menuItems.filter(item => item.category === selectedCategory);

  // Show stats bar only for nazir user (admin role) - hide from admin user (staff role)
  const showStatsBar = user?.role === 'admin';
  
  // Debug: Log user info and stats bar visibility
  console.log('Menu Screen - User:', user?.username, 'Role:', user?.role);
  console.log('Menu Screen - Show stats bar:', showStatsBar);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Hanifa Jigarthanda</Text>
      </View>
      {showStatsBar && (
        <View style={styles.statsBar}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Today&apos;s Sales</Text>
            <Text style={styles.statValue}>₹{todayTotal.toLocaleString()}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Orders</Text>
            <Text style={styles.statValue}>{todayOrders.length}</Text>
          </View>
        </View>
      )}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoryScroll}
        contentContainerStyle={styles.categoryContainer}
      >
        {categories.map(cat => (
          <TouchableOpacity
            key={cat.id}
            style={[
              styles.categoryBtn,
              selectedCategory === cat.id && styles.categoryBtnActive,
            ]}
            onPress={() => setSelectedCategory(cat.id)}
          >
            <Text
              style={[
                styles.categoryText,
                selectedCategory === cat.id && styles.categoryTextActive,
              ]}
            >
              {cat.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        style={styles.menuList}
        contentContainerStyle={styles.menuContent}
        showsVerticalScrollIndicator={false}
      >
        {filteredItems.map(item => (
          <MenuItemCard key={item.id} item={item} />
        ))}
        <View style={{ height: 100 }} />
      </ScrollView>

      {totalItems > 0 && (
        <TouchableOpacity
          style={styles.cartBar}
          onPress={() => router.push('/checkout')}
          activeOpacity={0.9}
        >
          <View style={styles.cartInfo}>
            <View style={styles.cartBadge}>
              <Text style={styles.cartBadgeText}>{totalItems}</Text>
            </View>
            <Text style={styles.cartText}>View Cart</Text>
          </View>
          <View style={styles.cartTotal}>
            <Text style={styles.cartTotalText}>₹{subtotal}</Text>
            <Ionicons name="cart" size={20} color={Colors.white} />
          </View>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
  },
  header: {
    backgroundColor: Colors.primary,
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.white,
  },
  statsBar: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    color: Colors.textMuted,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.primary,
  },
  statDivider: {
    width: 1,
    backgroundColor: Colors.border,
    marginHorizontal: 16,
  },
  categoryScroll: {
    maxHeight: 60,
    backgroundColor: Colors.white,
  },
  categoryContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  categoryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: Colors.creamDark,
    marginRight: 8,
  },
  categoryBtnActive: {
    backgroundColor: Colors.primary,
  },
  categoryText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textLight,
  },
  categoryTextActive: {
    color: Colors.white,
  },
  menuList: {
    flex: 1,
  },
  menuContent: {
    padding: 16,
    gap: 12,
  },
  itemCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
  itemContent: {
    flexDirection: 'row',
    padding: 16,
    alignItems: 'center',
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 2,
  },
  itemNameLocal: {
    fontSize: 13,
    color: Colors.primary,
    marginBottom: 4,
  },
  itemDescription: {
    fontSize: 12,
    color: Colors.textMuted,
    marginBottom: 6,
    lineHeight: 16,
  },
  itemPrice: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.gold,
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  quantityControl: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.rose,
    borderRadius: 22,
    paddingVertical: 6,
    paddingHorizontal: 8,
    gap: 4,
  },
  quantityBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.primary,
    marginHorizontal: 12,
  },
  cartBar: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    backgroundColor: Colors.primary,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  cartInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cartBadge: {
    backgroundColor: Colors.gold,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 12,
  },
  cartBadgeText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 14,
  },
  cartText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  cartTotal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cartTotalText: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: '700',
  },
});
