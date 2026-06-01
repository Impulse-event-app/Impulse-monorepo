import { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const CATEGORIES = ['Bowling', 'Escape Room', 'Karaoke', 'Mini Golf', 'Axe Throwing', 'Arcade', 'Other'];

export default function AddEventScreen() {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [originalPrice, setOriginalPrice] = useState('');
  const [discountPct, setDiscountPct] = useState('');
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState(['']);
  const [maxGroupSize, setMaxGroupSize] = useState('6');
  const [totalSpots, setTotalSpots] = useState('');
  const [isActive, setIsActive] = useState(true);

  const dealPrice = originalPrice && discountPct
    ? (parseFloat(originalPrice) * (1 - parseFloat(discountPct) / 100)).toFixed(2)
    : null;

  const addSlot = () => setSlots((prev) => [...prev, '']);
  const updateSlot = (index: number, value: string) =>
    setSlots((prev) => prev.map((s, i) => (i === index ? value : s)));
  const removeSlot = (index: number) =>
    setSlots((prev) => prev.filter((_, i) => i !== index));

  const handleSubmit = () => {
    // TODO: POST to backend API
    console.log({ title, category, description, originalPrice, discountPct, date, slots, maxGroupSize, totalSpots, isActive });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Post a Deal</Text>
        <Text style={styles.subtitle}>Fill in the details below to go live</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Basic info */}
        <Text style={styles.sectionTitle}>Basic Info</Text>

        <Text style={styles.label}>Deal Title</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Midweek Bowling Special"
          placeholderTextColor="#8E8E93"
          value={title}
          onChangeText={setTitle}
        />

        <Text style={styles.label}>Category</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[styles.chip, category === cat && styles.chipActive]}
              onPress={() => setCategory(cat)}
            >
              <Text style={[styles.chipText, category === cat && styles.chipTextActive]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="What's included? Any restrictions?"
          placeholderTextColor="#8E8E93"
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
        />

        <View style={styles.divider} />

        {/* Pricing */}
        <Text style={styles.sectionTitle}>Pricing</Text>

        <View style={styles.row}>
          <View style={styles.halfField}>
            <Text style={styles.label}>Full Price ($)</Text>
            <TextInput
              style={styles.input}
              placeholder="28.00"
              placeholderTextColor="#8E8E93"
              value={originalPrice}
              onChangeText={setOriginalPrice}
              keyboardType="decimal-pad"
            />
          </View>
          <View style={styles.halfField}>
            <Text style={styles.label}>Discount (%)</Text>
            <TextInput
              style={styles.input}
              placeholder="30"
              placeholderTextColor="#8E8E93"
              value={discountPct}
              onChangeText={setDiscountPct}
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

        {/* Schedule */}
        <Text style={styles.sectionTitle}>Schedule</Text>

        <Text style={styles.label}>Date</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Monday 3 June 2026"
          placeholderTextColor="#8E8E93"
          value={date}
          onChangeText={setDate}
        />

        <Text style={styles.label}>Available Time Slots</Text>
        {slots.map((slot, index) => (
          <View key={index} style={styles.slotRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder={`Slot ${index + 1} — e.g. 5:00 PM`}
              placeholderTextColor="#8E8E93"
              value={slot}
              onChangeText={(val) => updateSlot(index, val)}
            />
            {slots.length > 1 && (
              <TouchableOpacity style={styles.removeSlot} onPress={() => removeSlot(index)}>
                <Text style={styles.removeSlotText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
        <TouchableOpacity style={styles.addSlotButton} onPress={addSlot}>
          <Text style={styles.addSlotText}>＋ Add time slot</Text>
        </TouchableOpacity>

        <View style={styles.divider} />

        {/* Capacity */}
        <Text style={styles.sectionTitle}>Capacity</Text>

        <View style={styles.row}>
          <View style={styles.halfField}>
            <Text style={styles.label}>Max Group Size</Text>
            <TextInput
              style={styles.input}
              placeholder="6"
              placeholderTextColor="#8E8E93"
              value={maxGroupSize}
              onChangeText={setMaxGroupSize}
              keyboardType="number-pad"
            />
          </View>
          <View style={styles.halfField}>
            <Text style={styles.label}>Total Spots</Text>
            <TextInput
              style={styles.input}
              placeholder="24"
              placeholderTextColor="#8E8E93"
              value={totalSpots}
              onChangeText={setTotalSpots}
              keyboardType="number-pad"
            />
          </View>
        </View>

        <View style={styles.divider} />

        {/* Publish toggle */}
        <View style={styles.publishRow}>
          <View>
            <Text style={styles.publishLabel}>Go live immediately</Text>
            <Text style={styles.publishSubtext}>Deal will be visible to users right away</Text>
          </View>
          <Switch
            value={isActive}
            onValueChange={setIsActive}
            trackColor={{ false: '#2C2C2E', true: '#FF5C35' }}
            thumbColor="#FFFFFF"
          />
        </View>

        <TouchableOpacity style={styles.submitButton} onPress={handleSubmit}>
          <Text style={styles.submitText}>{isActive ? 'Post Deal' : 'Save as Draft'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0D0D' },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 },
  title: { fontSize: 28, fontWeight: '800', color: '#FFFFFF' },
  subtitle: { color: '#8E8E93', fontSize: 14, marginTop: 2 },
  scroll: { paddingHorizontal: 20, paddingBottom: 40 },
  sectionTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '700', marginBottom: 12, marginTop: 4 },
  label: { color: '#8E8E93', fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 12 },
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
  chipRow: { gap: 8, paddingBottom: 4 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  chipActive: { backgroundColor: '#FF5C35', borderColor: '#FF5C35' },
  chipText: { color: '#8E8E93', fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: '#FFFFFF' },
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
    marginTop: 4,
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
    marginBottom: 20,
  },
  publishLabel: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  publishSubtext: { color: '#8E8E93', fontSize: 12, marginTop: 2 },
  submitButton: {
    backgroundColor: '#FF5C35',
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: 'center',
  },
  submitText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
});
