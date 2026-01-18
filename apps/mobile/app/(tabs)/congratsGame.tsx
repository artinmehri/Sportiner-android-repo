import React, { useState, useRef, useEffect } from 'react';
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
  Animated,
  Dimensions,
} from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';


  type ShareCardData = {
    name: string;
    profileImage: string;
    daysToComplete: number;
    level: number;
  }

export default function CongratsGame() {
  const router = useRouter();
  const viewShotRef = useRef<ViewShot>(null);
  const params = useLocalSearchParams<{
    name?: string;
    profileImage?: string;
    daysToComplete?: string;
    level?: string;
  }>();

  const data: ShareCardData = {
    name: params.name || 'User',
    profileImage: params.profileImage || '',
    daysToComplete: params.daysToComplete ? parseInt(params.daysToComplete) : 2,
    level: params.level ? parseInt(params.level) : 3.5,
  };


  const pulseAnim = useRef(new Animated.Value(1)).current;
  const starBounceAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();


    Animated.loop(
      Animated.sequence([
        Animated.timing(starBounceAnim, {
          toValue: -8,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(starBounceAnim, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);


  const captureCard = async () => {
    if (viewShotRef.current?.capture) {
      const uri = await viewShotRef.current.capture();
   
      
 
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: 'Share your verified status!'
      });
    }
  }

  const handleContinue = () => {
    router.push('/'); 
  };



  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollViewContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Top gradient overlay */}
        <View style={styles.topGradient} />

        <View style={styles.topSection}>
          <View style={styles.titleSection}>
            <MaskedView
              maskElement={<Text style={styles.title}>Challenge Complete! 🏆</Text>}
            >
              <View style={{ backgroundColor: '#19E675' }}>
                <Text style={[styles.title, { opacity: 0 }]}>Challenge Complete! 🏆</Text>
              </View>
            </MaskedView>
          </View>

          <Animated.View 
            style={[
              styles.checkmarkIconContainer,
              {
                transform: [{ scale: pulseAnim }],
              }
            ]}
          >
            <Ionicons name="shield-checkmark" size={40} color="#13ec49" />
            <Animated.View
              style={[
                styles.starIcon,
                {
                  transform: [{ translateY: starBounceAnim }],
                }
              ]}
            >
              <Ionicons name="star" size={24} color="#d4f936" />
            </Animated.View>
          </Animated.View>

          <Text style={styles.subtitle}>Reliability Status Unlocked</Text>
        </View>

        <View style={styles.cardWrapper}>
    <ViewShot ref={viewShotRef}>
      <View style={styles.shareCardContainer}>
        {/* Background gradient overlay */}
        <View style={styles.cardGradientOverlay} />
        
        {/* Decorative blur circles */}
        <View style={styles.decorativeCircle1} />
        <View style={styles.decorativeCircle2} />
        <View style={styles.decorativeCircle3} />

        <View style={styles.shareCardContent}>
          {/* Header */}
          <View style={styles.shareCardHeader}>
            <View style={styles.brandContainer}>
              <Ionicons name="tennisball-outline" size={16} color="#13ec49" />
              <Text style={styles.brandText}>Sportiner</Text>
            </View>
            <View style={styles.verifiedBadge}>
              <Text style={styles.verifiedText}>#VERIFIED</Text>
            </View>
          </View>

          {/* Profile Image */}
          <View style={styles.profileImageContainer}>
            {data.profileImage ? (
              <Image
                source={{ uri: data.profileImage }}
                style={styles.profileImage}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.profileImage, styles.profileImagePlaceholder]}>
                <Ionicons name="person" size={100} color="#13ec49" />
              </View>
            )}
            <View style={styles.newStatusBadge}>
              <Text style={styles.newStatusText}>NEW STATUS</Text>
            </View>
          </View>

          {/* Main Text */}
          <View style={styles.nameSection}>
            <Text style={styles.nameText}>{data.name.toUpperCase()}</Text>
            <Text style={styles.nameText}>IS NOW</Text>
            <MaskedView
              maskElement={<Text style={styles.nameText}>VERIFIED.</Text>}
            >
              <View style={{ backgroundColor: '#d4f936' }}>
                <Text style={[styles.nameText, { opacity: 0 }]}>VERIFIED.</Text>
              </View>
            </MaskedView>
          </View>

          {/* Stats Grid */}
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>First Match</Text>
              <View style={styles.statValueRow}>
                <Text style={styles.statValue}>Done</Text>
                <Ionicons name="checkmark-circle" size={20} color="#13ec49" />
              </View>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Skill Level</Text>
              <Text style={styles.statValue}>
                {data.level} <Text style={styles.statValueSmall}>INT</Text>
              </Text>
            </View>
            <View style={[styles.statCard, styles.statCardWide]}>
              <View style={styles.statCardContent}>
                <View>
                  <Text style={styles.statLabel}>Total Time</Text>
                  <Text style={styles.statValueTime}>{data.daysToComplete} Days to Complete</Text>
                </View>
                <View style={styles.timerIconContainer}>
                  <Ionicons name="timer-outline" size={20} color="#13ec49" />
                </View>
              </View>
            </View>
          </View>

          {/* Footer */}
          <View style={styles.cardFooter}>
            <Text style={styles.cardId}>ID: 8829-XP</Text>
            <View style={styles.decorativeBars}>
              <View style={[styles.decorativeBar, styles.bar1]} />
              <View style={[styles.decorativeBar, styles.bar2]} />
              <View style={[styles.decorativeBar, styles.bar3]} />
              <View style={[styles.decorativeBar, styles.bar4]} />
            </View>
          </View>
        </View>
      </View>
        </ViewShot>

        {/* Share Button */}
        <TouchableOpacity style={styles.shareButton} onPress={captureCard}>
          <Ionicons name="share-outline" size={24} />
        </TouchableOpacity>
      </View>

      {/* Bottom Button */}
      <View style={styles.bottomButtonContainer}>
        <TouchableOpacity style={styles.findMatchButton} onPress={handleContinue}>
          <Text style={styles.findMatchButtonText}>Find Your Next Match</Text>
          <View style={styles.findMatchButtonIcon}>
            <Ionicons name="arrow-forward" size={20} color="#102215" />
          </View>
        </TouchableOpacity>
      </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  cardWrapper: {
    width: '100%',
    height: 790,
    maxWidth: 360,
    aspectRatio: 9 / 16,
    alignSelf: 'center',
    marginVertical: 20,
    position: 'relative',
  },
  shareCardContainer: {
    width: '100%',
    height: '100%',
    borderRadius: 40,
    backgroundColor: '#1a1f1b',
    overflow: 'hidden',
    position: 'relative',
  },
  cardGradientOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '50%',
    opacity: 0.1,
  },
  decorativeCircle1: {
    position: 'absolute',
    top: -80,
    left: -80,
    width: 256,
    height: 256,
    borderRadius: 128,
    backgroundColor: 'rgba(19, 236, 73, 0.2)',
    opacity: 0.3,
  },
  decorativeCircle2: {
    position: 'absolute',
    top: '50%',
    right: -80,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: 'rgba(212, 249, 54, 0.2)',
    opacity: 0.3,
  },
  decorativeCircle3: {
    position: 'absolute',
    bottom: 0,
    left: 40,
    width: 256,
    height: 256,
    borderRadius: 128,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    opacity: 0.3,
  },
  shareCardContent: {
    flex: 1,
    padding: 24,
    zIndex: 10,
  },
  shareCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  brandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    opacity: 0.8,
  },
  brandText: {
    color: '#13ec49',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 3.2,
    textTransform: 'uppercase',
  },
  verifiedBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  verifiedText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 10,
    fontWeight: '700',
  },
  profileImageContainer: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 24,
    borderWidth: 4,
    borderColor: '#000',
    transform: [{ rotate: '-2deg' }],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 16,
  },
  profileImage: {
    width: '100%',
    height: '100%',
  },
  profileImagePlaceholder: {
    backgroundColor: '#1a1f1b',
    justifyContent: 'center',
    alignItems: 'center',
  },
  newStatusBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: '#13ec49',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 9999,
    transform: [{ rotate: '3deg' }],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  newStatusText: {
    color: '#000',
    fontSize: 12,
    fontWeight: '800',
  },
  nameSection: {
    marginBottom: 24,
    gap: 4,
  },
  nameText: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '800',
    lineHeight: 40,
    letterSpacing: -1,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 'auto',
  },
  statCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    flex: 1,
    minWidth: '45%',
  },
  statCardWide: {
    minWidth: '100%',
    marginTop: 0,
  },
  statCardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statLabel: {
    color: 'rgba(156, 163, 175, 1)',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  statValue: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  statValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statValueSmall: {
    fontSize: 14,
    fontWeight: '400',
    color: 'rgba(209, 213, 219, 1)',
  },
  statValueTime: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  timerIconContainer: {
    backgroundColor: 'rgba(19, 236, 73, 0.2)',
    padding: 8,
    borderRadius: 9999,
  },
  cardFooter: {
    marginTop: 27,
    marginBottom: 30,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  cardId: {
    color: 'rgba(107, 114, 128, 1)',
    fontSize: 10,
    fontFamily: 'monospace',
  },
  decorativeBars: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'flex-end',
  },
  decorativeBar: {
    width: 4,
    backgroundColor: '#13ec49',
    borderRadius: 2,
  },
  bar1: {
    height: 16,
  },
  bar2: {
    height: 24,
    backgroundColor: '#d4f936',
  },
  bar3: {
    height: 12,
    backgroundColor: '#FFFFFF',
  },
  bar4: {
    height: 20,
    backgroundColor: 'rgba(19, 236, 73, 0.5)',
  },
  shareButton: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    width: 330,
    height: 48,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    justifyContent: 'center',
    alignSelf: 'center',
    alignItems: 'center',
    zIndex: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  bottomButtonContainer: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    paddingBottom: 32,
    width: '100%',
  },
  findMatchButton: {
    width: '100%',
    height: 64,
    backgroundColor: '#13ec49',
    borderRadius: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    shadowColor: '#13ec49',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 15,
    elevation: 8,
  },
  findMatchButtonText: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: '#102215',
  },
  findMatchButtonIcon: {
    width: 40,
    height: 40,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: 20,
  },
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '50%',
    zIndex: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
  },
  topSection: {
    paddingTop: 40,
    paddingHorizontal: 24,
    paddingBottom: 8,
    alignItems: 'center',
    zIndex: 10,
    position: 'relative',
  },
  titleSection: {
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontWeight: '800',
    fontSize: 30,
    color: '#000000',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 12,
    color: '#333',
    textAlign: 'center',
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 4,
    marginTop: 12,
    marginBottom: 12
  },
  checkmarkIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#005124',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(19, 236, 73, 0.3)',
    shadowColor: '#13ec49',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
    marginVertical: 8,
    position: 'relative',
  },
  starIcon: {
    position: 'absolute',
    top: -8,
    right: -8,
  },
  cardText: {
    marginTop: 45,
    fontSize: 15,
    color: '#000000',
    textAlign: 'center',
    fontFamily: 'Lexend-Bold',
    fontWeight: '900',
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

   
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    
   
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
