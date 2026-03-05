import createContextHook from '@nkzw/create-context-hook';
import { useState, useCallback, useMemo, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Order, CartItem, ShopSettings } from '@/types';
import { useAuth } from '@/context/AuthContext';
import CloudSyncService from '@/services/CloudSyncService';
import { showOrderNotification, showDailySummaryNotification } from '@/services/NotificationService';
import ApiService from '@/services/ApiService';
import PushNotificationService from '@/services/PushNotificationService';

const ORDERS_KEY = 'hanifa_orders';
const SETTINGS_KEY = 'hanifa_settings';

const defaultSettings: ShopSettings = {
  name: 'Madurai Vilakkuthoon Hanifa Jigarthanda',
  nameLocal: 'மதுரை விளக்குத்தூண் ஹனிஃபா ஜிகர்தண்டா',
  address: 'Chennai, Tamil Nadu - 600001',
  phone: '+91 98765 43210',
  gstNumber: '33AABCU9603R1ZM',
};

export const [OrdersProvider, useOrders] = createContextHook(() => {
  const { user } = useAuth();
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [settings, setSettings] = useState<ShopSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  // Live orders polling - refresh every 5 seconds ONLY for Nazir
  useEffect(() => {
    if (user?.id !== 'usr_nazir_001') return; // Only Nazir needs live updates
    
    console.log('🔄 Starting live orders polling for Nazir...');
    
    const pollInterval = setInterval(async () => {
      try {
        console.log('🔄 Polling for new orders...');
        const apiOrders = await ApiService.getOrders();
        
        if (apiOrders.length > allOrders.length) {
          console.log(`🆕 ${apiOrders.length - allOrders.length} new orders found!`);
          
          // Play sound alert for Nazir
          if (user?.id === 'usr_nazir_001') {
            try {
              // Use Expo Audio for sound alert
              const { Sound } = await require('expo-av');
              const { sound } = await Sound.createAsync(
                require('@/assets/sounds/order-alert.mp3')
              );
              await sound.playAsync();
              console.log('🔔 Order alert sound played');
            } catch (error) {
              console.log('🔔 Could not play sound (file may not exist):', error);
              // Fallback: Use system sound
              console.log('🔔 New order received!');
            }
          }
          
          setAllOrders(apiOrders.map(order => ({
            ...order,
            createdAt: new Date(order.createdAt)
          })));
        }
      } catch (error) {
        console.error('❌ Polling error:', error);
      }
    }, 5000); // Every 5 seconds

    return () => {
      console.log('🛑 Stopping live orders polling');
      clearInterval(pollInterval);
    };
  }, [user?.id]);

  // Daily summary notification for Nazir
  useEffect(() => {
    if (user?.role !== 'admin') return; // Only show for Nazir (admin)

    const checkDailySummary = () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const todayOrders = allOrders.filter(order => 
        new Date(order.createdAt) >= today
      );

      if (todayOrders.length > 0) {
        const totalRevenue = todayOrders.reduce((sum, order) => sum + order.grandTotal, 0);
        showDailySummaryNotification(todayOrders.length, totalRevenue);
      }
    };

    // Check at 12 AM every day (midnight)
    const now = new Date();
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    
    if (now > midnight) {
      midnight.setDate(midnight.getDate() + 1); // Schedule for tomorrow
    }
    
    const timeUntilMidnight = midnight.getTime() - now.getTime();
    const dailyTimeout = setTimeout(checkDailySummary, timeUntilMidnight);
    const dailyInterval = setInterval(checkDailySummary, 24 * 60 * 60 * 1000); // Every 24 hours

    return () => {
      clearTimeout(dailyTimeout);
      clearInterval(dailyInterval);
    };
  }, [allOrders, user]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      
      // Try to load from API first (multi-device support)
      const [apiOrders, apiSettings] = await Promise.all([
        ApiService.getOrders(),
        ApiService.getSettings(),
      ]);

      if (apiOrders.length > 0) {
        // Use API orders if available
        console.log('=== LOADING ORDERS FROM API ===');
        console.log('API Orders count:', apiOrders.length);
        console.log('API Orders:', apiOrders);
        
        setAllOrders(apiOrders.map(order => ({
          ...order,
          createdAt: new Date(order.createdAt)
        })));
        console.log('Loaded orders from API:', apiOrders.length);
        
        // Also save to local storage as backup
        await AsyncStorage.setItem(ORDERS_KEY, JSON.stringify(apiOrders));
      } else {
        // Fallback to local storage
        const storedOrders = await AsyncStorage.getItem(ORDERS_KEY);
        if (storedOrders) {
          const parsed = JSON.parse(storedOrders);
          setAllOrders(parsed.map((o: Order) => ({ ...o, createdAt: new Date(o.createdAt) })));
          console.log('Loaded orders from local storage:', parsed.length);
        }
      }

      // Load settings with API support
      if (apiSettings) {
        setSettings(apiSettings);
        console.log('Loaded settings from API:', apiSettings.name);
        await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(apiSettings));
      } else {
        // Fallback to local storage
        const storedSettings = await AsyncStorage.getItem(SETTINGS_KEY);
        if (!storedSettings) {
          setSettings(defaultSettings);
          await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(defaultSettings));
          await ApiService.updateSettings(defaultSettings);
          console.log('Set default shop settings:', defaultSettings.name);
        } else {
          const parsedSettings = JSON.parse(storedSettings);
          setSettings(parsedSettings);
          console.log('Loaded shop settings from local storage:', parsedSettings.name);
        }
      }
    } catch (error) {
      console.log('Error loading data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveOrders = async (newOrders: Order[]) => {
    try {
      // Save to API first (multi-device sync)
      for (const order of newOrders) {
        await ApiService.createOrder(order);
      }
      
      // Also save to local storage as backup
      await AsyncStorage.setItem(ORDERS_KEY, JSON.stringify(newOrders));
      console.log('Orders saved to API and local storage:', newOrders.length);
    } catch (error) {
      console.log('Error saving orders:', error);
      // Fallback to local storage only
      await AsyncStorage.setItem(ORDERS_KEY, JSON.stringify(newOrders));
    }
  };

  const orders = useMemo(() => {
    console.log('=== ORDERS CONTEXT DEBUG ===');
    console.log('User object:', user);
    console.log('User ID:', user?.id);
    console.log('User role:', user?.role);
    console.log('User username:', user?.username);
    
    if (!user) {
      console.log('No user logged in - returning empty orders');
      return [];
    }
    
    // Nazir sees all orders, others see only their own
    if (user?.role === 'admin' || user?.id === 'usr_nazir_001') {
      console.log('=== NAZIR (ADMIN) DETECTED ===');
      console.log('All orders count:', allOrders.length);
      console.log('Nazir (admin) sees ALL orders');
      console.log('Orders by user:', allOrders.reduce((acc: Record<string, number>, order) => {
        acc[order.userId] = (acc[order.userId] || 0) + 1;
        return acc;
      }, {}));
      console.log('===========================');
      return allOrders;
    }
    
    console.log('=== NON-ADMIN USER DETECTED ===');
    console.log('User role:', user?.role, '- filtering by user ID');
    const filtered = allOrders.filter(order => order.userId === user.id);
    console.log('All orders count:', allOrders.length);
    console.log('Filtered orders count:', filtered.length);
    console.log('User sees only their own orders');
    console.log('===============================');
    return filtered;
  }, [allOrders, user]);

  const createOrder = useCallback(async (items: CartItem[], paymentMethod: 'cash' | 'upi') => {
    if (!user) {
      console.log('Cannot create order: No user logged in');
      return null;
    }

    try {
      console.log('=== ORDERS CONTEXT - CREATE ORDER START ===');
      console.log('User:', user?.id, user?.name, user?.role);
      console.log('Items:', items);
      console.log('Payment method:', paymentMethod);
      console.log('Total:', items.reduce((sum, item) => sum + item.item.price * item.quantity, 0));
      
      // Create order via API (with push notification)
      const order = await ApiService.createOrder({
        userId: user.id,
        items,
        total: items.reduce((sum, item) => sum + item.item.price * item.quantity, 0),
        tax: 0,
        grandTotal: items.reduce((sum, item) => sum + item.item.price * item.quantity, 0),
        paymentMethod,
        createdAt: new Date(),
        status: 'pending',
      });

      console.log('=== ORDERS CONTEXT - API RESPONSE ===');
      console.log('Order created:', order);

      if (order) {
        // Update local state
        const updatedOrders = [...allOrders, order];
        setAllOrders(updatedOrders);
        
        // Save to local storage as backup
        await AsyncStorage.setItem(ORDERS_KEY, JSON.stringify(updatedOrders));
        
        // Show local notification for admin user
        if (user.role === 'staff') {
          await showOrderNotification(order);
        }

        console.log('Order created for user:', user.username, 'Order ID:', order.id);
        return order;
      }

      return null;
    } catch (error) {
      console.error('=== ORDERS CONTEXT - CREATE ORDER ERROR ===');
      console.error('Error details:', error);
      console.error('Error message:', (error as Error).message);
      return null;
    }
  }, [user, allOrders]);

  // Sync all orders to cloud - Temporarily disabled
  const syncAllOrders = useCallback(async () => {
    if (!user) return;
    
    // try {
    //   const response = await CloudSyncService.syncOrdersToCloud(allOrders);
    //   if (response.success) {
    //     console.log('All orders synced to cloud');
    //   }
    // } catch (error) {
    //   console.error('Failed to sync all orders:', error);
    // }
    console.log('Cloud sync temporarily disabled');
  }, [allOrders, user]);

  // Fetch orders from cloud - Temporarily disabled
  const fetchCloudOrders = useCallback(async () => {
    if (!user) return;
    
    // try {
    //   const cloudOrders = await CloudSyncService.fetchOrdersFromCloud();
    //   console.log('Fetched orders from cloud:', cloudOrders.length);
    //   return cloudOrders;
    // } catch (error) {
    //   console.error('Failed to fetch orders from cloud:', error);
    //   return [];
    // }
    console.log('Cloud sync temporarily disabled');
    return [];
  }, [user]);

  const updateSettings = useCallback(async (newSettings: Partial<ShopSettings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    try {
      // Save to API first (multi-device sync)
      await ApiService.updateSettings(updated);
      
      // Also save to local storage as backup
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
      console.log('Settings saved to API and local storage:', updated.name);
    } catch (error) {
      console.log('Error saving settings:', error);
      // Fallback to local storage only
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
    }
  }, [settings]);

  const todayOrders = useMemo(() => {
    const todayString = new Date().toDateString();
    
    // Calculate today's orders from the already role-filtered orders list
    const filtered = orders.filter(order => {
      const orderDateString = new Date(order.createdAt).toDateString();
      return orderDateString === todayString;
    });
    
    console.log('=== TODAY ORDERS DEBUG ===');
    console.log('Today string:', todayString);
    console.log('Orders list length:', orders.length);
    console.log('Filtered orders:', filtered.length);
    console.log('Order dates:', orders.map(o => ({
      id: o.id,
      date: new Date(o.createdAt).toISOString(),
      dateOnly: new Date(o.createdAt).toDateString(),
      isToday: new Date(o.createdAt).toDateString() === todayString
    })));
    console.log('========================');
    
    return filtered;
  }, [orders]);

  const todayTotal = useMemo(() => {
    return todayOrders.reduce((sum, o) => sum + Number(o.grandTotal || 0), 0);
  }, [todayOrders]);


  const clearUserOrders = useCallback(async () => {
    if (!user) return;
    
    const filteredOrders = allOrders.filter(o => o.userId !== user.id);
    setAllOrders(filteredOrders);
    await AsyncStorage.setItem(ORDERS_KEY, JSON.stringify(filteredOrders));
    console.log('Cleared orders for user:', user.username);
  }, [allOrders, user]);

  const updateOrderStatus = useCallback(async (id: string, status: 'pending' | 'preparing' | 'ready' | 'completed') => {
    try {
      const updatedOrder = await ApiService.updateOrderStatus(id, status);
      if (updatedOrder) {
        setAllOrders(prevOrders => 
          prevOrders.map(order => 
            order.id === id ? { ...order, status } : order
          )
        );
        console.log(`✅ Order ${id} status updated to: ${status}`);
      }
    } catch (error) {
      console.error('❌ Failed to update order status:', error);
    }
  }, []);

  const deleteAllOrders = useCallback(async () => {
    try {
      const result = await ApiService.deleteAllOrders();
      if (result.success) {
        setAllOrders([]);
        await AsyncStorage.removeItem(ORDERS_KEY);
        console.log(`🗑️ Deleted all orders: ${result.deletedCount} records removed`);
      }
    } catch (error) {
      console.error('❌ Failed to delete all orders:', error);
    }
  }, []);

  return {
    orders,
    allOrders,
    settings,
    isLoading,
    createOrder,
    updateSettings,
    todayOrders,
    todayTotal,
    clearAllOrders: clearUserOrders,
    updateOrderStatus,
    deleteAllOrders,
  };
});
