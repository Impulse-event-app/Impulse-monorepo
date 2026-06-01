import { useRouter } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function RoleSelector() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.logo}>Impulse</Text>
        <Text style={styles.tagline}>Last-minute deals on Sydney activities</Text>
      </View>

      <View style={styles.buttons}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.replace('/(user)/home')}
        >
          <Text style={styles.primaryButtonText}>Browse Deals</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.replace('/(admin)/dashboard')}
        >
          <Text style={styles.secondaryButtonText}>Venue Admin</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 120,
    paddingBottom: 60,
  },
  hero: {
    alignItems: 'center',
    gap: 12,
  },
  logo: {
    fontSize: 52,
    fontWeight: '800',
    color: '#FF5C35',
    letterSpacing: -1,
  },
  tagline: {
    fontSize: 16,
    color: '#8E8E93',
    textAlign: 'center',
  },
  buttons: {
    gap: 12,
  },
  primaryButton: {
    backgroundColor: '#FF5C35',
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: '#1C1C1E',
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  secondaryButtonText: {
    color: '#8E8E93',
    fontSize: 17,
    fontWeight: '600',
  },
});
