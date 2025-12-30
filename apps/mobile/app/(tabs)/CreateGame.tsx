import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

type GameType = '1v1' | 'Group';
type SkillLevel = 'Beginner' | 'Intermediate' | 'Advanced';
type JoinSetting = 'Anyone can join' | 'Ask to join';
type CourtType = 'Public' | 'Private/Club' | 'Condo';

export default function CreateGame() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [gameType, setGameType] = useState<GameType>('1v1');
  const [skillLevel, setSkillLevel] = useState<SkillLevel>('Beginner');
  const [joinSetting, setJoinSetting] = useState<JoinSetting>('Anyone can join');

  const [date, setDate] = useState<string>('');
  const [time, setTime] = useState<string>('07:00');
  const [timeHour, setTimeHour] = useState<number>(7);
  const [timeMinute, setTimeMinute] = useState<number>(0);
  const [timePeriod, setTimePeriod] = useState<'AM' | 'PM'>('AM');
  const [location, setLocation] = useState<string>('');
  const [showLocationSuggestions, setShowLocationSuggestions] = useState<boolean>(false);
  const [selectedLocation, setSelectedLocation] = useState<string>('');
  const [courtType, setCourtType] = useState<CourtType>('Public');
  const [isBooked, setIsBooked] = useState<boolean>(false);

  const [numberOfPlayers, setNumberOfPlayers] = useState<number>(3);
  const [isPaid, setIsPaid] = useState<boolean>(true);
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [gameDescription, setGameDescription] = useState<string>('');


  const [showDatePicker, setShowDatePicker] = useState<boolean>(false);
  const [showTimePicker, setShowTimePicker] = useState<boolean>(false);
  

  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);


  useEffect(() => {
    if (date) {
      const dateObj = new Date(date);
      if (dateObj.getMonth() === currentMonth.getMonth() && dateObj.getFullYear() === currentMonth.getFullYear()) {
        setSelectedDay(dateObj.getDate());
      }
    }
  }, [date, currentMonth]);


  const locationSuggestions = [
    { id: '1', name: 'Cedarvale Park' },
    { id: '2', name: 'Goulding park' },
    { id: '3', name: 'Ramsdey park' },
  ];

  const formatDate = (dateString: string) => {
    if (!dateString) return 'MM/DD/YYYY';
    const date = new Date(dateString);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
  };

  const formatMonthYear = (date: Date) => {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return `${months[date.getMonth()]} ${date.getFullYear()}`;
  };

  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const handleDateSelect = (day: number) => {
    const selectedDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    setDate(selectedDate.toISOString());
    setSelectedDay(day);
    setShowDatePicker(false);
  };

  const handleTimeConfirm = () => {
    const hour24 = timePeriod === 'PM' && timeHour !== 12 ? timeHour + 12 : timePeriod === 'AM' && timeHour === 12 ? 0 : timeHour;
    const formattedTime = `${String(hour24).padStart(2, '0')}:${String(timeMinute).padStart(2, '0')}`;
    setTime(formattedTime);
    setShowTimePicker(false);
  };

  const handleLocationSelect = (locationName: string) => {
    setLocation(locationName);
    setSelectedLocation(locationName);
    setShowLocationSuggestions(false);
  };

  const handleLocationFocus = () => {
    setShowLocationSuggestions(true);
  };

  const handleLocationChange = (text: string) => {
    setLocation(text);
    setShowLocationSuggestions(text.length > 0 || true);
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentMonth(prev => {
      const newDate = new Date(prev);
      if (direction === 'prev') {
        newDate.setMonth(prev.getMonth() - 1);
      } else {
        newDate.setMonth(prev.getMonth() + 1);
      }
      return newDate;
    });
  };

  const handleCreateGame = () => {
    // Handle game creation logic here
    console.log('Creating game with:', {
      gameType,
      skillLevel,
      joinSetting,
      date,
      time,
      location,
      courtType,
      isBooked,
      numberOfPlayers,
      gameDescription,
      isPaid,
      paymentAmount,
    });

    router.back();
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

          {/* Game Type */}
          <View style={styles.gameTypeContainer}>
            <TouchableOpacity
              style={[styles.gameTypeButton, gameType === '1v1' && styles.gameTypeButtonActive]}
              onPress={() => setGameType('1v1')}
            >
              <Ionicons
                name="person"
                size={24}
                color={gameType === '1v1' ? '#FFFFFF' : '#666'}
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
              onPress={() => setGameType('Group')}
            >
              <Ionicons
                name="people"
                size={24}
                color={gameType === 'Group' ? '#FFFFFF' : '#666'}
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
          <View style={styles.joinSettingsContainer}>
            <TouchableOpacity
              style={styles.joinSettingButton}
              onPress={() => setJoinSetting('Anyone can join')}
            >
              <Text
                style={[
                  styles.joinSettingText,
                  joinSetting === 'Anyone can join' && styles.joinSettingTextActive,
                ]}
              >
                Anyone can join
              </Text>
              {joinSetting === 'Anyone can join' && (
                <View style={styles.underline} />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.joinSettingButton}
              onPress={() => setJoinSetting('Ask to join')}
            >
              <Text
                style={[
                  styles.joinSettingText,
                  joinSetting === 'Ask to join' && styles.joinSettingTextActive,
                ]}
              >
                Ask to join
              </Text>
              {joinSetting === 'Ask to join' && (
                <View style={styles.underline} />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* The Logistics Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>The Logistics</Text>

          {/* Date and Time */}
          <View style={styles.dateTimeRow}>
            <View style={styles.dateTimeColumn}>
              <Text style={styles.inputLabel}>Date</Text>
              <TouchableOpacity
                style={styles.dateTimeInput}
                onPress={() => {
                  if (date) {
                    const dateObj = new Date(date);
                    setCurrentMonth(dateObj);
                    setSelectedDay(dateObj.getDate());
                  }
                  setShowDatePicker(true);
                }}
              >
                <Text style={[styles.dateTimeText, !date && styles.placeholderText]}>
                  {formatDate(date)}
                </Text>
                <Ionicons name="calendar-outline" size={20} color="#666" />
              </TouchableOpacity>
            </View>
            <View style={styles.dateTimeColumn}>
              <Text style={styles.inputLabel}>Time</Text>
              <TouchableOpacity
                style={styles.dateTimeInput}
                onPress={() => setShowTimePicker(true)}
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
                    onPress={() => handleLocationSelect(suggestion.name)}
                  >
                    <Ionicons
                      name="location"
                      size={20}
                      color={selectedLocation === suggestion.name ? '#19E675' : '#19E675'}
                    />
                    <Text
                      style={[
                        styles.locationSuggestionText,
                        selectedLocation === suggestion.name && styles.locationSuggestionTextActive,
                      ]}
                    >
                      {suggestion.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              <TouchableOpacity
                style={styles.locationSuggestionItem}
                onPress={() => {
                  handleLocationSelect('Use My Current Location');
                }}
              >
                <Ionicons name="star" size={20} color="#19E675" />
                <Text style={styles.locationSuggestionText}>Use My Current Location</Text>
              </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Court Type */}
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
          <TouchableOpacity
            style={styles.checkboxContainer}
            onPress={() => setIsBooked(!isBooked)}
          >
            <View style={[styles.checkbox, isBooked && styles.checkboxChecked]}>
              {isBooked && <Ionicons name="checkmark" size={16} color="#19E675" />}
            </View>
            <Text style={styles.checkboxLabel}>I have booked this court</Text>
            <Ionicons name="information-circle-outline" size={18} color="#666" />
          </TouchableOpacity>
        </View>

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

        {/* The Requirements Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>The Requirements</Text>

          {/* Number of Players */}
          <View style={styles.numberSelectorContainer}>
            <Text style={styles.numberSelectorLabel}>Number of players</Text>
            <View style={styles.numberSelector}>
              <TouchableOpacity
                style={styles.numberButton}
                onPress={() => setNumberOfPlayers(Math.max(1, numberOfPlayers - 1))}
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
              <TextInput
                style={styles.paymentInput}
                placeholder="Dollars"
                placeholderTextColor="#999"
                value={paymentAmount}
                onChangeText={setPaymentAmount}
                keyboardType="numeric"
              />
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

      {/* Date Picker Modal */}
      <Modal
        visible={showDatePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDatePicker(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowDatePicker(false)}
        >
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
            <View style={[styles.modalContent, { paddingBottom: insets.bottom + 20 }]}>
              <View style={styles.calendarHeader}>
                <TouchableOpacity onPress={() => navigateMonth('prev')}>
                  <Ionicons name="chevron-back" size={24} color="#000" />
                </TouchableOpacity>
                <Text style={styles.calendarMonthYear}>{formatMonthYear(currentMonth)}</Text>
                <TouchableOpacity onPress={() => navigateMonth('next')}>
                  <Ionicons name="chevron-forward" size={24} color="#000" />
                </TouchableOpacity>
              </View>
              <View style={styles.calendarContainer}>
                <View style={styles.calendarWeekDays}>
                  {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map((day) => (
                    <Text key={day} style={styles.calendarWeekDay}>
                      {day}
                    </Text>
                  ))}
                </View>
                <View style={styles.calendarGrid}>
                  {Array.from({ length: getFirstDayOfMonth(currentMonth) }).map((_, index) => (
                    <View key={`empty-${index}`} style={styles.calendarDay} />
                  ))}
                  {Array.from({ length: getDaysInMonth(currentMonth) }).map((_, index) => {
                    const day = index + 1;
                    const isSelected = selectedDay === day;
                    return (
                      <TouchableOpacity
                        key={day}
                        style={[styles.calendarDay, isSelected && styles.calendarDaySelected]}
                        onPress={() => handleDateSelect(day)}
                      >
                        <Text
                          style={[
                            styles.calendarDayText,
                            isSelected && styles.calendarDayTextSelected,
                          ]}
                        >
                          {day}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Time Picker Modal */}
      <Modal
        visible={showTimePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTimePicker(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowTimePicker(false)}
        >
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
            <View style={[styles.modalContent, { paddingBottom: insets.bottom + 20 }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Time</Text>
                <TouchableOpacity onPress={() => setShowTimePicker(false)}>
                  <Ionicons name="close" size={24} color="#000" />
                </TouchableOpacity>
              </View>
              <View style={styles.timePickerWheelContainer}>
                <View style={styles.timePickerWheel}>
                  <ScrollView
                    style={styles.wheelScroll}
                    contentContainerStyle={styles.wheelContent}
                    showsVerticalScrollIndicator={false}
                    snapToInterval={50}
                    decelerationRate="fast"
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((hour) => (
                      <TouchableOpacity
                        key={hour}
                        style={[
                          styles.wheelItem,
                          timeHour === hour && styles.wheelItemSelected,
                        ]}
                        onPress={() => setTimeHour(hour)}
                      >
                        <Text
                          style={[
                            styles.wheelItemText,
                            timeHour === hour && styles.wheelItemTextSelected,
                          ]}
                        >
                          {hour}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
                <View style={styles.timePickerWheel}>
                  <ScrollView
                    style={styles.wheelScroll}
                    contentContainerStyle={styles.wheelContent}
                    showsVerticalScrollIndicator={false}
                    snapToInterval={50}
                    decelerationRate="fast"
                  >
                    {Array.from({ length: 60 }, (_, i) => i).map((minute) => (
                      <TouchableOpacity
                        key={minute}
                        style={[
                          styles.wheelItem,
                          timeMinute === minute && styles.wheelItemSelected,
                        ]}
                        onPress={() => setTimeMinute(minute)}
                      >
                        <Text
                          style={[
                            styles.wheelItemText,
                            timeMinute === minute && styles.wheelItemTextSelected,
                          ]}
                        >
                          {String(minute).padStart(2, '0')}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
                <View style={styles.timePickerWheel}>
                  <ScrollView
                    style={styles.wheelScroll}
                    contentContainerStyle={styles.wheelContent}
                    showsVerticalScrollIndicator={false}
                    snapToInterval={50}
                    decelerationRate="fast"
                  >
                    {['AM', 'PM'].map((period) => (
                      <TouchableOpacity
                        key={period}
                        style={[
                          styles.wheelItem,
                          timePeriod === period && styles.wheelItemSelected,
                        ]}
                        onPress={() => setTimePeriod(period as 'AM' | 'PM')}
                      >
                        <Text
                          style={[
                            styles.wheelItemText,
                            timePeriod === period && styles.wheelItemTextSelected,
                          ]}
                        >
                          {period}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              </View>
              <TouchableOpacity style={styles.timeConfirmButton} onPress={handleTimeConfirm}>
                <Text style={styles.timeConfirmButtonText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
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
    fontSize: 20,
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
    borderColor: '#19E675',
  },
  gameTypeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  gameTypeTextActive: {
    color: '#FFFFFF',
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
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
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
  checkboxLabel: {
    flex: 1,
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
  paymentInput: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 16,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 15,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  modalText: {
    fontSize: 16,
    color: '#666',
    padding: 16,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  calendarMonthYear: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  calendarContainer: {
    padding: 16,
  },
  calendarWeekDays: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 12,
  },
  calendarWeekDay: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    width: 40,
    textAlign: 'center',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  calendarDay: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 2,
  },
  calendarDaySelected: {
    backgroundColor: '#4A90E2',
    borderRadius: 20,
  },
  calendarDayText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  calendarDayTextSelected: {
    color: '#FFFFFF',
  },
  timePickerWheelContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 20,
    height: 200,
  },
  timePickerWheel: {
    flex: 1,
    maxWidth: 100,
    marginHorizontal: 8,
  },
  wheelScroll: {
    flex: 1,
  },
  wheelContent: {
    paddingVertical: 75,
  },
  wheelItem: {
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  wheelItemSelected: {
    backgroundColor: '#E5E7EB',
    borderRadius: 8,
  },
  wheelItemText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
  },
  wheelItemTextSelected: {
    color: '#000',
    fontWeight: '700',
  },
  timeConfirmButton: {
    backgroundColor: '#19E675',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    margin: 16,
  },
  timeConfirmButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalButton: {
    backgroundColor: '#19E675',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#005124',
  },
});

