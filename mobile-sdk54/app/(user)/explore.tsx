import { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const SUBURBS = ['All Areas', 'CBD', 'Newtown', 'Surry Hills', 'Darling Harbour', 'Bondi', 'Parramatta'];
const CATEGORIES = ['All', 'Bowling', 'Escape Rooms', 'Karaoke', 'Mini Golf', 'Axe Throwing', 'Gigs'];
const TIMES = ['Any Time', 'Today', 'Tonight', 'This Weekend', 'Next 48 hrs'];

export default function ExploreScreen() {
  const [search, setSearch] = useState('');
  const [selectedSuburb, setSelectedSuburb] = useState('All Areas');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedTime, setSelectedTime] = useState('Any Time');

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Explore</Text>
      </View>

      {/* Search bar */}
      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search venues, activities..."
          placeholderTextColor="#8E8E93"
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Suburb filter */}
        <Text style={styles.filterLabel}>📍 Area</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {SUBURBS.map((s) => (
            <TouchableOpacity
              key={s}
              style={[styles.chip, selectedSuburb === s && styles.chipActive]}
              onPress={() => setSelectedSuburb(s)}
            >
              <Text style={[styles.chipText, selectedSuburb === s && styles.chipTextActive]}>
                {s}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Category filter */}
        <Text style={styles.filterLabel}>🎯 Category</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {CATEGORIES.map((c) => (
            <TouchableOpacity
              key={c}
              style={[styles.chip, selectedCategory === c && styles.chipActive]}
              onPress={() => setSelectedCategory(c)}
            >
              <Text style={[styles.chipText, selectedCategory === c && styles.chipTextActive]}>
                {c}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Time filter */}
        <Text style={styles.filterLabel}>🕐 When</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {TIMES.map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.chip, selectedTime === t && styles.chipActive]}
              onPress={() => setSelectedTime(t)}
            >
              <Text style={[styles.chipText, selectedTime === t && styles.chipTextActive]}>
                {t}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Results placeholder */}
        <View style={styles.resultsContainer}>
          <Text style={styles.resultsTitle}>Results</Text>
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🔎</Text>
            <Text style={styles.emptyText}>Search results will appear here</Text>
            <Text style={styles.emptySubtext}>Try selecting a suburb or category above</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0D0D' },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  title: { fontSize: 28, fontWeight: '800', color: '#FFFFFF' },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    marginHorizontal: 20,
    marginVertical: 12,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    gap: 10,
  },
  searchIcon: { fontSize: 16 },
  searchInput: { flex: 1, color: '#FFFFFF', fontSize: 15 },
  filterLabel: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 20,
    marginTop: 16,
    marginBottom: 8,
  },
  chipRow: { paddingHorizontal: 20, gap: 8, paddingBottom: 4 },
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
  resultsContainer: { paddingHorizontal: 20, marginTop: 24 },
  resultsTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', marginBottom: 16 },
  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyEmoji: { fontSize: 40 },
  emptyText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  emptySubtext: { color: '#8E8E93', fontSize: 14 },
});
