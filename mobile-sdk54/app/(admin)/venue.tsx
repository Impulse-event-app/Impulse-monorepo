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

export default function VenueSettingsScreen() {
  const [venueName, setVenueName] = useState('');
  const [category, setCategory] = useState('');
  const [address, setAddress] = useState('');
  const [suburb, setSuburb] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [description, setDescription] = useState('');
  const [openingHours, setOpeningHours] = useState('');

  const handleSave = () => {
    // TODO: PATCH to backend API
    console.log({ venueName, category, address, suburb, phone, email, website, description, openingHours });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Venue Settings</Text>
        <Text style={styles.subtitle}>Your venue profile seen by users</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Venue photo placeholder */}
        <TouchableOpacity style={styles.photoPicker}>
          <Text style={styles.photoEmoji}>🏢</Text>
          <Text style={styles.photoText}>Tap to upload venue photo</Text>
        </TouchableOpacity>

        {/* Basic details */}
        <Text style={styles.sectionTitle}>Venue Details</Text>

        <Text style={styles.label}>Venue Name</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Strike Bowling Darling Harbour"
          placeholderTextColor="#8E8E93"
          value={venueName}
          onChangeText={setVenueName}
        />

        <Text style={styles.label}>Category / Type</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Bowling, Escape Rooms, Karaoke..."
          placeholderTextColor="#8E8E93"
          value={category}
          onChangeText={setCategory}
        />

        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Tell users what makes your venue special..."
          placeholderTextColor="#8E8E93"
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
        />

        <View style={styles.divider} />

        {/* Location */}
        <Text style={styles.sectionTitle}>Location</Text>

        <Text style={styles.label}>Street Address</Text>
        <TextInput
          style={styles.input}
          placeholder="1-25 Harbour St"
          placeholderTextColor="#8E8E93"
          value={address}
          onChangeText={setAddress}
        />

        <Text style={styles.label}>Suburb</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Darling Harbour"
          placeholderTextColor="#8E8E93"
          value={suburb}
          onChangeText={setSuburb}
        />

        <TouchableOpacity style={styles.mapButton}>
          <Text style={styles.mapButtonText}>📍 Set Location on Map</Text>
        </TouchableOpacity>

        <View style={styles.divider} />

        {/* Contact */}
        <Text style={styles.sectionTitle}>Contact Info</Text>

        <Text style={styles.label}>Phone</Text>
        <TextInput
          style={styles.input}
          placeholder="(02) 9XXX XXXX"
          placeholderTextColor="#8E8E93"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          placeholder="venue@example.com"
          placeholderTextColor="#8E8E93"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <Text style={styles.label}>Website (optional)</Text>
        <TextInput
          style={styles.input}
          placeholder="https://yourvenue.com.au"
          placeholderTextColor="#8E8E93"
          value={website}
          onChangeText={setWebsite}
          keyboardType="url"
          autoCapitalize="none"
        />

        <View style={styles.divider} />

        {/* Opening hours */}
        <Text style={styles.sectionTitle}>Opening Hours</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder={'Mon–Fri: 10am – 11pm\nSat–Sun: 9am – midnight'}
          placeholderTextColor="#8E8E93"
          value={openingHours}
          onChangeText={setOpeningHours}
          multiline
          numberOfLines={4}
        />

        <View style={styles.divider} />

        {/* Danger zone */}
        <Text style={styles.sectionTitle}>Account</Text>
        <TouchableOpacity style={styles.dangerButton}>
          <Text style={styles.dangerText}>Deactivate Venue Account</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
          <Text style={styles.saveText}>Save Changes</Text>
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
  photoPicker: {
    height: 140,
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#2C2C2E',
    borderStyle: 'dashed',
    marginBottom: 24,
    gap: 8,
  },
  photoEmoji: { fontSize: 40 },
  photoText: { color: '#8E8E93', fontSize: 14 },
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
  mapButton: {
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  mapButtonText: { color: '#FF5C35', fontSize: 14, fontWeight: '600' },
  divider: { height: 1, backgroundColor: '#2C2C2E', marginVertical: 20 },
  dangerButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FF3B3040',
    marginBottom: 16,
  },
  dangerText: { color: '#FF3B30', fontSize: 14, fontWeight: '600' },
  saveButton: {
    backgroundColor: '#FF5C35',
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: 'center',
  },
  saveText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
});
