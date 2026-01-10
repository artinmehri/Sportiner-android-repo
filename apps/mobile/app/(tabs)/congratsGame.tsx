import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ScrollView,
  Button,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';


export default function CongratsGame({ data }: { data: ShareCardData }) {
  const router = useRouter();
  const viewShotRef = useRef<ViewShot>(null);
  
  type ShareCardDate = {
    name: string;
    profileImage: string;
    daysToComplete: number;
    level: number;
  }

  // When user taps "Share this Story"
  const captureCard = async () => {
    if (viewShotRef.current?.capture) {
      const uri = await viewShotRef.current.capture();
      // uri is the image file path
      
      // Open native share sheet
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: 'Share your verified status!'
      });
    }
  }

  const handleContinue = () => {
    router.push('/SignUp'); 
  };



  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.titleSection}>
          <MaskedView
            maskElement={<Text style={styles.title}>Challenge Complete</Text>}
          >
            <LinearGradient
              colors={['#DFE619', '#C9E623', '#19E675']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={[styles.title, { opacity: 0 }]}>Challenge Complete</Text>
            </LinearGradient>
          </MaskedView>
        </View>
      </ScrollView>

  <View style={styles.reliabilityCheck}>
    <View style={styles.checkmarkIconContainer}>
      <Ionicons name="checkmark" size={39} color="#000000" />
    </View>
    <Text style={styles.subtitle} numberOfLines={1}>Reliability status unlocked!</Text>
  </View>




  <ViewShot ref={viewShotRef}> (captures everything inside)
    <View> 
 
    export default function ShareCard({ data }: { data: ShareCardData }) {
  return (
    <LinearGradient
      colors={['#2A1F0A', '#3A2F12', '#1C1C1C']}
      style={styles.container}
    >

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.brand}>SPORTINER</Text>
        <Text style={styles.verified}>VERIFIED</Text>
      </View>

      {/* Profile Image */}
      <Image
        source={{ uri: data.profileImage }}
        style={styles.image}
      />

      {/* Main Text */}
      <Text style={styles.name}>{data.name.toUpperCase()}</Text>
      <Text style={styles.line}>
        IS NOW <Text style={styles.green}>VERIFIED</Text>
      </Text>

      {/* Stats */}
      <View style={styles.stats}>
        <View>
          <Text style={styles.label}>TOTAL TIME</Text>
          <Text style={styles.value}>{data.daysToComplete} Days</Text>
        </View>
        <View>
          <Text style={styles.label}>LEVEL</Text>
          <Text style={styles.value}>{data.level}</Text>
        </View>
      </View>

    </LinearGradient>
  </View>
  );


    </View>
  </ViewShot>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
   container: {
    width: 1080,
    height: 1920,
    padding: 60,
    justifyContent: 'space-between',
    borderRadius: 60,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  brand: {
    color: '#A3FF12',
    fontWeight: '800',
    letterSpacing: 2,
  },

  verified: {
    color: '#E5E7EB',
    fontSize: 12,
  },

  image: {
    width: '100%',
    height: 500,
    borderRadius: 40,
  },

  name: {
    color: '#FFFFFF',
    fontSize: 40,
    fontWeight: '900',
    letterSpacing: -1,
  },

  line: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '800',
  },

  green: {
    color: '#19E675',
  },

  stats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  label: {
    color: '#9CA3AF',
    fontSize: 12,
    letterSpacing: 1,
  },

  value: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  titleSection: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontFamily: 'Lexend-Bold',
    fontWeight: '900',  // or '800' - heaviest weight
    fontSize: 40,
    color: '#000000',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
  },
  checkmarkIconContainer: {
    width: 70,
    height: 70,
    borderRadius: 100,
    backgroundColor: '#19E675',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: -70,
    marginBottom: 10
  },
  reliabilityCheck: {
    marginBottom: 130
  },
  cardText: {
    marginTop: 45,
    fontSize: 15,
    color: '#000000',
    textAlign: 'center',
    fontFamily: 'Lexend-Bold',
    fontWeight: '900',  // or '800' - heaviest weight
  },
  card: {
    width: 350,
    height: 318,
    backgroundColor: '#FFFFFF',
    borderRadius: 30,
    borderWidth: 1,
    borderColor: '#757575',
    alignSelf: 'center',
    position: 'absolute',
    marginTop: 270,

    // iOS shadows
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    
    // Android shadow
    elevation: 8,
  },
  footer: {
    paddingHorizontal: 20,
    paddingBottom: 30,
    paddingTop: 10,
    backgroundColor: '#fff',
  },
  continueButton: {
    height: 56,
    backgroundColor: '#19E675',
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
});
