import { Image } from 'expo-image';
import { View, StyleSheet, Text, TouchableOpacity, Alert, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function EventDetails() {
  const router = useRouter();

  const handleMessageHost = () => {
    router.push('/(tabs)/chat');
  };

  const handleJoinEvent = () => {
    Alert.alert('Success', 'You have successfully joined the event!');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.heroContainer}>
          <Image source={require('@/assets/images/tennis-court.png')} style={styles.eventImage} />
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="chevron-back" size={24} color="#000" />
          </TouchableOpacity>
        </View>

        <View style={styles.contentCard}>
          <Text style={styles.eventTitle}>Alex's Tennis Doubles</Text>

          <View style={styles.detailsContainer}>
            <View style={styles.detailItem}>
              <View style={styles.iconContainer}>
                <Ionicons name="location" size={18} color="white" />
              </View>
              <Text style={styles.detailText}>300 Steels Avenue</Text>
            </View>

            <View style={styles.detailItem}>
              <View style={styles.iconContainer}>
                <Ionicons name="calendar-outline" size={18} color="white" />
              </View>
              <Text style={styles.detailText}>Today</Text>
            </View>

            <View style={styles.detailItem}>
              <View style={styles.iconContainer}>
                <Ionicons name="flash" size={18} color="white" />
              </View>
              <Text style={styles.detailText}>Advanced 4.5+</Text>
            </View>

            <View style={styles.detailItem}>
              <View style={styles.iconContainer}>
                <Ionicons name="star" size={18} color="white" />
              </View>
              <Text style={styles.detailText}>10$ Entry</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About this match</Text>
            <Text style={styles.sectionDescription}>
              Join us for an exciting doubles tournament at Central Park! This event is perfect for intermediate players looking to test their skills and meet new people. We'll have a round-robin format with prizes for the top teams. Refreshments will be provided, and all equipment is included. Sign up now to secure your spot!
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Organizer</Text>
            <View style={styles.organizerContainer}>
              <Image source={require('@/assets/images/icon.png')} style={styles.organizerImage} />
              <View style={styles.organizerInfo}>
                <Text style={styles.organizerName}>Ethan Carter</Text>
                <Text style={styles.organizerRole}>Tournament Director</Text>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Who's Going? (12)</Text>
            <View style={styles.attendeesContainer}>
              {[1, 2, 3, 4, 5, 6, 7].map((index) => (
                <Image 
                  key={index} 
                  source={require('@/assets/images/icon.png')} 
                  style={[
                    styles.attendeeImage,
                    index > 0 && { marginLeft: -8 }
                  ]} 
                />
              ))}
            </View>
          </View>
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.requestSpotButton} onPress={handleJoinEvent}>
            <Text style={styles.requestSpotText}>Request Spot</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.messageHostButton} onPress={handleMessageHost}>
            <Text style={styles.messageHostText}>Message Host</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  scrollView: {
    flex: 1,
  },
  heroContainer: {
    position: 'relative',
  },
  eventImage: {
    width: '100%',
    height: 280,
  },
  backButton: {
    position: 'absolute',
    top: 60,
    left: 24,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 5,
  },
  contentCard: {
    backgroundColor: 'white',
    marginTop: 60,
    marginHorizontal: 16,
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 10,
  },
  eventTitle: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 24,
    color: '#1a1a1a',
    lineHeight: 38,
  },
  detailsContainer: {
    marginBottom: 32,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#22c55e',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  detailText: {
    fontSize: 15,
    color: '#374151',
    flex: 1,
    fontWeight: '500',
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
    color: '#1a1a1a',
  },
  sectionDescription: {
    fontSize: 14,
    lineHeight: 20,
    color: '#6b7280',
  },
  organizerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  organizerImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 16,
  },
  organizerInfo: {
    flex: 1,
  },
  organizerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  organizerRole: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  attendeesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  attendeeImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'white',
  },
  buttonContainer: {
    paddingHorizontal: 16,
    paddingBottom: 60,
    marginTop: 40,
  },
  requestSpotButton: {
    backgroundColor: '#22c55e',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 28,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#22c55e',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  messageHostButton: {
    backgroundColor: '#14532d',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 28,
    alignItems: 'center',
  },
  requestSpotText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  messageHostText: {
    color: '#22c55e',
    fontSize: 16,
    fontWeight: '600',
  },
});
