import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';


export default function FourthOnbPage() {
  const router = useRouter();
  


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
          <Text style={styles.title}>Game On</Text>
          <Text style={styles.title2}>Artin</Text>
          <Text style={styles.subtitle}>Ready for your first game?</Text>
        </View>
      </ScrollView>

    <View style={styles.card}>
    <View style={styles.checkmarkIconContainer}>
      <Ionicons style={styles.checkMark} name="checkmark" size={100} color="#ffffff" />
      <View style={styles.checkmarkTextContainer}>
        <Text style={styles.checkmarkText}>Locked</Text>
     </View>
    </View>
    <Text style={styles.cardText}>
  Play <Text style={styles.orangeText}>1 Game</Text> in the first{' '}
  <Text style={styles.blueText}>7 days</Text> to earn a{' '}
  <Text style={styles.greenText}>reliability</Text> badge!
</Text>
    

    </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.continueButton} onPress={handleContinue}>
          <Text style={styles.continueButtonText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  title2: {
    fontFamily: 'Lexend-Bold',
    fontWeight: '900',  // or '800' - heaviest weight
    fontSize: 40,
    color: '#19E675',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 20,
    color: '#666',
    textAlign: 'center',
  },
  checkmarkIconContainer: {
    width: 150,
    height: 150,
    borderRadius: 100,
    backgroundColor: '#19E675',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: 39,
  },
  checkMark: {
    marginTop: 30
  },
  checkmarkTextContainer: {
    width: 120,
    height: 40,
    borderRadius: 100,
    backgroundColor: '#2A2828',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: 3,
  },
  checkmarkText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
  },
  cardText: {
    marginTop: 45,
    fontSize: 15,
    color: '#000000',
    textAlign: 'center',
    fontFamily: 'Lexend-Bold',
    fontWeight: '900',  // or '800' - heaviest weight
  },
  orangeText: {
    color: '#FFAD3A'
  },
  blueText: {
    color: '#1A73E8'

  },
  greenText: {
    color: '#19E675'

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
