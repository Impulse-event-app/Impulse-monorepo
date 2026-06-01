import { useRouter } from 'expo-router';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Placeholder events — replace with API data
const EVENTS = [
  {
    id: 'e1',
    title: 'Midweek Bowling Special',
    category: 'Bowling',
    discount: '30%',
    dealPrice: 19,
    date: 'Mon 3 Jun',
    slots: ['5:00 PM', '6:00 PM', '7:00 PM'],
    booked: 8,
    total: 18,
    status: 'active' as const,
  },
  {
    id: 'e2',
    title: 'Tuesday Escape Rooms',
    category: 'Escape Room',
    discount: '25%',
    dealPrice: 30,
    date: 'Tue 4 Jun',
    slots: ['7:00 PM', '8:00 PM'],
    booked: 4,
    total: 12,
    status: 'active' as const,
  },
  {
    id: 'e3',
    title: 'Sunday Karaoke Night',
    category: 'Karaoke',
    discount: '40%',
    dealPrice: 15,
    date: 'Sun 1 Jun',
    slots: ['6:00 PM'],
    booked: 10,
    total: 10,
    status: 'expired' as const,
  },
];

type Event = (typeof EVENTS)[0];

function EventCard({ event }: { event: Event }) {
  const router = useRouter();
  const fillPct = Math.round((event.booked / event.total) * 100);
  const isExpired = event.status === 'expired';

  return (
    <View style={[styles.card, isExpired && styles.cardDim]}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.cardCategory}>{event.category}</Text>
          <Text style={styles.cardTitle}>{event.title}</Text>
        </View>
        <View style={[styles.statusBadge, isExpired ? styles.statusExpired : styles.statusActive]}>
          <Text style={styles.statusText}>{isExpired ? 'Expired' : 'Live'}</Text>
        </View>
      </View>

      <View style={styles.cardMeta}>
        <Text style={styles.metaText}>📅 {event.date}</Text>
        <Text style={styles.metaText}>🕐 {event.slots.join(', ')}</Text>
        <Text style={styles.metaText}>💰 ${event.dealPrice}/person · {event.discount} off</Text>
      </View>

      {/* Capacity bar */}
      <View style={styles.capacityRow}>
        <Text style={styles.capacityText}>{event.booked}/{event.total} spots filled</Text>
        <Text style={styles.capacityPct}>{fillPct}%</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${fillPct}%` as any }]} />
      </View>

      {!isExpired && (
        <TouchableOpacity
          style={styles.editButton}
          onPress={() => router.push(`/(admin)/event/${event.id}`)}
        >
          <Text style={styles.editButtonText}>Edit Deal →</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function AdminEventsScreen() {
  const router = useRouter();
  const active = EVENTS.filter((e) => e.status === 'active');
  const expired = EVENTS.filter((e) => e.status === 'expired');

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My Deals</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => router.push('/(admin)/add-event')}
        >
          <Text style={styles.addButtonText}>＋ New</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <Text style={styles.sectionLabel}>Active ({active.length})</Text>
        {active.map((e) => <EventCard key={e.id} event={e} />)}

        {expired.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { marginTop: 24 }]}>Past ({expired.length})</Text>
            {expired.map((e) => <EventCard key={e.id} event={e} />)}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0D0D' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  title: { fontSize: 28, fontWeight: '800', color: '#FFFFFF' },
  addButton: {
    backgroundColor: '#FF5C35',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  scroll: { paddingHorizontal: 20, paddingBottom: 20 },
  sectionLabel: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    gap: 10,
  },
  cardDim: { opacity: 0.6 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardCategory: { color: '#FF5C35', fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  cardTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusActive: { backgroundColor: '#30D15820' },
  statusExpired: { backgroundColor: '#2C2C2E' },
  statusText: { color: '#30D158', fontSize: 12, fontWeight: '700' },
  cardMeta: { gap: 4 },
  metaText: { color: '#8E8E93', fontSize: 13 },
  capacityRow: { flexDirection: 'row', justifyContent: 'space-between' },
  capacityText: { color: '#8E8E93', fontSize: 12 },
  capacityPct: { color: '#FF5C35', fontSize: 12, fontWeight: '700' },
  progressTrack: { height: 4, backgroundColor: '#2C2C2E', borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#FF5C35', borderRadius: 2 },
  editButton: {
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#2C2C2E',
    marginTop: 2,
  },
  editButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
});
