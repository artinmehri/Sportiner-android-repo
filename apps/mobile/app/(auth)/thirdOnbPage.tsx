import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
<<<<<<< HEAD:apps/mobile/app/(auth)/thirdOnbPage.tsx
import { SignupInterface } from '../../context/SignupInterface.type';
=======
import { useOnboarding } from '@/context/OnboardingContext';
>>>>>>> 9b8c7f1e84da425159ef2248069f713aa8930bd6:apps/mobile/app/(tabs)/thirdOnbPage.tsx

type TimeSlot = 'morning' | 'afternoon' | 'evening';
type DaySchedule = {
  [key in TimeSlot]: boolean;
};

const daysOfWeek = [
  'Monday',
  'Tuesday', 
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday'
] as const;

const dayLabels = {
  'Monday': 'Mon',
  'Tuesday': 'Tue',
  'Wednesday': 'Wed',
  'Thursday': 'Thu',
  'Friday': 'Fri',
  'Saturday': 'Sat',
  'Sunday': 'Sun'
};

const timeSlots: TimeSlot[] = ['morning', 'afternoon', 'evening'];


const timeSlotLabels: Record<TimeSlot, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon', 
  evening: 'Evening'
};



export default function ThirdOnbPage({onNext, changeData, onBack}: SignupInterface) {
  const router = useRouter();
<<<<<<< HEAD:apps/mobile/app/(auth)/thirdOnbPage.tsx
  type Day = typeof daysOfWeek[number];
  type WeekSchedule = Record<Day, DaySchedule>;

  const [trackSchedule, setTrackSchedule] = useState(false)
=======
  const { setSchedule: setOnboardingSchedule } = useOnboarding();
  
>>>>>>> 9b8c7f1e84da425159ef2248069f713aa8930bd6:apps/mobile/app/(tabs)/thirdOnbPage.tsx
  const [schedule, setSchedule] = useState<WeekSchedule>(() => {
    return daysOfWeek.reduce((acc, day) => {
      acc[day] = {
        morning: false,
        afternoon: false,
        evening: false,
      };
      return acc;
    }, {} as WeekSchedule);
  });
  const handleContinue = () => {
<<<<<<< HEAD:apps/mobile/app/(auth)/thirdOnbPage.tsx

    if (!trackSchedule) {
      Alert.alert("Indicate your availability!")
      return
    }

    changeData((prev: any) => ({
      ...prev, 
      availability: schedule
    }))

    console.log('Selected schedule:', schedule);
    onNext();
    console.log('data sent to signup flow')
=======
    setOnboardingSchedule(schedule);
    router.push('/fourthOnbPage'); 
>>>>>>> 9b8c7f1e84da425159ef2248069f713aa8930bd6:apps/mobile/app/(tabs)/thirdOnbPage.tsx
  };

  const toggleTimeSlot = (day: Day, timeSlot: TimeSlot) => {
    setTrackSchedule(true)
        setSchedule(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        [timeSlot]: !prev[day][timeSlot]
      }
    }));
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <View style={styles.progressDots}>
          <View style={[styles.dot, styles.activeDot]} />
          <View style={[styles.dot, styles.activeDot]} />
          <View style={[styles.dot, styles.activeDot]} />
        </View>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.titleSection}>
          <Text style={styles.title}>When are you usually to play?</Text>
          <Text style={styles.subtitle}>
            Select all times that work for you. We{"'"}ll notify you when games match
          </Text>
        </View>

        <View style={styles.scheduleContainer}>
          {daysOfWeek.map((day) => (
            <View key={day} style={styles.dayRow}>
              <View style={styles.dayLabel}>
                <Text style={styles.dayText}>{dayLabels[day as keyof typeof dayLabels]}</Text>
              </View>
              <View style={styles.timeSlotsContainer}>
                {timeSlots.map((timeSlot) => (
                  <TouchableOpacity
                    key={timeSlot}
                    style={[
                      styles.timeSlotButton,
                      schedule[day]?.[timeSlot] && styles.timeSlotButtonSelected
                    ]}
                    onPress={() => toggleTimeSlot(day, timeSlot)}
                  >
                    <Text style={[
                      styles.timeSlotText,
                      schedule[day]?.[timeSlot] && styles.timeSlotTextSelected
                    ]}>
                      {timeSlotLabels[timeSlot]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

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
  backButton: {
    padding: 5,
  },
  progressDots: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E5E5E5',
  },
  activeDot: {
    backgroundColor: '#19E675',
  },
  placeholder: {
    width: 34,
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
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  scheduleContainer: {
    marginBottom: 40,
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  dayLabel: {
    width: 60,
    alignItems: 'flex-start',
  },
  dayText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  timeSlotsContainer: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
  },
  timeSlotButton: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#000000',
  },
  timeSlotButtonSelected: {
    backgroundColor: '#19E675',
    borderColor: '#19E675',
  },
  timeSlotText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  timeSlotTextSelected: {
    color: '#002000',
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
