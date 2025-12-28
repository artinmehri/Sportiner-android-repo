import { Image } from 'expo-image';
import { View, StyleSheet, Text, TouchableOpacity, Alert } from 'react-native';
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
    <ScrollView>
        <View style={styles.heroContainer}>
            <Image source={require('@/assets/images/tennis-court.png')} style={styles.eventImage} />
            <TouchableOpacity 
              style={styles.backButton}
              onPress={() => router.back()}
            >
              <Ionicons name="chevron-back" size={24} color="#000" />
            </TouchableOpacity>
        </View>
        <View style={styles.gameTitleContainer}>
            <Text style={styles.gameTitle}>Alex's Tennis Doubles</Text>
        </View>
            <View style={styles.logos}>
                {[
                  { id: 1, name: '300 Steels Avenue ', logo: require('@/assets/images/icon.png') },
                  { id: 2, name: 'Today', logo: require('@/assets/images/icon.png') },
                  { id: 3, name: 'Advanced 4.5+', logo: require('@/assets/images/icon.png') },
                  { id: 4, name: '10$ Entry', logo: require('@/assets/images/icon.png') },
                ].map(item => (
                  <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <Image source={item.logo} style={{ width: 32, height: 32, marginRight: 8 }} />
                    <Text style={{ fontSize: 16, fontWeight: 'heavy'}}>{item.name}</Text>
                  </View>
                ))}
            </View>
        <View>
            <Text style={styles.About}>About This Match</Text>
            <Text style={styles.description}>Join us for an exciting doubles tournament at Central Park! This event is perfect for intermediate players looking to test their skills and meet new people. We'll have a round-robin format with prizes for the top teams. Refreshments will be provided, and all equipment is included. Sign up now to secure your spot!</Text>
            <View style={{marginBottom: 3}}>
                <Text style={styles.organizer}>Organizer</Text>
                <Image style={{ width: 32, height: 32, marginLeft: 8 }} source={require('@/assets/images/icon.png')}/> 
                <Text style={{ fontSize: 16, fontWeight: 'heavy', bottom: 26, left: 47}}>Ethan Carter</Text>
            </View>
            <View style={{marginBottom: 15}}>
                <Text style={styles.attendees}>Who's Going?</Text>
                <Image style={{ width: 32, height: 32, marginLeft: 8, top: 3}} source={require('@/assets/images/icon.png')}/> 
                <Image style={{ width: 32, height: 32, marginLeft: 8, bottom: 2 }} source={require('@/assets/images/icon.png')}/> 
                <Image style={{ width: 32, height: 32, marginLeft: 8, bottom: 1}} source={require('@/assets/images/icon.png')}/> 

            </View>
        </View>
        <TouchableOpacity style={styles.requestSpotButton} onPress={handleJoinEvent}>
            <Text style={styles.matchButtonText}>Request Spot</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.messageHostButton} onPress={handleMessageHost}>
            <Text style={styles.secondMatchButtonText}>Message Host</Text>
        </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
    heroContainer: {
        position: 'relative',
    },
    eventImage: {
        marginTop: 57,
        width: '100%',
        height: 214,
    },
    backButton: {
        position: 'absolute',
        top: 70,
        left: 16,
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'white',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5,
    },
    gameTitle: {
        fontWeight: 'bold',
        fontSize: 23
    },
    About: {
        fontWeight: 'bold',
        fontSize: 23,
        marginLeft: 10,
        top: 12,
        marginBottom: 20
    },
    description: {
        marginRight: 10,
        marginLeft: 10,
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 30
    },
    organizer: {
        fontWeight: 'bold',
        fontSize: 20,
        marginLeft: 10,
        top: 2,
        marginBottom: 20
    },
    organizerImage: {
        marginLeft: 10
    },
    attendees: {
        fontWeight: 'bold',
        fontSize: 18,
        marginLeft: 10,
        top: 2,
        marginBottom: 10
    },
    gameTitleContainer: {
        marginLeft: 10,
        top: 20,
        marginBottom: 40
    },
    logos: {
        marginLeft: 10,
    },
    requestSpotButton: {
        backgroundColor: '#19E657',
        paddingVertical: 10,
        paddingHorizontal: 30,
        borderRadius: 10,
        width: 300,
        alignItems: 'center',
        marginLeft: 50,
        marginBottom: 10

    },
    messageHostButton: {
        backgroundColor: '#005124',
        paddingVertical: 10,
        paddingHorizontal: 30,
        borderRadius: 10,
        width: 300,
        alignItems: 'center',
        marginLeft: 50,
        marginBottom: 10

    },
    matchButtonText: {
        color: '#005124',
        fontSize: 20,
        fontWeight: 'bold',
        alignItems: 'center',

    },
    secondMatchButtonText: {
        color: '#19E675',
        fontSize: 20,
        fontWeight: 'bold',
        alignItems: 'center',

    }
});
