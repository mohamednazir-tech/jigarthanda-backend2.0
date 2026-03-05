import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import Colors from '@/constants/colors';
import { useOrders } from '@/context/OrdersContext';
import { useAuth } from '@/context/AuthContext';

export default function SettingsScreen() {
  const { settings, updateSettings } = useOrders();
  const { user, logout } = useAuth();
  const [formData, setFormData] = useState(settings);
  const [userData, setUserData] = useState({
    name: user?.name || '',
    phone: user?.phone || '',
    district: user?.district || '',
    districtTamil: user?.districtTamil || ''
  });
  const [saved, setSaved] = useState(false);

  // Check if user can edit settings (admin and staff)
  const canEditSettings = user?.role === 'admin' || user?.role === 'staff';

  const handleSave = async () => {
    if (!canEditSettings) return;
    
    try {
      // Save shop settings
      await updateSettings(formData);
      
      // Save user details (for now, just log them)
      console.log('User details updated:', userData);
      
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      Alert.alert('Saved', 'All settings have been updated');
    } catch (error) {
      console.error('Error saving settings:', error);
      Alert.alert('Error', 'Failed to save settings');
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Logout', style: 'destructive', onPress: logout },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          {user && (
            <View style={styles.userCard}>
              <View style={styles.userAvatar}>
                <Ionicons name="person" size={24} color={Colors.white} />
              </View>
              <View style={styles.userInfo}>
                <Text style={styles.userName}>{user.name}</Text>
                <View style={styles.userMeta}>
                  <Ionicons name="location" size={12} color={Colors.textMuted} />
                  <Text style={styles.userDistrict}>{user.district} • {user.districtTamil}</Text>
                </View>
                <View style={styles.roleBadge}>
                  <Ionicons name="shield" size={10} color={Colors.primary} />
                  <Text style={styles.roleText}>{user.role.toUpperCase()}</Text>
                </View>
              </View>
            </View>
          )}

          <View style={styles.shopPreview}>
            <View style={styles.shopLogo}>
              <Text style={styles.shopLogoText}>ஜி</Text>
            </View>
            <Text style={styles.shopPreviewName}>{formData.name}</Text>
            <Text style={styles.shopPreviewLocal}>{formData.nameLocal}</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Shop Details</Text>

            <View style={styles.inputGroup}>
              <View style={styles.inputIcon}>
                <Ionicons name="business" size={18} color={Colors.primary} />
              </View>
              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Shop Name (English)</Text>
                <TextInput
                  style={styles.input}
                  value={formData.name}
                  onChangeText={(text) => setFormData({ ...formData, name: text })}
                  editable={canEditSettings}
                  placeholder="Enter shop name"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <View style={styles.inputIcon}>
                <Ionicons name="business" size={18} color={Colors.primary} />
              </View>
              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Shop Name (Tamil)</Text>
                <TextInput
                  style={styles.input}
                  value={formData.nameLocal}
                  onChangeText={(text) => setFormData({ ...formData, nameLocal: text })}
                  editable={canEditSettings}
                  placeholder="கடை பெயர்"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <View style={styles.inputIcon}>
                <Ionicons name="location" size={18} color={Colors.primary} />
              </View>
              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Address</Text>
                <TextInput
                  style={[styles.input, styles.inputMultiline]}
                  value={formData.address}
                  onChangeText={(text) => setFormData({ ...formData, address: text })}
                  editable={canEditSettings}
                  placeholder="Enter shop address"
                  placeholderTextColor={Colors.textMuted}
                  multiline
                  numberOfLines={2}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <View style={styles.inputIcon}>
                <Ionicons name="call" size={18} color={Colors.primary} />
              </View>
              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Phone Number</Text>
                <TextInput
                  style={styles.input}
                  value={formData.phone}
                  onChangeText={(text) => setFormData({ ...formData, phone: text })}
                  editable={canEditSettings}
                  placeholder="Enter phone number"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="phone-pad"
                />
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>User Details</Text>

            <View style={styles.inputGroup}>
              <View style={styles.inputIcon}>
                <Ionicons name="person" size={18} color={Colors.primary} />
              </View>
              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>User Name</Text>
                <TextInput
                  style={styles.input}
                  value={userData.name}
                  onChangeText={(text) => setUserData({ ...userData, name: text })}
                  editable={canEditSettings}
                  placeholder="User name"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <View style={styles.inputIcon}>
                <Ionicons name="location" size={18} color={Colors.primary} />
              </View>
              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>User Location</Text>
                <TextInput
                  style={styles.input}
                  value={`${userData.district}, ${userData.districtTamil}`}
                  onChangeText={(text) => {
                    const parts = text.split(', ');
                    setUserData({ 
                      ...userData, 
                      district: parts[0] || 'Madurai',
                      districtTamil: parts[1] || 'மதுரை'
                    });
                  }}
                  editable={canEditSettings}
                  placeholder="User location"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <View style={styles.inputIcon}>
                <Ionicons name="call" size={18} color={Colors.primary} />
              </View>
              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>User Phone</Text>
                <TextInput
                  style={styles.input}
                  value={userData.phone}
                  onChangeText={(text) => setUserData({ ...userData, phone: text })}
                  editable={canEditSettings}
                  placeholder="Enter phone number"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="phone-pad"
                />
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Billing Details</Text>

            <View style={styles.inputGroup}>
              <View style={styles.inputIcon}>
                <Ionicons name="document-text" size={18} color={Colors.primary} />
              </View>
              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>GST Number</Text>
                <TextInput
                  style={styles.input}
                  value={formData.gstNumber}
                  onChangeText={(text) => setFormData({ ...formData, gstNumber: text })}
                  editable={canEditSettings}
                  placeholder="Enter GST number"
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="characters"
                />
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, saved && styles.saveBtnSaved, !canEditSettings && styles.saveBtnDisabled]}
            onPress={handleSave}
            activeOpacity={0.8}
            disabled={!canEditSettings}
          >
            {saved ? (
              <>
                <Ionicons name="checkmark" size={20} color={Colors.white} />
                <Text style={styles.saveBtnText}>Saved!</Text>
              </>
            ) : (
              <>
                <Ionicons name="save" size={20} color={Colors.white} />
                <Text style={styles.saveBtnText}>Save Settings</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.logoutBtn}
            onPress={handleLogout}
            activeOpacity={0.8}
          >
            <Ionicons name="log-out" size={20} color={Colors.error} />
            <Text style={styles.logoutBtnText}>Logout</Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: Colors.primary,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.white,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  shopPreview: {
    alignItems: 'center',
    marginBottom: 24,
  },
  shopLogo: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  shopLogoText: {
    fontSize: 36,
    fontWeight: '700',
    color: Colors.white,
  },
  shopPreviewName: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 4,
  },
  shopPreviewLocal: {
    fontSize: 16,
    color: Colors.primary,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 16,
  },
  inputGroup: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 2,
  },
  inputIcon: {
    width: 50,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.creamDark,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
  },
  inputWrapper: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textMuted,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    fontSize: 16,
    color: Colors.text,
    padding: 0,
  },
  inputMultiline: {
    minHeight: 40,
    textAlignVertical: 'top',
  },
  saveBtn: {
    flexDirection: 'row',
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  saveBtnSaved: {
    backgroundColor: Colors.success,
  },
  saveBtnDisabled: {
    backgroundColor: Colors.textMuted,
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.white,
  },
  logoutBtn: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    borderRadius: 12,
    paddingVertical: 16,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
    borderWidth: 2,
    borderColor: Colors.error,
  },
  logoutBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.error,
  },
  userCard: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 4,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
  },
  userAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  userInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  userName: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 4,
  },
  userMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  userDistrict: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.cream,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  roleText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.primary,
    letterSpacing: 0.5,
  },
});
