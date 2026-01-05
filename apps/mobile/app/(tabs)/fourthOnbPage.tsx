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
  


  const handleBack = () => {
    router.push('/secondOnbPage');
  };

  const handleContinue = () => {
    router.push('/'); 
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
          <Text style={styles.subtitle}>Ready for you first game?</Text>
        </View>
      </ScrollView>

    <View style={styles.card}>
    <View style={styles.checkmarkIconContainer}>
        <Ionicons style={styles.checkMark} name="checkmark" size={100} color="#ffffff" />
        <View style={styles.checkmarkTextContainer}>
        <Text style={styles.checkmarkText}>Locked</Text>
     </View>
  
    </View>
    

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
    marginBottom: 5,
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
    fontSize: 16,
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
    marginTop: 33,
  },
  checkMark: {
    marginTop: 20
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
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'center',
  },
  gameTextContainer: {
  },
  gameText: {
  },
  card: {
    width: 339,
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
