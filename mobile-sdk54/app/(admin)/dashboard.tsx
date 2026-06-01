import { useRouter } from 'expo-router';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Placeholder stats — replace with API data
const STATS = [
  { label: 'Active Deals', value: '3', icon: '⚡' },
  { label: 'Bookings Today', value: '12', icon: '🎟' },
  { label: 'Revenue Today', value: '$228', icon: '💰' },
  { label: 'Spots Filled', value: '18/24', icon: '👥' },
];

const RECENT_BOOKINGS = [
  { id: 'b1', name: 'James T.', deal: 'Bowling 5PM', people: 3, paid: '$57', time: '2h ago' },
  { id: 'b2', name: 'Sarah M.', deal: 'Escape Room 7PM', people: 2, paid: '$60', time: '3h ago' },
  { id: 'b3', name: 'Alex K.', deal: 'Karaoke 6PM', people: 4, paid: '$60', time: '5h ago' },
];

export default function AdminDashboardScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Venue Portal</Text>
          <Text style={styles.venueName}>Your Venue Name</Text>
        </View>
        <TouchableOpacity
          style={styles.switchButton}
          onPress={() => router.replace('/')}
        >
          <Text style={styles.switchText}>← User App</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Stats grid */}
        <View style={styles.statsGrid}>
          {STATS.map((s) => (
            <View key={s.label} style={styles.statCard}>
              <Text style={styles.statIcon}>{s.icon}</Text>
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Quick action */}
        <TouchableOpacity
          style={styles.addDealButton}
          onPress={() => router.push('/(admin)/add-event')}
        >
          <Text style={styles.addDealText}>＋ Post a New Deal</Text>
        </TouchableOpacity>

        {/* Recent bookings */}
        <Text style={styles.sectionTitle}>Recent Bookings</Text>
        <View style={styles.bookingList}>
          {RECENT_BOOKINGS.map((b) => (
            <View key={b.id} style={styles.bookingRow}>
              <View style={styles.bookingLeft}>
                <Text style={styles.bookingName}>{b.name}</Text>
                <Text style={styles.bookingDeal}>{b.deal} · {b.people} people</Text>
              </View>
              <View style={styles.bookingRight}>
                <Text style={styles.bookingPaid}>{b.paid}</Text>
                <Text style={styles.bookingTime}>{b.time}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Active deals summary */}
        <Text style={styles.sectionTitle}>Active Deals</Text>
        <TouchableOpacity
          style={styles.viewAllButton}
          onPress={() => router.push('/(admin)/events')}
        >
          <Text style={styles.viewAllText}>View all active deals →</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0D0D' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  greeting: { color: '#8E8E93', fontSize: 13 },
  venueName: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', marginTop: 2 },
  switchButton: {
    backgroundColor: '#1C1C1E',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  switchText: { color: '#8E8E93', fontSize: 12, fontWeight: '600' },
  scroll: { paddingHorizontal: 20, paddingBottom: 20 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    padding: 16,
    gap: 4,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  statIcon: { fontSize: 24 },
  statValue: { color: '#FF5C35', fontSize: 24, fontWeight: '800', marginTop: 4 },
  statLabel: { color: '#8E8E93', fontSize: 12 },
  addDealButton: {
    backgroundColor: '#FF5C35',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 28,
  },
  addDealText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  sectionTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', marginBottom: 12 },
  bookingList: {
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    overflow: 'hidden',
    marginBottom: 28,
  },
  bookingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C2E',
  },
  bookingLeft: { gap: 3 },
  bookingName: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  bookingDeal: { color: '#8E8E93', fontSize: 12 },
  bookingRight: { alignItems: 'flex-end', gap: 2 },
  bookingPaid: { color: '#30D158', fontSize: 14, fontWeight: '700' },
  bookingTime: { color: '#8E8E93', fontSize: 11 },
  viewAllButton: {
    backgroundColor: '#1C1C1E',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  viewAllText: { color: '#FF5C35', fontSize: 14, fontWeight: '600' },
});
