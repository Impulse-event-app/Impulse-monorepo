import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Placeholder bookings — replace with API data
const UPCOMING = [
  {
    id: 'b1',
    venue: 'Strike Bowling Darling Harbour',
    category: 'Bowling',
    date: 'Mon 3 Jun · 5:00 PM',
    confirmationCode: 'IMP-8842',
    people: 3,
    totalPaid: 57,
  },
];

const PAST: typeof UPCOMING = [];

function BookingCard({ booking }: { booking: (typeof UPCOMING)[0] }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardLeft}>
        <Text style={styles.cardCategory}>{booking.category}</Text>
        <Text style={styles.cardVenue}>{booking.venue}</Text>
        <Text style={styles.cardDate}>{booking.date}</Text>
        <Text style={styles.cardPeople}>👥 {booking.people} people · ${booking.totalPaid} paid</Text>
      </View>
      <View style={styles.cardRight}>
        <Text style={styles.confirmationLabel}>Code</Text>
        <Text style={styles.confirmationCode}>{booking.confirmationCode}</Text>
      </View>
    </View>
  );
}

export default function BookingsScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My Bookings</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <Text style={styles.sectionLabel}>Upcoming</Text>
        {UPCOMING.length > 0 ? (
          UPCOMING.map((b) => <BookingCard key={b.id} booking={b} />)
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🎟</Text>
            <Text style={styles.emptyText}>No upcoming bookings</Text>
            <Text style={styles.emptySubtext}>Browse deals to book your next activity</Text>
          </View>
        )}

        <Text style={[styles.sectionLabel, { marginTop: 28 }]}>Past</Text>
        {PAST.length > 0 ? (
          PAST.map((b) => <BookingCard key={b.id} booking={b} />)
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No past bookings yet</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0D0D' },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  title: { fontSize: 28, fontWeight: '800', color: '#FFFFFF' },
  scroll: { paddingHorizontal: 20, paddingBottom: 20 },
  sectionLabel: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  cardLeft: { flex: 1, gap: 4 },
  cardCategory: { color: '#FF5C35', fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  cardVenue: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  cardDate: { color: '#8E8E93', fontSize: 13 },
  cardPeople: { color: '#8E8E93', fontSize: 12, marginTop: 4 },
  cardRight: { alignItems: 'flex-end', gap: 4 },
  confirmationLabel: { color: '#8E8E93', fontSize: 10, fontWeight: '600', textTransform: 'uppercase' },
  confirmationCode: { color: '#FF5C35', fontSize: 15, fontWeight: '800', letterSpacing: 1 },
  emptyState: { alignItems: 'center', paddingVertical: 32, gap: 6 },
  emptyEmoji: { fontSize: 36, marginBottom: 4 },
  emptyText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  emptySubtext: { color: '#8E8E93', fontSize: 13 },
});
