import { useRouter } from 'expo-router';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Placeholder deal data — replace with API data
const DEALS = [
  {
    id: '1',
    venue: 'Strike Bowling Darling Harbour',
    category: 'Bowling',
    discount: '30% off',
    time: 'Today 5:00 PM',
    suburb: 'Darling Harbour',
    spotsLeft: 6,
    originalPrice: 28,
    dealPrice: 19,
  },
  {
    id: '2',
    venue: 'Enigma Escape Rooms',
    category: 'Escape Room',
    discount: '25% off',
    time: 'Today 7:00 PM',
    suburb: 'CBD',
    spotsLeft: 4,
    originalPrice: 40,
    dealPrice: 30,
  },
  {
    id: '3',
    venue: 'King Pin Karaoke',
    category: 'Karaoke',
    discount: '40% off',
    time: 'Tomorrow 6:00 PM',
    suburb: 'Newtown',
    spotsLeft: 10,
    originalPrice: 25,
    dealPrice: 15,
  },
];

function DealCard({ deal }: { deal: (typeof DEALS)[0] }) {
  const router = useRouter();
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/(user)/event/${deal.id}`)}
      activeOpacity={0.8}
    >
      <View style={styles.cardImagePlaceholder}>
        <Text style={styles.cardEmoji}>
          {deal.category === 'Bowling'
            ? '🎳'
            : deal.category === 'Escape Room'
              ? '🔐'
              : '🎤'}
        </Text>
      </View>
      <View style={styles.cardBody}>
        <View style={styles.cardMeta}>
          <Text style={styles.categoryPill}>{deal.category}</Text>
          <Text style={styles.discountBadge}>{deal.discount}</Text>
        </View>
        <Text style={styles.cardTitle}>{deal.venue}</Text>
        <Text style={styles.cardSubtitle}>
          {deal.suburb} · {deal.time}
        </Text>
        <View style={styles.cardFooter}>
          <Text style={styles.dealPrice}>
            ${deal.dealPrice}{' '}
            <Text style={styles.originalPrice}>${deal.originalPrice}</Text>
          </Text>
          <Text style={styles.spots}>{deal.spotsLeft} spots left</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hey 👋</Text>
          <Text style={styles.headline}>What's on tonight?</Text>
        </View>
        <TouchableOpacity style={styles.locationPill}>
          <Text style={styles.locationText}>📍 Sydney</Text>
        </TouchableOpacity>
      </View>

      {/* Category filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {['All', 'Bowling', 'Escape Rooms', 'Karaoke', 'Mini Golf', 'Gigs'].map(
          (cat) => (
            <TouchableOpacity
              key={cat}
              style={[styles.chip, cat === 'All' && styles.chipActive]}
            >
              <Text
                style={[styles.chipText, cat === 'All' && styles.chipTextActive]}
              >
                {cat}
              </Text>
            </TouchableOpacity>
          ),
        )}
      </ScrollView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
      >
        <Text style={styles.sectionLabel}>⚡ Deals ending soon</Text>
        {DEALS.map((deal) => (
          <DealCard key={deal.id} deal={deal} />
        ))}
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
    paddingBottom: 12,
  },
  greeting: { fontSize: 14, color: '#8E8E93' },
  headline: { fontSize: 26, fontWeight: '800', color: '#FFFFFF', marginTop: 2 },
  locationPill: {
    backgroundColor: '#1C1C1E',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  locationText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  filterRow: { paddingHorizontal: 20, gap: 8, paddingBottom: 12 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  chipActive: { backgroundColor: '#FF5C35', borderColor: '#FF5C35' },
  chipText: { color: '#8E8E93', fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: '#FFFFFF' },
  list: { paddingHorizontal: 20, paddingBottom: 20 },
  sectionLabel: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 12,
    marginTop: 4,
  },
  card: {
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  cardImagePlaceholder: {
    height: 140,
    backgroundColor: '#2C2C2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardEmoji: { fontSize: 48 },
  cardBody: { padding: 14 },
  cardMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  categoryPill: { color: '#8E8E93', fontSize: 12, fontWeight: '600' },
  discountBadge: {
    color: '#FF5C35',
    fontSize: 12,
    fontWeight: '700',
    backgroundColor: '#FF5C3520',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  cardSubtitle: { color: '#8E8E93', fontSize: 13, marginBottom: 10 },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dealPrice: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  originalPrice: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '400',
    textDecorationLine: 'line-through',
  },
  spots: { color: '#FF9F0A', fontSize: 12, fontWeight: '600' },
});
