import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Placeholder — replace with fetch by id from API
const EVENT_DATA: Record<string, {
  title: string;
  category: string;
  description: string;
  originalPrice: string;
  discountPct: string;
  date: string;
  slots: string[];
  maxGroupSize: string;
  totalSpots: string;
  isActive: boolean;
}> = {
  e1: {
    title: 'Midweek Bowling Special',
    category: 'Bowling',
    description: 'Premium 10-pin bowling. Shoe hire included. Lane for up to 6 players.',
    originalPrice: '28',
    discountPct: '30',
    date: 'Monday 3 June 2026',
    slots: ['5:00 PM', '6:00 PM', '7:00 PM'],
    maxGroupSize: '6',
    totalSpots: '18',
    isActive: true,
  },
  e2: {
    title: 'Tuesday Escape Rooms',
    category: 'Escape Room',
    description: '60-minute escape room for groups of 2–6.',
    originalPrice: '40',
    discountPct: '25',
    date: 'Tuesday 4 June 2026',
    slots: ['7:00 PM', '8:00 PM'],
    maxGroupSize: '6',
    totalSpots: '12',
    isActive: true,
  },
};

export default function EditEventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const existing = EVENT_DATA[id ?? ''];

  const [title, setTitle] = useState(existing?.title ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [originalPrice, setOriginalPrice] = useState(existing?.originalPrice ?? '');
  const [discountPct, setDiscountPct] = useState(existing?.discountPct ?? '');
  const [date, setDate] = useState(existing?.date ?? '');
  const [slots, setSlots] = useState<string[]>(existing?.slots ?? ['']);
  const [maxGroupSize, setMaxGroupSize] = useState(existing?.maxGroupSize ?? '6');
  const [totalSpots, setTotalSpots] = useState(existing?.totalSpots ?? '');
  const [isActive, setIsActive] = useState(existing?.isActive ?? true);

  const dealPrice = originalPrice && discountPct
    ? (parseFloat(originalPrice) * (1 - parseFloat(discountPct) / 100)).toFixed(2)
    : null;

  const addSlot = () => setSlots((prev) => [...prev, '']);
  const updateSlot = (index: number, value: string) =>
    setSlots((prev) => prev.map((s, i) => (i === index ? value : s)));
  const removeSlot = (index: number) =>
    setSlots((prev) => prev.filter((_, i) => i !== index));

  const handleSave = () => {
    // TODO: PATCH to backend API
    console.log({ id, title, description, originalPrice, discountPct, date, slots, maxGroupSize, totalSpots, isActive });
    router.back();
  };

  const handleDelete = () => {
    Alert.alert('Delete Deal', 'Are you sure you want to delete this deal? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          // TODO: DELETE via API
          router.replace('/(admin)/events');
        },
      },
    ]);
  };

  if (!existing) {
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
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Edit Deal</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <Text style={styles.label}>Deal Title</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholderTextColor="#8E8E93"
        />

        <Text style={styles.label}>Category</Text>
        <Text style={styles.readOnly}>{existing.category}</Text>

        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={description}
          onChangeText={setDescription}
          placeholderTextColor="#8E8E93"
          multiline
          numberOfLines={4}
        />

        <View style={styles.divider} />
        <Text style={styles.sectionTitle}>Pricing</Text>

        <View style={styles.row}>
          <View style={styles.halfField}>
            <Text style={styles.label}>Full Price ($)</Text>
            <TextInput
              style={styles.input}
              value={originalPrice}
              onChangeText={setOriginalPrice}
              placeholderTextColor="#8E8E93"
              keyboardType="decimal-pad"
            />
          </View>
          <View style={styles.halfField}>
            <Text style={styles.label}>Discount (%)</Text>
            <TextInput
              style={styles.input}
              value={discountPct}
              onChangeText={setDiscountPct}
              placeholderTextColor="#8E8E93"
              keyboardType="number-pad"
            />
          </View>
        </View>

        {dealPrice && (
          <View style={styles.pricePreview}>
            <Text style={styles.pricePreviewLabel}>Deal price per person:</Text>
            <Text style={styles.pricePreviewValue}>${dealPrice}</Text>
          </View>
        )}

        <View style={styles.divider} />
        <Text style={styles.sectionTitle}>Schedule</Text>

        <Text style={styles.label}>Date</Text>
        <TextInput
          style={styles.input}
          value={date}
          onChangeText={setDate}
          placeholderTextColor="#8E8E93"
        />

        <Text style={styles.label}>Time Slots</Text>
        {slots.map((slot, index) => (
          <View key={index} style={styles.slotRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={slot}
              onChangeText={(val) => updateSlot(index, val)}
              placeholderTextColor="#8E8E93"
              placeholder={`Slot ${index + 1}`}
            />
            {slots.length > 1 && (
              <TouchableOpacity style={styles.removeSlot} onPress={() => removeSlot(index)}>
                <Text style={styles.removeSlotText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
        <TouchableOpacity style={styles.addSlotButton} onPress={addSlot}>
          <Text style={styles.addSlotText}>＋ Add slot</Text>
        </TouchableOpacity>

        <View style={styles.divider} />
        <Text style={styles.sectionTitle}>Capacity</Text>

        <View style={styles.row}>
          <View style={styles.halfField}>
            <Text style={styles.label}>Max Group Size</Text>
            <TextInput
              style={styles.input}
              value={maxGroupSize}
              onChangeText={setMaxGroupSize}
              placeholderTextColor="#8E8E93"
              keyboardType="number-pad"
            />
          </View>
          <View style={styles.halfField}>
            <Text style={styles.label}>Total Spots</Text>
            <TextInput
              style={styles.input}
              value={totalSpots}
              onChangeText={setTotalSpots}
              placeholderTextColor="#8E8E93"
              keyboardType="number-pad"
            />
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.publishRow}>
          <View>
            <Text style={styles.publishLabel}>Deal is live</Text>
            <Text style={styles.publishSubtext}>Toggle off to pause this deal</Text>
          </View>
          <Switch
            value={isActive}
            onValueChange={setIsActive}
            trackColor={{ false: '#2C2C2E', true: '#FF5C35' }}
            thumbColor="#FFFFFF"
          />
        </View>

        <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
          <Text style={styles.saveText}>Save Changes</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
          <Text style={styles.deleteText}>Delete Deal</Text>
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
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C2E',
  },
  backText: { color: '#FF5C35', fontSize: 15, fontWeight: '600' },
  title: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  scroll: { paddingHorizontal: 20, paddingBottom: 40 },
  sectionTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '700', marginBottom: 4, marginTop: 4 },
  label: { color: '#8E8E93', fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 14 },
  input: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: '#FFFFFF',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  textArea: { height: 100, textAlignVertical: 'top' },
  readOnly: {
    color: '#8E8E93',
    fontSize: 15,
    paddingVertical: 4,
  },
  row: { flexDirection: 'row', gap: 12 },
  halfField: { flex: 1 },
  pricePreview: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FF5C3520',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#FF5C3540',
  },
  pricePreviewLabel: { color: '#8E8E93', fontSize: 13 },
  pricePreviewValue: { color: '#FF5C35', fontSize: 18, fontWeight: '800' },
  slotRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  removeSlot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#2C2C2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeSlotText: { color: '#8E8E93', fontSize: 14 },
  addSlotButton: {
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    alignItems: 'center',
    borderStyle: 'dashed',
  },
  addSlotText: { color: '#FF5C35', fontSize: 14, fontWeight: '600' },
  divider: { height: 1, backgroundColor: '#2C2C2E', marginVertical: 20 },
  publishRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    marginBottom: 16,
  },
  publishLabel: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  publishSubtext: { color: '#8E8E93', fontSize: 12, marginTop: 2 },
  saveButton: {
    backgroundColor: '#FF5C35',
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  saveText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  deleteButton: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FF3B3040',
  },
  deleteText: { color: '#FF3B30', fontSize: 15, fontWeight: '600' },
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notFoundText: { color: '#8E8E93', fontSize: 16 },
  backButton: { padding: 16 },
});
