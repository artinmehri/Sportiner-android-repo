import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Modal,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGames } from '@/context/GameContext';
import DateTimePicker from '@react-native-community/datetimepicker';
import { createChat } from '@/context/ChatContext';
import { supabase, useAuth } from '@/context/AuthContext';
import {
  fetchApproxLocationFromIp,
  findCourtByName,
  getDefaultCourts,
  sortCourtsByProximity,
  type GeoCoords,
} from '@/lib/courtSuggestions';
import * as Location from 'expo-location';

type GameType = '1v1' | 'Group';
type SkillLevel = 'Beginner' | 'Intermediate' | 'Advanced';
type JoinSetting = '👥 Open to Anyone' | '✋ Request Approval';
type CourtType = 'Public' | 'Private/Club' | 'Condo';

export default function CreateGame() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { addGame } = useGames();
  const { user } = useAuth();
  const [gameType, setGameType] = useState<GameType>('1v1');
  const [skillLevel, setSkillLevel] = useState<SkillLevel>('Beginner');
  const [joinSetting, setJoinSetting] = useState<JoinSetting>('👥 Open to Anyone');

  const [date, setDate] = useState<string>('');
  const [time, setTime] = useState<string>('07:00');
  const [location, setLocation] = useState<string>('');
  const [showLocationSuggestions, setShowLocationSuggestions] = useState<boolean>(false);
  const [selectedLocation, setSelectedLocation] = useState<string>('');
  const [courtType, setCourtType] = useState<CourtType>('Public');
  const [isBooked, setIsBooked] = useState<boolean>(false);

  const [numberOfPlayers, setNumberOfPlayers] = useState<number>(2);
  const [isPaid, setIsPaid] = useState<boolean>(true);
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [gameDescription, setGameDescription] = useState<string>('');
  const [locationCoords, setLocationCoords] = useState<GeoCoords | null>(null);
  const [nearbyOrigin, setNearbyOrigin] = useState<GeoCoords | null>(null);
  const [loadingCourts, setLoadingCourts] = useState(false);


  const [datePickerMode, setDatePickerMode] = useState<'date' | 'time'>('date');
  const [tempDate, setTempDate] = useState<Date>(new Date());
  const [showPickerModal, setShowPickerModal] = useState<boolean>(false);
  const [showBookingInfoModal, setShowBookingInfoModal] = useState<boolean>(false);
  



  useEffect(() => {
    let active = true;
    (async () => {
      const ipLocation = await fetchApproxLocationFromIp();
      if (active) {
        setNearbyOrigin(ipLocation);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const locationSuggestions = useMemo(() => {
    const query = location.trim().toLowerCase();
    const sorted = sortCourtsByProximity(getDefaultCourts(), nearbyOrigin);
    if (!query) {
      return sorted;
    }
    return sorted.filter((court) => court.name.toLowerCase().includes(query));
  }, [location, nearbyOrigin]);

  const selectGameType = (type: GameType) => {
    setGameType(type);
    if (type === '1v1') {
      setNumberOfPlayers(2);
    } else if (numberOfPlayers < 3) {
      setNumberOfPlayers(3);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'MM/DD/YYYY';
    const date = new Date(dateString);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
  };

  const handleDateSelect = (event: any, selectedDate?: Date) => {
    if (event.type === 'set' && selectedDate) {
      setTempDate(selectedDate);
    }
  };

  const handleTimeSelect = (event: any, selectedDate?: Date) => {
    if (event.type === 'set' && selectedDate) {
      setTempDate(selectedDate);
    }
  };

  const getGamePhoto = () => {
    return 'https://images.unsplash.com/photo-1534158914592-062992fbe900?auto=format&fit=crop&w=200&q=60';
  }


  const confirmDateSelection = () => {
    if (datePickerMode === 'date') {
      setDate(tempDate.toISOString());
    } else {
      const hours = String(tempDate.getHours()).padStart(2, '0');
      const minutes = String(tempDate.getMinutes()).padStart(2, '0');
      setTime(`${hours}:${minutes}`);
    }
    setShowPickerModal(false);
  };

  const openDatePicker = () => {
    setDatePickerMode('date');
    setTempDate(date ? new Date(date) : new Date());
    setShowPickerModal(true);
  };

  const openTimePicker = () => {
    setDatePickerMode('time');
    const currentTime = time ? new Date(`1970-01-01T${time}`) : new Date();
    setTempDate(currentTime);
    setShowPickerModal(true);
  };

  const handleLocationSelect = (courtName: string, coords?: GeoCoords) => {
    const court = findCourtByName(courtName);
    setLocation(courtName);
    setSelectedLocation(courtName);
    setLocationCoords(
      coords ?? (court ? { lat: court.lat, lng: court.lng } : null)
    );
    setShowLocationSuggestions(false);
  };

  const handleUseCurrentLocation = async () => {
    setLoadingCourts(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location', 'Allow location access to find courts near you.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const coords = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };
      setNearbyOrigin(coords);
      setShowLocationSuggestions(true);
      const nearest = sortCourtsByProximity(getDefaultCourts(), coords)[0];
      if (nearest) {
        handleLocationSelect(nearest.name, { lat: nearest.lat, lng: nearest.lng });
      }
    } catch {
      Alert.alert('Location', 'Could not get your current location.');
    } finally {
      setLoadingCourts(false);
    }
  };

  const handleLocationFocus = () => {
    setShowLocationSuggestions(true);
  };

  const handleLocationChange = (text: string) => {
    setLocation(text);
    setShowLocationSuggestions(text.length > 0 || true);
  };

  const handleCreateGame = async () => {
    if (!date) {
      Alert.alert('Missing Information', 'Please select a date for your game');
      return;
    }
    
    if (!time) {
      Alert.alert('Missing Information', 'Please select a time for your game');
      return;
    }
    
    if (!location.trim()) {
      Alert.alert('Missing Information', 'Please enter a location for your game');
      return;
    }
    
    if (!gameDescription.trim()) {
      Alert.alert('Missing Information', 'Please provide a description for your game');
      return;
    }
    
    if (isPaid && !paymentAmount.trim()) {
      Alert.alert('Missing Information', 'Please enter a payment amount for your paid game');
      return;
    }

    const playerCount = gameType === '1v1' ? 2 : numberOfPlayers;

    const gameData = {
      gameType,
      skillLevel,
      joinSetting,
      date,
      time,
      location,
      locationCoords,
      courtType,
      isBooked,
      numberOfPlayers: playerCount,
      gameDescription,
      isPaid,
      paymentAmount,
      title: `${gameType === '1v1' ? '1v1' : 'Group'} Tennis Game`,
    };

    try {

    const game = await addGame(gameData);
    const chatType = gameData.gameType === '1v1' ? 'private' : 'group';
    const members = user ? [{ id: user.id, level: skillLevel }] : [];
    const chatId = await createChat(chatType, gameData.title, '', game.id, members);

    await supabase
      .from('games')
      .update({ chat_id: chatId })
      .eq('id', game.id);

    router.push('/(tabs)/GameConfirmation');
    
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Something went wrong';
      console.log(message)
      Alert.alert('Could not create game', message);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create New Game</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.contentContainer, { paddingBottom: insets.bottom + 20 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* The Core Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>The Core</Text>
          <Text style={styles.inputLabel}>Game type</Text>

          {/* Game Type */}
          <View style={styles.gameTypeContainer}>
            <TouchableOpacity
              style={[styles.gameTypeButton, gameType === '1v1' && styles.gameTypeButtonActive]}
              onPress={() => selectGameType('1v1')}
            >
              <Ionicons
                name="person"
                size={24}
                color={gameType === '1v1' ? '#000' : '#666'}
              />
              <Text
                style={[
                  styles.gameTypeText,
                  gameType === '1v1' && styles.gameTypeTextActive,
                ]}
              >
                1 VS 1
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.gameTypeButton, gameType === 'Group' && styles.gameTypeButtonActive]}
              onPress={() => selectGameType('Group')}
            >
              <Ionicons
                name="people"
                size={24}
                color={gameType === 'Group' ? '#000' : '#666'}
              />
              <Text
                style={[
                  styles.gameTypeText,
                  gameType === 'Group' && styles.gameTypeTextActive,
                ]}
              >
                Group Game
              </Text>
            </TouchableOpacity>
          </View>

          {/* Skill Level */}
          <Text style={styles.levelLable}>Skill level</Text>
          <View style={styles.skillLevelContainer}>
            {(['Beginner', 'Intermediate', 'Advanced'] as SkillLevel[]).map((level) => (
              <TouchableOpacity
                key={level}
                style={[
                  styles.skillLevelButton,
                  skillLevel === level && styles.skillLevelButtonActive,
                ]}
                onPress={() => setSkillLevel(level)}
              >
                {skillLevel === level && (
                  <Ionicons name="checkmark" size={16} color="#19E675" style={styles.checkIcon} />
                )}
                <Text
                  style={[
                    styles.skillLevelText,
                    skillLevel === level && styles.skillLevelTextActive,
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {level}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Join Settings */}
          <Text style={styles.visibilityLable}>Visibility</Text>
          <View style={styles.joinSettingsContainer}>
            <TouchableOpacity
              style={styles.joinSettingButton}
              onPress={() => setJoinSetting('👥 Open to Anyone')}
            >
              <Text
                style={[
                  styles.joinSettingText,
                  joinSetting === '👥 Open to Anyone' && styles.joinSettingTextActive,
                ]}
              >
                👥 Open to Anyone
              </Text>
              {joinSetting === '👥 Open to Anyone' && (
                <View style={styles.underline} />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.joinSettingButton}
              onPress={() => setJoinSetting('✋ Request Approval')}
            >
              <Text
                style={[
                  styles.joinSettingText,
                  joinSetting === '✋ Request Approval' && styles.joinSettingTextActive,
                ]}
              >
                ✋ Request Approval
              </Text>
              {joinSetting === '✋ Request Approval' && (
                <View style={styles.underline} />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* The Logistics Section */}
        <View style={styles.section}>
          <Text style={{fontSize: 23, fontWeight: '800', color: '#000', marginBottom: 4, marginTop: 40,}}>The Logistics</Text>

          {/* Date and Time */}
          <View style={styles.dateTimeRow}>
            <View style={styles.dateTimeColumn}>
              <Text style={{    fontSize: 16,
    fontWeight: '300',
    color: '#000',
    marginBottom: 3}}>Date</Text>
              <TouchableOpacity
                style={styles.dateTimeInput}
                onPress={openDatePicker}
              >
                <Text style={[styles.dateTimeText, !date && styles.placeholderText]}>
                  {formatDate(date)}
                </Text>
                <Ionicons name="calendar-outline" size={20} color="#666" />
              </TouchableOpacity>
            </View>
            <View style={styles.dateTimeColumn}>
              <Text style={{fontSize: 16,
    fontWeight: '300',
    color: '#000',
    marginBottom: 3}}>Time</Text>
              <TouchableOpacity
                style={styles.dateTimeInput}
                onPress={openTimePicker}
              >
                <Text style={styles.dateTimeText}>{time}</Text>
                <Ionicons name="time-outline" size={20} color="#666" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Location */}
          <Text style={styles.inputLabel}>Location</Text>
          <View style={styles.locationInputContainer}>
            <View style={styles.locationInput}>
              <Ionicons name="location-outline" size={20} color="#666" style={styles.locationIcon} />
              <TextInput
                style={styles.locationTextInput}
                placeholder="Search for courts or parks"
                placeholderTextColor="#999"
                value={location}
                onChangeText={handleLocationChange}
                onFocus={handleLocationFocus}
              />
            </View>
            {showLocationSuggestions && (
              <View style={styles.locationSuggestionsContainer}>
                {locationSuggestions.map((suggestion) => (
                  <TouchableOpacity
                    key={suggestion.id}
                    style={[
                      styles.locationSuggestionItem,
                      selectedLocation === suggestion.name && styles.locationSuggestionItemActive,
                    ]}
                    onPress={() =>
                      handleLocationSelect(suggestion.name, {
                        lat: suggestion.lat,
                        lng: suggestion.lng,
                      })
                    }
                  >
                    <Ionicons
                      name="location"
                      size={20}
                      color={selectedLocation === suggestion.name ? '#19E675' : '#666'}
                    />
                    <View style={styles.locationSuggestionTextWrap}>
                      <Text
                        style={[
                          styles.locationSuggestionText,
                          selectedLocation === suggestion.name && styles.locationSuggestionTextActive,
                        ]}
                      >
                        {suggestion.name}
                      </Text>
                      {suggestion.distanceLabel ? (
                        <Text style={styles.locationSuggestionDistance}>
                          {suggestion.distanceLabel} away
                        </Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                ))}
              <TouchableOpacity
                style={styles.locationSuggestionItem}
                onPress={handleUseCurrentLocation}
                disabled={loadingCourts}
              >
                <Ionicons name="navigate" size={20} color="#19E675" />
                <Text style={styles.locationSuggestionText}>
                  {loadingCourts ? 'Finding courts near you…' : 'Use My Current Location'}
                </Text>
              </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Court Type */}
          <Text style={styles.inputLabel}>Access</Text>
          <View style={styles.courtTypeContainer}>
            {(['Public', 'Private/Club', 'Condo'] as CourtType[]).map((type) => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.courtTypeButton,
                  courtType === type && styles.courtTypeButtonActive,
                ]}
                onPress={() => setCourtType(type)}
              >
                {courtType === type && (
                  <Ionicons name="checkmark" size={16} color="#19E675" style={styles.checkIcon} />
                )}
                <Text
                  style={[
                    styles.courtTypeText,
                    courtType === type && styles.courtTypeTextActive,
                  ]}
                >
                  {type}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Booking Status */}
          <View style={styles.bookingStatusContainer}>
            <TouchableOpacity
              style={styles.checkboxContainer}
              onPress={() => setIsBooked(!isBooked)}
            >
              <View style={[styles.checkbox, isBooked && styles.checkboxChecked]}>
                {isBooked && <Ionicons name="checkmark" size={16} color="#19E675" />}
              </View>
              <Text style={styles.checkboxLabel}>I have booked this court</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.infoIcon} onPress={() => setShowBookingInfoModal(true)}>
              <Ionicons name="information-circle-outline" size={18} color="#666" />
            </TouchableOpacity>
          </View>
        </View>

        {/* The Requirements Section */}
        <View style={styles.section}>
        <Text style={{fontSize: 23, fontWeight: '800', color: '#000', marginBottom: 10, marginTop: 40,}}>The Requirements</Text>

          {/* Number of Players */}
          {gameType === 'Group' && (
          <View style={styles.numberSelectorContainer}>
            <Text style={styles.numberSelectorLabel}>Number of players</Text>
            <View style={styles.numberSelector}>
              <TouchableOpacity
                style={styles.numberButton}
                onPress={() => setNumberOfPlayers(Math.max(3, numberOfPlayers - 1))}
              >
                <Text style={styles.numberButtonText}>-</Text>
              </TouchableOpacity>
              <Text style={styles.numberValue}>{numberOfPlayers}</Text>
              <TouchableOpacity
                style={styles.numberButton}
                onPress={() => setNumberOfPlayers(numberOfPlayers + 1)}
              >
                <Text style={styles.numberButtonText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
          )}


        {/* Game Description */}
        <View style={styles.section}>
          <Text style={styles.inputLabel}>Game Description</Text>
          <TextInput
            style={styles.descriptionInput}
            placeholder="Write a description for your game..."
            placeholderTextColor="#999"
            value={gameDescription}
            onChangeText={setGameDescription}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

          {/* Payment */}
          <TouchableOpacity
            style={styles.checkboxContainer}
            onPress={() => setIsPaid(!isPaid)}
          >
            <View style={[styles.checkbox, isPaid && styles.checkboxChecked]}>
              {isPaid && <Ionicons name="checkmark" size={16} color="#19E675" />}
            </View>
            <Text style={styles.checkboxLabel}>Paid</Text>
          </TouchableOpacity>

          {isPaid && (
            <View style={styles.paymentInputContainer}>
              <View style={styles.paymentInputWrapper}>
                <Text style={styles.dollarSign}>$</Text>
                <TextInput
                  style={styles.paymentInput}
                  placeholder="0.00"
                  keyboardType="numeric"
                  inputMode="decimal" 
                  placeholderTextColor="#999"
                  value={paymentAmount}
                  onChangeText={(text) => {
                    let cleaned = text.replace(/[^0-9.]/g, '');
                  
                    // only one decimal point
                    const parts = cleaned.split('.');
                    if (parts.length > 2) return;
                  
                    // limit to 2 decimal places
                    if (parts[1]?.length > 2) return;
                  
                    setPaymentAmount(cleaned);
                  }}
                />
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Create Game Button */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 10 }]}>
        <TouchableOpacity style={styles.createButton} onPress={handleCreateGame}>
          <Text style={styles.createButtonText}>Create Game</Text>
        </TouchableOpacity>
      </View>

      {/* Date/Time Picker Modal */}
      <Modal
        visible={showPickerModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPickerModal(false)}
      >
        <View style={styles.pickerModalOverlay}>
          <View style={[styles.pickerModalContent, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.pickerModalHeader}>
              <TouchableOpacity onPress={() => setShowPickerModal(false)}>
                <Text style={styles.pickerModalCancelButton}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.pickerModalTitle}>
                {datePickerMode === 'date' ? 'Select Date' : 'Select Time'}
              </Text>
              <TouchableOpacity onPress={confirmDateSelection}>
                <Text style={styles.pickerModalConfirmButton}>Done</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.dateTimePickerContainer}>
              <DateTimePicker
                value={tempDate}
                mode={datePickerMode}
                display="spinner"
                onChange={datePickerMode === 'date' ? handleDateSelect : handleTimeSelect}
                minimumDate={datePickerMode === 'date' ? new Date() : undefined}
                textColor="#000"
                themeVariant="light"
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Booking Info Modal */}
      <Modal
        visible={showBookingInfoModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowBookingInfoModal(false)}
      >
        <View style={styles.bookingInfoModalOverlay}>
          <View style={[styles.bookingInfoModalContent, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.bookingInfoModalHeader}>
              <Text style={styles.bookingInfoModalTitle}>
                {`What does "I have booked this court" mean?`}
              </Text>
              <TouchableOpacity onPress={() => setShowBookingInfoModal(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            <View style={styles.bookingInfoModalBody}>
              <Text style={styles.bookingInfoModalText}>
                {`When you check "I have booked this court," you're letting other players know that:`}
              </Text>
              <View style={styles.bookingInfoList}>
                <View style={styles.bookingInfoItem}>
                  <Ionicons name="checkmark-circle" size={20} color="#19E675" style={styles.bookingInfoIcon} />
                  <Text style={styles.bookingInfoItemText}>The court is reserved for your game time</Text>
                </View>
                <View style={styles.bookingInfoItem}>
                  <Ionicons name="checkmark-circle" size={20} color="#19E675" style={styles.bookingInfoIcon} />
                  <Text style={styles.bookingInfoItemText}>Other players can join with confidence</Text>
                </View>
                <View style={styles.bookingInfoItem}>
                  <Ionicons name="checkmark-circle" size={20} color="#19E675" style={styles.bookingInfoIcon} />
                  <Text style={styles.bookingInfoItemText}>No one else will book the same time slot</Text>
                </View>
              </View>
              <Text style={styles.bookingInfoNote}>
                {`Only check this if you've actually made a reservation through the court's booking system or by phone.`}
              </Text>
            </View>
            <View style={styles.bookingInfoModalActions}>
              <TouchableOpacity 
                style={styles.bookingInfoCancelButton}
                onPress={() => {setShowBookingInfoModal(false); setIsBooked(false);}}
              >
                <Text style={styles.bookingInfoCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.bookingInfoConfirmButton}
                onPress={() => {
                  setIsBooked(true);
                  setShowBookingInfoModal(false);
                }}
              >
                <Text style={styles.bookingInfoConfirmText}>{`Yes, I've booked it`}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  placeholder: {
    width: 32,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    gap: 24,
  },
  section: {
    gap: 16,
  },
  sectionTitle: {
    fontSize: 23,
    fontWeight: '800',
    color: '#000',
    marginBottom: 4,
  },
  gameTypeContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  gameTypeButton: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#000',
  },
  gameTypeButtonActive: {
    backgroundColor: '#19E675',
    borderColor: '#797979',
    borderWidth: 2
  },
  gameTypeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  gameTypeTextActive: {
    color: '#000',
    fontWeight: '700',
  },
  skillLevelContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  skillLevelButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 6,
    minHeight: 40,
  },
  skillLevelButtonActive: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#19E675',
  },
  skillLevelText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    flexShrink: 1,
  },
  skillLevelTextActive: {
    color: '#19E675',
    fontWeight: '700',
  },
  checkIcon: {
    marginRight: -4,
  },
  joinSettingsContainer: {
    flexDirection: 'row',
    gap: 24,
    justifyContent: 'center',
    marginTop: 12,
  },
  joinSettingButton: {
    position: 'relative',
  },
  joinSettingText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  joinSettingTextActive: {
    color: '#000',
    fontWeight: '700',
  },
  underline: {
    position: 'absolute',
    bottom: -4,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: '#19E675',
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '300',
    color: '#000',
    marginBottom: -9
  },
  visibilityLable: {
    fontSize: 16,
    fontWeight: '300',
    color: '#000',
    marginTop: 12,
    marginBottom: -10
  },
  levelLable: {
    fontSize: 16,
    fontWeight: '300',
    color: '#000',
    marginTop: 12,
    marginBottom: -10
  },
  dateTimeRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  dateTimeColumn: {
    flex: 1,
  },
  dateTimeInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 16,
  },
  dateTimeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  placeholderText: {
    color: '#999',
    fontWeight: '400',
  },
  locationInputContainer: {
    position: 'relative',
    marginBottom: 12,
  },
  locationInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  locationIcon: {
    marginRight: 12,
  },
  locationTextInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  locationSuggestionsContainer: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    zIndex: 1000,
    maxHeight: 200,
  },
  locationSuggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  locationSuggestionTextWrap: {
    flex: 1,
  },
  locationSuggestionDistance: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  locationSuggestionItemActive: {
    backgroundColor: '#19E675',
  },
  locationSuggestionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  locationSuggestionTextActive: {
    color: '#FFFFFF',
  },
  courtTypeContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  courtTypeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 6,
  },
  courtTypeButtonActive: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#19E675',
  },
  courtTypeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  courtTypeTextActive: {
    color: '#19E675',
    fontWeight: '700',
  },
  bookingStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#FFFFFF',
    borderColor: '#19E675',
  },
  infoIcon: {
    marginTop: 10,
    marginLeft: 100,
  },
  checkboxLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  numberSelectorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  numberSelectorLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  numberSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  numberButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberButtonText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
  },
  numberValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    minWidth: 30,
    textAlign: 'center',
  },
  descriptionInput: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#000',
    minHeight: 100,
    marginBottom: 12,
    textAlignVertical: 'top',
  },
  paymentInputContainer: {
    marginTop: 12,
  },
  paymentInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  
  dollarSign: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginRight: 6,
  },
  paymentInput: {
    flex: 1,
    paddingVertical: 16,
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
  },
  createButton: {
    backgroundColor: '#19E675',
    borderRadius: 24,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createButtonText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  dateTimePicker: {
    flex: 1,
  },
  dateTimePickerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 200,
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  pickerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    width: '90%',
    maxWidth: 400,
    height: 250,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 20,
  },
  pickerModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  pickerModalCancelButton: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
  },
  pickerModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  pickerModalConfirmButton: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
  },
  bookingInfoModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bookingInfoModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    width: '90%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 20,
  },
  bookingInfoModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  bookingInfoModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    flex: 1,
    marginRight: 10,
  },
  bookingInfoModalBody: {
    padding: 20,
  },
  bookingInfoModalText: {
    fontSize: 16,
    color: '#333',
    marginBottom: 16,
    lineHeight: 22,
  },
  bookingInfoList: {
    gap: 12,
    marginBottom: 20,
  },
  bookingInfoItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  bookingInfoIcon: {
    marginTop: 2,
  },
  bookingInfoItemText: {
    fontSize: 15,
    color: '#333',
    flex: 1,
    lineHeight: 20,
  },
  bookingInfoNote: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
    marginTop: 16,
    padding: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#FCD34D',
  },
  bookingInfoModalActions: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  bookingInfoCancelButton: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  bookingInfoCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  bookingInfoConfirmButton: {
    flex: 2,
    backgroundColor: '#19E675',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  bookingInfoConfirmText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});