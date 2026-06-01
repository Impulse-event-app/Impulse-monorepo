import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Placeholder — in production, fetch deal by id from API
const DEAL_DATA: Record<string, {
  venue: string;
  category: string;
  suburb: string;
  address: string;
  discount: string;
  originalPrice: number;
  dealPrice: number;
  expiresAt: string;
  slots: string[];
  spotsLeft: number;
  description: string;
  emoji: string;
}> = {
  '1': {
    venue: 'Strike Bowling Darling Harbour',
    category: 'Bowling',
    suburb: 'Darling Harbour',
    address: '1-25 Harbour St, Sydney NSW 2000',
    discount: '30% off',
    originalPrice: 28,
    dealPrice: 19,
    expiresAt: 'Today 9:00 PM',
    slots: ['5:00 PM', '6:00 PM', '7:00 PM'],
    spotsLeft: 6,
    description: 'Premium 10-pin bowling in the heart of Darling Harbour. Shoe hire included. Lane for up to 6 players.',
    emoji: '🎳',
  },
  '2': {
    venue: 'Enigma Escape Rooms',
    category: 'Escape Room',
    suburb: 'CBD',
    address: '227 Elizabeth St, Sydney NSW 2000',
    discount: '25% off',
    originalPrice: 40,
    dealPrice: 30,
    expiresAt: 'Today 9:30 PM',
    slots: ['7:00 PM', '8:00 PM'],
    spotsLeft: 4,
    description: '60-minute escape room experience for groups of 2–6. Multiple themed rooms available. Book your preferred time below.',
    emoji: '🔐',
  },
};

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const deal = DEAL_DATA[id ?? ''] ?? null;

  if (!deal) {
    return (
      <SafeAreaView style={styles.container}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.notFound}>
          <Text style={styles.notFoundText}>Deal not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.heroEmoji}>{deal.emoji}</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <View style={styles.discountBadge}>
            <Text style={styles.discountText}>{deal.discount}</Text>
          </View>
        </View>

        <View style={styles.body}>
          {/* Title block */}
          <Text style={styles.category}>{deal.category.toUpperCase()}</Text>
          <Text style={styles.venueName}>{deal.venue}</Text>
          <Text style={styles.address}>📍 {deal.address}</Text>

          {/* Price */}
          <View style={styles.priceRow}>
            <Text style={styles.dealPrice}>${deal.dealPrice}</Text>
            <Text style={styles.originalPrice}>${deal.originalPrice}</Text>
            <Text style={styles.perPerson}> per person</Text>
          </View>

          <Text style={styles.expires}>⏱ Deal expires: {deal.expiresAt}</Text>
          <Text style={styles.spots}>🔥 Only {deal.spotsLeft} spots left</Text>

          <View style={styles.divider} />

          {/* Description */}
          <Text style={styles.sectionTitle}>About</Text>
          <Text style={styles.description}>{deal.description}</Text>

          <View style={styles.divider} />

          {/* Time slots */}
          <Text style={styles.sectionTitle}>Select a Time</Text>
          <View style={styles.slotRow}>
            {deal.slots.map((slot) => (
              <TouchableOpacity key={slot} style={styles.slot}>
                <Text style={styles.slotText}>{slot}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.divider} />

          {/* Group size */}
          <Text style={styles.sectionTitle}>Group Size</Text>
          <View style={styles.groupRow}>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <TouchableOpacity key={n} style={[styles.groupBtn, n === 2 && styles.groupBtnActive]}>
                <Text style={[styles.groupBtnText, n === 2 && styles.groupBtnTextActive]}>{n}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* Sticky CTA */}
      <View style={styles.footer}>
        <View>
          <Text style={styles.footerTotal}>$38 total</Text>
          <Text style={styles.footerNote}>for 2 people</Text>
        </View>
        <TouchableOpacity style={styles.bookButton}>
          <Text style={styles.bookButtonText}>Book Now</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0D0D' },
  hero: {
    height: 220,
    backgroundColor: '#2C2C2E',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  heroEmoji: { fontSize: 72 },
  backButton: {
    position: 'absolute',
    top: 16,
    left: 16,
    backgroundColor: '#0D0D0D80',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  backText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  discountBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: '#FF5C35',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  discountText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  body: { padding: 20 },
  category: { color: '#FF5C35', fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 4 },
  venueName: { color: '#FFFFFF', fontSize: 24, fontWeight: '800', marginBottom: 6 },
  address: { color: '#8E8E93', fontSize: 14, marginBottom: 16 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 8 },
  dealPrice: { color: '#FFFFFF', fontSize: 28, fontWeight: '800' },
  originalPrice: { color: '#8E8E93', fontSize: 16, textDecorationLine: 'line-through' },
  perPerson: { color: '#8E8E93', fontSize: 13 },
  expires: { color: '#8E8E93', fontSize: 13, marginBottom: 4 },
  spots: { color: '#FF9F0A', fontSize: 13, fontWeight: '600', marginBottom: 4 },
  divider: { height: 1, backgroundColor: '#2C2C2E', marginVertical: 20 },
  sectionTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '700', marginBottom: 12 },
  description: { color: '#8E8E93', fontSize: 14, lineHeight: 22 },
  slotRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  slot: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  slotText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  groupRow: { flexDirection: 'row', gap: 10 },
  groupBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  groupBtnActive: { backgroundColor: '#FF5C35', borderColor: '#FF5C35' },
  groupBtnText: { color: '#8E8E93', fontSize: 15, fontWeight: '700' },
  groupBtnTextActive: { color: '#FFFFFF' },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#1C1C1E',
    borderTopWidth: 1,
    borderTopColor: '#2C2C2E',
  },
  footerTotal: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  footerNote: { color: '#8E8E93', fontSize: 12 },
  bookButton: {
    backgroundColor: '#FF5C35',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  bookButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notFoundText: { color: '#8E8E93', fontSize: 16 },
});
