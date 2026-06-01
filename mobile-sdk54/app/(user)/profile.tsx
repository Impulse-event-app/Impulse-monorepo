import { useRouter } from 'expo-router';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const MENU_ITEMS = [
  { icon: '👤', label: 'Personal Details' },
  { icon: '🔔', label: 'Notifications' },
  { icon: '💳', label: 'Payment Methods' },
  { icon: '🎟', label: 'My Bookings' },
  { icon: '⭐', label: 'Saved Deals' },
  { icon: '🤝', label: 'Refer a Friend' },
  { icon: '❓', label: 'Help & Support' },
  { icon: '📄', label: 'Terms & Privacy' },
];

export default function ProfileScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Avatar & name */}
        <View style={styles.profileSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarEmoji}>👤</Text>
          </View>
          <Text style={styles.name}>Your Name</Text>
          <Text style={styles.email}>your@email.com</Text>
          <TouchableOpacity style={styles.editButton}>
            <Text style={styles.editButtonText}>Edit Profile</Text>
          </TouchableOpacity>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>0</Text>
            <Text style={styles.statLabel}>Bookings</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>$0</Text>
            <Text style={styles.statLabel}>Saved</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>0</Text>
            <Text style={styles.statLabel}>Saved deals</Text>
          </View>
        </View>

        {/* Menu */}
        <View style={styles.menu}>
          {MENU_ITEMS.map((item) => (
            <TouchableOpacity key={item.label} style={styles.menuItem}>
              <Text style={styles.menuIcon}>{item.icon}</Text>
              <Text style={styles.menuLabel}>{item.label}</Text>
              <Text style={styles.menuChevron}>›</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Sign out */}
        <TouchableOpacity
          style={styles.signOut}
          onPress={() => router.replace('/')}
        >
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0D0D' },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 },
  title: { fontSize: 28, fontWeight: '800', color: '#FFFFFF' },
  profileSection: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 20,
    gap: 6,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#2C2C2E',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  avatarEmoji: { fontSize: 36 },
  name: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  email: { color: '#8E8E93', fontSize: 14 },
  editButton: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  editButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: 20,
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    marginBottom: 24,
  },
  stat: { flex: 1, alignItems: 'center', gap: 4 },
  statValue: { color: '#FF5C35', fontSize: 20, fontWeight: '800' },
  statLabel: { color: '#8E8E93', fontSize: 12 },
  statDivider: { width: 1, backgroundColor: '#2C2C2E' },
  menu: { marginHorizontal: 20, backgroundColor: '#1C1C1E', borderRadius: 16, borderWidth: 1, borderColor: '#2C2C2E', overflow: 'hidden' },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C2E',
  },
  menuIcon: { fontSize: 18, width: 24 },
  menuLabel: { flex: 1, color: '#FFFFFF', fontSize: 15, fontWeight: '500' },
  menuChevron: { color: '#8E8E93', fontSize: 20 },
  signOut: {
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 32,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  signOutText: { color: '#FF3B30', fontSize: 16, fontWeight: '600' },
});
