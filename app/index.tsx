import { Link } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function Index() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Camera App</Text>
      <View style={styles.buttonContainer}>
        <Link href="/camera" asChild>
          <TouchableOpacity style={styles.button}>
            <Text style={styles.buttonText}>Regular Camera</Text>
          </TouchableOpacity>
        </Link>
        <Link href="/panorama-camera" asChild>
          <TouchableOpacity style={styles.button}>
            <Text style={styles.buttonText}>Panorama Camera</Text>
          </TouchableOpacity>
        </Link>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 30,
  },
  buttonContainer: {
    width: '100%',
    gap: 20,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 10,
    width: '100%',
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});