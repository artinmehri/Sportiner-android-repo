import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { addGame, getDistanceKm } from '@/context/GameContext';
import DateTimePicker from '@react-native-community/datetimepicker';
import { createChat } from '@/context/ChatContext';
import { getCurrentUser, getCurrentUserId } from '@/context/AuthContext';
import {
  findCourtByName,
  getDefaultCourts,
  sortCourtsByProximity,
  type GeoCoords,
  type CourtSuggestion,
} from '@/lib/courtSuggestions';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { saveLatestLocationPosition } from '@/lib/latestLocation';
import { combineLocalDateAndTime } from '@/lib/gameTime';
import {
  getCreateGameFormError,
  type CreateGameFormError,
  type CreateGameFormField,
} from '@/lib/createGameForm';
import {
  isUgcTextRejectedError,
  UGC_TEXT_REJECTED_COPY,
} from '@/lib/ugcModeration';

type CourtSuggestionWithDistance = CourtSuggestion & {
  distanceKm?: number;
  distanceLabel?: string;
};

type GameType = '1v1' | 'Group';
type SkillLevel = 'Beginner' | 'Intermediate' | 'Advanced';
type CourtType = 'Public' | 'Club' | 'Condo';

type AvailabilitySlot = 'morning' | 'afternoon' | 'evening';
type DayAvailability = Partial<Record<AvailabilitySlot, boolean>>;
type WeekAvailability = Record<string, DayAvailability>;

const AVAILABILITY_TIMES: Record<AvailabilitySlot, string> = {
  morning: '09:00',
  afternoon: '14:00',
  evening: '18:00',
};

const WEEKDAY_KEYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

function parseSkillLevel(value: unknown): SkillLevel | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'beginner') return 'Beginner';
  if (normalized === 'intermediate') return 'Intermediate';
  if (normalized === 'advanced' || normalized === 'pro') return 'Advanced';
  if (value === 'Beginner' || value === 'Intermediate' || value === 'Advanced') {
    return value;
  }
  return null;
}

function parseAvailability(raw: unknown): WeekAvailability | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as WeekAvailability;
  } catch {
    return null;
  }
}

function firstOpenSlot(day: DayAvailability | undefined): AvailabilitySlot | null {
  if (!day) return null;
  if (day.morning) return 'morning';
  if (day.afternoon) return 'afternoon';
  if (day.evening) return 'evening';
  return null;
}

function suggestDateTimeFromAvailability(
  availability: WeekAvailability | null
): { dateIso: string; time: string } | null {
  if (!availability) return null;

  const now = new Date();
  for (let offset = 0; offset < 14; offset += 1) {
    const candidate = new Date(now);
    candidate.setHours(12, 0, 0, 0);
    candidate.setDate(now.getDate() + offset);

    const dayKey = WEEKDAY_KEYS[candidate.getDay()];
    const slot = firstOpenSlot(availability[dayKey]);
    if (!slot) continue;

    const time = AVAILABILITY_TIMES[slot];
    const [hours, minutes] = time.split(':').map((part) => Number(part));
    const slotDate = new Date(candidate);
    slotDate.setHours(hours, minutes, 0, 0);

    if (slotDate.getTime() <= Date.now()) {
      continue;
    }

    return {
      dateIso: candidate.toISOString(),
      time,
    };
  }

  return null;
}

export default function CreateGame() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    prefill?: string | string[];
    park?: string | string[];
    level?: string | string[];
    type?: string | string[];
    availability?: string | string[];
  }>();
  const paramValue = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;

  const shouldPrefill = paramValue(params.prefill) === '1';
  const prefillPark = paramValue(params.park)?.trim() || '';
  const prefillLevel = parseSkillLevel(paramValue(params.level));
  const prefillTypeRaw = paramValue(params.type);
  const prefillType: GameType | null =
    prefillTypeRaw === '1v1' || prefillTypeRaw === 'Group' ? prefillTypeRaw : null;
  const prefillAvailability = parseAvailability(paramValue(params.availability));

  const [type, setType] = useState<GameType>(prefillType ?? '1v1');
  const [level, setLevel] = useState<SkillLevel | null>(
    shouldPrefill ? prefillLevel : null
  );
  const [host_id, setHost_id] = useState<any>('')
  const [title, setTitle] = useState<string>('');
  const [date, setDate] = useState<string>('');
  const [time, setTime] = useState<string>('');
  const [fieldError, setFieldError] = useState<CreateGameFormError | null>(null);
  const [showLocationSuggestions, setShowLocationSuggestions] = useState<boolean>(false);
  const [selectedLocation, setSelectedLocation] = useState<string>('');
  const [court_type, setCourt_type] = useState<CourtType>('Public');
  const [is_booked, setIs_booked] = useState<boolean>(false);
  const [image, setImage] = useState('');
  const [game_capacity, setGame_capacity] = useState<number>(prefillType === 'Group' ? 4 : 2);
  const [is_paid, setIs_paid] = useState<boolean>(false);
  const [payment_amount, setPayment_amount] = useState<number>(0);
  const [description, setDescription] = useState<string>('');
  const [location_cords, setLocation_cords] = useState<string | null>(null);
  const [location_name, setLocation_name] = useState<string>('');
  const [nearbyOrigin, setNearbyOrigin] = useState<GeoCoords | null>(null);
  const [originReady, setOriginReady] = useState(false);
  const [hostName, setHostName] = useState('');
  const scrollViewRef = useRef<ScrollView>(null);
  const locationInputRef = useRef<TextInput>(null);
  const titleInputRef = useRef<TextInput>(null);
  const descriptionInputRef = useRef<TextInput>(null);
  const paymentInputRef = useRef<TextInput>(null);
  const fieldRefs = useRef<Partial<Record<CreateGameFormField, View | null>>>({});
  const scrollYRef = useRef(0);
  const didApplyPrefill = useRef(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const setSafeOrigin = (coords: GeoCoords) => {
    if (
      !coords ||
      !isFinite(coords.lat) ||
      !isFinite(coords.lng) ||
      Math.abs(coords.lat) > 90 ||
      Math.abs(coords.lng) > 180
    ) {
      console.log('Invalid origin rejected:', coords);
      return;
    }

    if (coords.lat === 0 && coords.lng === 0) {
      console.log('Invalid zero origin rejected:', coords);
      return;
    }

    setNearbyOrigin(coords);
    setOriginReady(true);
  };
  

  const imageRandomizer = () => {
    const items: string[] = [
      "https://images.unsplash.com/photo-1542144582-1ba00456b5e3?q=80&w=1078&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1499510318569-1a3d67dc3976?q=80&w=1064&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1548920168-70d61248a912?q=80&w=2070&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1530915534664-4ac6423816b7?q=80&w=2070&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1632755898125-36cd72575dde?q=80&w=987&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
      "https://images.unsplash.com/photo-1620742820748-87c09249a72a?q=80&w=927&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
      "https://images.unsplash.com/photo-1714840961579-6b072a12536e?w=1600&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MjR8fHRlbm5pc3xlbnwwfHwwfHx8Mg%3D%3D",
      "https://images.unsplash.com/photo-1448743133657-f67644da3008?w=1600&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MjV8fHRlbm5pc3xlbnwwfHwwfHx8Mg%3D%3D",
      "https://images.unsplash.com/photo-1547934045-2942d193cb49?q=80&w=2076&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
      "https://images.unsplash.com/photo-1580153111806-5007b971dfe7?q=80&w=1974&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
      "https://images.unsplash.com/photo-1599586120429-48281b6f0ece?q=80&w=2070&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
      "https://images.unsplash.com/photo-1651007852633-7d2b35950f70?q=80&w=1035&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
      "https://images.unsplash.com/photo-1551773188-0801da12ddae?q=80&w=987&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
      "https://images.unsplash.com/photo-1635873021329-c0af04695c9d?q=80&w=1036&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
      "https://images.unsplash.com/photo-1684443726782-1d5bb1aecbd5?q=80&w=988&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
      "https://images.unsplash.com/photo-1714508969012-7ac9c063b39a?q=80&w=1035&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
      "https://images.unsplash.com/photo-1723980839948-95ccbffd3cb4?q=80&w=1035&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
      "https://images.unsplash.com/photo-1636988742970-4c7d1e882024?q=80&w=1987&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
      "https://images.unsplash.com/photo-1591100464007-37ec1ccc6224?q=80&w=987&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
      "https://images.unsplash.com/photo-1639161775388-db5b5d5cc9eb?q=80&w=1905&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
      "https://images.unsplash.com/photo-1567220720374-a67f33b2a6b9?q=80&w=1932&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
      "https://images.unsplash.com/photo-1725784937873-7e4e8a80f145?q=80&w=1064&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
      "https://images.unsplash.com/photo-1723980839963-59b4a79f5b9a?q=80&w=1035&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
      "https://images.unsplash.com/photo-1595555785647-53441687d78a?q=80&w=924&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
    ];

    return items[Math.floor(Math.random() * items.length)];
  }

  const [datePickerMode, setDatePickerMode] = useState<'date' | 'time'>('date');
  const [tempDate, setTempDate] = useState<Date>(new Date());
  const [showPickerModal, setShowPickerModal] = useState<boolean>(false);
  const [showBookingInfoModal, setShowBookingInfoModal] = useState<boolean>(false);
  const [showPaidInfoModal, setShowPaidInfoModal] = useState<boolean>(false);


  
  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const userId = await getCurrentUserId()
        if (active && userId?.id) {
          setHost_id(userId.id)
        }

        const currentUser = await getCurrentUser();
        if (active && currentUser && currentUser.name) {
          setHostName(currentUser.name)
        }

        const { status } = await Location.getForegroundPermissionsAsync();

        if (status !== 'granted') {
          console.log('Location permission not granted; court suggestions remain manual');
          return;
        }

        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Highest,
        });

        if (!active || !position?.coords) return;

        const coords = {
          lat: Number(position.coords.latitude),
          lng: Number(position.coords.longitude),
        };

        // Validate coords before setting
        if (!isFinite(coords.lat) || !isFinite(coords.lng)) {
          console.log('Invalid coordinates from location service');
          return;
        }

        console.log('LOCKED USER ORIGIN:', coords);

        setSafeOrigin(coords);
        void saveLatestLocationPosition(position, 'create_game');
      } catch (e) {
        console.log('Location error', e);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const setFieldRef = (field: CreateGameFormField) => (node: View | null) => {
    fieldRefs.current[field] = node;
  };

  const clearFieldError = (field: CreateGameFormField) => {
    setFieldError((current) => (current?.field === field ? null : current));
  };

  const isFieldInvalid = (field: CreateGameFormField) => fieldError?.field === field;

  const errorText = (field: CreateGameFormField) =>
    fieldError && fieldError.field === field ? (
      <Text style={styles.fieldErrorText}>{fieldError.message}</Text>
    ) : null;

  const scrollToShow = (
    node: { measureInWindow: TextInput['measureInWindow'] } | null,
    pinToTop = false
  ) => {
    const scroll = scrollViewRef.current;
    if (!scroll || !node) return;

    node.measureInWindow((_x, y, _w, h) => {
      const keyboardHeight = Keyboard.metrics()?.height ?? 0;
      if (pinToTop) {
        const targetY = 132;
        const delta = y - targetY;
        if (Math.abs(delta) > 8) {
          scroll.scrollTo({ y: Math.max(0, scrollYRef.current + delta), animated: true });
        }
        return;
      }

      const visibleBottom = Dimensions.get('window').height - keyboardHeight - 88;
      const overflow = y + h + 16 - visibleBottom;
      if (overflow > 0) {
        scroll.scrollTo({ y: scrollYRef.current + overflow, animated: true });
      }
    });
  };

  const revealField = (field: CreateGameFormField) => {
    const node = fieldRefs.current[field];
    if (!node) return;
    requestAnimationFrame(() => scrollToShow(node, true));
    if (field === 'location') locationInputRef.current?.focus();
    if (field === 'title') titleInputRef.current?.focus();
    if (field === 'description') descriptionInputRef.current?.focus();
    if (field === 'payment') paymentInputRef.current?.focus();
  };

  const focusedInput = () =>
    [locationInputRef, titleInputRef, descriptionInputRef, paymentInputRef]
      .map((input) => input.current)
      .find((input) => input?.isFocused()) ?? null;

  useEffect(() => {
    const willShow = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setKeyboardVisible(true)
    );
    const didShow = Keyboard.addListener('keyboardDidShow', () => {
      scrollToShow(focusedInput());
    });
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardVisible(false)
    );
    return () => {
      willShow.remove();
      didShow.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    if (!shouldPrefill || didApplyPrefill.current) {
      return;
    }
    didApplyPrefill.current = true;

    if (prefillType) {
      setType(prefillType);
      setGame_capacity(prefillType === 'Group' ? 4 : 2);
    }

    if (prefillLevel) {
      setLevel(prefillLevel);
    }

    if (prefillPark) {
      const court = findCourtByName(prefillPark);
      setLocation_name(prefillPark);
      setSelectedLocation(prefillPark);
      if (court) {
        setLocation_cords(`POINT(${court.lng} ${court.lat})`);
      }
      setDescription(`Looking for a hit at ${prefillPark}. Come play!`);
    }

    const suggestion = suggestDateTimeFromAvailability(prefillAvailability);
    if (suggestion) {
      setDate(suggestion.dateIso);
      setTime(suggestion.time);
      setTempDate(new Date(suggestion.dateIso));
    }
  }, [
    shouldPrefill,
    prefillPark,
    prefillLevel,
    prefillType,
    prefillAvailability,
  ]);

  const locationSuggestions: CourtSuggestionWithDistance[] = useMemo(() => {
    const query = location_name.trim().toLowerCase();
    const courts = getDefaultCourts();

    const filtered = query.length
      ? courts.filter(c =>
          c.name.toLowerCase().includes(query)
        )
      : courts;

    const originSnapshot = nearbyOrigin;

    if (!originSnapshot) {
      return filtered.map(c => ({ ...c }));
    }

    return sortCourtsByProximity(filtered, originSnapshot)
    .slice(0, 20)
    .map((c) => {
      if (c.distanceKm != null) return c;
      const distKm = getDistanceKm(
        { lat: originSnapshot.lat, lng: originSnapshot.lng },
        { lat: c.lat, lng: c.lng }
      );
      return {
        ...c,
        distanceKm: distKm,
        distanceLabel: `${distKm.toFixed(1)} km`,
      };
    });
    }, [location_name, nearbyOrigin, originReady]);

  const selectGameType = (nextType: GameType) => {
    setType(nextType);
    if (nextType === '1v1') {
      setGame_capacity(2);
      clearFieldError('title');
    } else if (game_capacity < 3) {
      setGame_capacity(3);
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

  const confirmDateSelection = () => {
    if (datePickerMode === 'date') {
      setDate(tempDate.toISOString());
      clearFieldError('date');
    } else {
      const hours = String(tempDate.getHours()).padStart(2, '0');
      const minutes = String(tempDate.getMinutes()).padStart(2, '0');
      setTime(`${hours}:${minutes}`);
      clearFieldError('time');
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
    const [hours, minutes] = time.split(':').map((part) => Number(part));
    const currentTime = new Date();
    if (Number.isFinite(hours) && Number.isFinite(minutes)) {
      currentTime.setHours(hours, minutes, 0, 0);
    }
    setTempDate(currentTime);
    setShowPickerModal(true);
  };

  const handleLocationSelect = (courtName: string, coords?: GeoCoords) => {
    const court = findCourtByName(courtName);
    if (!court) return;
    setLocation_name(courtName);
    setSelectedLocation(courtName);
    setLocation_cords(
    `POINT(${court.lng} ${court.lat})`
    );
    setShowLocationSuggestions(false);
    clearFieldError('location');
  };

  const handleLocationFocus = () => {
    setShowLocationSuggestions(true);
  };

  const handleLocationChange = (text: string) => {
    setLocation_name(text);
    setSelectedLocation('');
    setLocation_cords(null);
    setShowLocationSuggestions(true);
    clearFieldError('location');
  };

  const handleCreateGame = async () => {
    Keyboard.dismiss();

    const court = findCourtByName(location_name);
    const splittingCost = court_type !== 'Public' && is_paid;
    const error = getCreateGameFormError({
      level: level ?? '',
      date,
      time,
      locationName: location_name,
      hasKnownLocation: Boolean(court),
      type,
      title,
      description,
      isPaid: splittingCost,
      paymentAmount: payment_amount,
    });

    if (error) {
      setFieldError(error);
      setTimeout(() => revealField(error.field), 50);
      return;
    }

    setFieldError(null);

    try {

    if (!host_id) {
      Alert.alert('Error', 'User authentication failed. Please log in again.');
      return;
    }

    const gameImage = imageRandomizer();
    const resolvedTitle =
      type === '1v1' ? `${hostName || 'Your'}'s Tennis Game` : title;

    if (type === '1v1') {
      setTitle(resolvedTitle);
    }

    const resolvedCapacity = type === '1v1' ? 2 : game_capacity;
    const players_enrolled = 1;
    const gameTime = combineLocalDateAndTime(date, time);

    if (!gameTime) {
      Alert.alert('Invalid date or time', 'Please select the game date and time again.');
      return;
    }

    const resolvedCoords = court
      ? `POINT(${court.lng} ${court.lat})`
      : location_cords;

    const game = await addGame(
      host_id,
      resolvedTitle,
      description.trim(),
      type,
      resolvedCoords,
      gameTime,
      location_name.trim(),
      level!,
      resolvedCapacity,
      is_booked,
      splittingCost ? payment_amount : 0,
      gameImage,
      court_type,
      splittingCost,
      players_enrolled);
      
    if (!game) {
      Alert.alert('Error', 'Game creation failed');
      return;
    }
    const chatType = type === '1v1' ? 'private' : 'group';
    const members = host_id ? [{ id: host_id, level: level! }] : [];
    await createChat(chatType, game.title, '', game.id, game.image, members);

    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    router.replace({
      pathname: '/(tabs)/GameConfirmation',
      params: {
        id: game.id,
        publicId: game.public_id ?? '',
        title: game.title ?? resolvedTitle,
        gameType: type,
        date: game.time ?? gameTime,
        location_name: game.location_name ?? location_name,
        level: game.level ?? level!,
        capacity: String(game.game_capacity ?? resolvedCapacity),
        players_enrolled: String(game.players_enrolled ?? players_enrolled),
      },
    });
    
    } catch (e: unknown) {
      if (isUgcTextRejectedError(e)) {
        Alert.alert(UGC_TEXT_REJECTED_COPY.title, UGC_TEXT_REJECTED_COPY.message);
        return;
      }
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

      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          onScroll={(event) => {
            scrollYRef.current = event.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
        >
        {/* The Core Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>The Core</Text>
          <Text style={styles.inputLabel}>Game type</Text>

          {/* Game Type */}
          <View style={styles.gameTypeContainer}>
            <TouchableOpacity
              style={[styles.gameTypeButton, type === '1v1' && styles.gameTypeButtonActive]}
              onPress={() => selectGameType('1v1')}
            >
              <Ionicons
                name="person"
                size={24}
                color={type === '1v1' ? '#000' : '#666'}
              />
              <Text
                style={[
                  styles.gameTypeText,
                  type === '1v1' && styles.gameTypeTextActive,
                ]}
              >
                1 VS 1
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.gameTypeButton, type === 'Group' && styles.gameTypeButtonActive]}
              onPress={() => selectGameType('Group')}
            >
              <Ionicons
                name="people"
                size={24}
                color={type === 'Group' ? '#000' : '#666'}
              />
              <Text
                style={[
                  styles.gameTypeText,
                  type === 'Group' && styles.gameTypeTextActive,
                ]}
              >
                Group Game
              </Text>
            </TouchableOpacity>
          </View>

          {/* Skill Level */}
          <View ref={setFieldRef('level')}>
            <Text style={styles.levelLable}>Skill level</Text>
            <View
              style={[
                styles.skillLevelContainer,
                isFieldInvalid('level') && styles.fieldInvalid,
              ]}
            >
              {(['Beginner', 'Intermediate', 'Advanced'] as SkillLevel[]).map((skillLevel) => (
                <TouchableOpacity
                  key={skillLevel}
                  style={[
                    styles.skillLevelButton,
                    level === skillLevel && styles.skillLevelButtonActive,
                  ]}
                  onPress={() => {
                    setLevel(skillLevel);
                    clearFieldError('level');
                  }}
                >
                  {level === skillLevel && (
                    <Ionicons name="checkmark" size={16} color="#19E675" style={styles.checkIcon} />
                  )}
                  <Text
                    style={[
                      styles.skillLevelText,
                      level === skillLevel && styles.skillLevelTextActive,
                    ]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {skillLevel}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {errorText('level')}
          </View>
        </View>

        {/* The Logistics Section */}
        <View style={styles.section}>
          <Text style={{fontSize: 23, fontWeight: '800', color: '#000', marginBottom: 4, marginTop: 40,}}>The Logistics</Text>

          {/* Date and Time */}
          <View style={styles.dateTimeRow}>
            <View ref={setFieldRef('date')} style={styles.dateTimeColumn}>
              <Text style={{    
                fontSize: 16,
    fontWeight: '300',
    color: '#000',
    marginBottom: 5}}>Date</Text>
              <TouchableOpacity
                style={[
                  styles.dateTimeInput,
                  isFieldInvalid('date') && styles.fieldInvalid,
                ]}
                onPress={openDatePicker}
              >
                <Text style={[styles.dateTimeText, !date && styles.placeholderText]}>
                  {formatDate(date)}
                </Text>
                <Ionicons name="calendar-outline" size={20} color="#666" />
              </TouchableOpacity>
              {errorText('date')}
            </View>
            <View ref={setFieldRef('time')} style={styles.dateTimeColumn}>
              <Text style={{fontSize: 16,
    fontWeight: '300',
    color: '#000',
    marginBottom: 5}}>Time</Text>
              <TouchableOpacity
                style={[
                  styles.dateTimeInput,
                  isFieldInvalid('time') && styles.fieldInvalid,
                ]}
                onPress={openTimePicker}
              >
                <Text style={[styles.dateTimeText, !time && styles.placeholderText]}>
                  {time || 'HH:MM'}
                </Text>
                <Ionicons name="time-outline" size={20} color="#666" />
              </TouchableOpacity>
              {errorText('time')}
            </View>
          </View>

          {/* Location */}
          <View ref={setFieldRef('location')}>
          <Text style={styles.inputLabel}>Location</Text>
          <View style={styles.locationInputContainer}>
            <View
              style={[
                styles.locationInput,
                isFieldInvalid('location') && styles.fieldInvalid,
              ]}
            >
              <Ionicons name="location-outline" size={20} color="#666" style={styles.locationIcon} />
              <TextInput
                ref={locationInputRef}
                style={styles.locationTextInput}
                placeholder="Search for courts or parks"
                placeholderTextColor="#999"
                value={location_name}
                onChangeText={handleLocationChange}
                onFocus={() => {
                  handleLocationFocus();
                  setTimeout(() => scrollToShow(locationInputRef.current), 50);
                }}
                onBlur={() => {
                  setTimeout(() => setShowLocationSuggestions(false), 200);
                }}
                returnKeyType="done"
                autoCorrect={false}
              />
            </View>
            {showLocationSuggestions && (
              <ScrollView
                style={styles.locationSuggestionsContainer}
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
              >
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
                      color={selectedLocation === suggestion.name ? '#ffffff' : '#666'}
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
                        <Text style={selectedLocation === suggestion.name ? styles.locationSuggestionDistanceSelected : styles.locationSuggestionDistance}>
                          {suggestion.distanceLabel} away
                        </Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
          {errorText('location')}
          </View>

          {/* Court Type */}
          <Text style={styles.inputLabel}>Access</Text>
          <View style={styles.courtTypeContainer}>
            {(['Public', 'Club', 'Condo'] as CourtType[]).map((type) => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.courtTypeButton,
                  court_type === type && styles.courtTypeButtonActive,
                ]}
                onPress={() => {
                  setCourt_type(type);
                  if (type === 'Public') {
                    clearFieldError('payment');
                  }
                }}
              >
                {court_type === type && (
                  <Ionicons name="checkmark" size={16} color="#19E675" style={styles.checkIcon} />
                )}
                <Text
                  style={[
                    styles.courtTypeText,
                    court_type === type && styles.courtTypeTextActive,
                  ]}
                >
                  {type}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {court_type !== 'Public' && (
            <View style={styles.bookingStatusContainer}>
              <TouchableOpacity
                style={styles.checkboxContainer}
                onPress={() => setIs_booked(!is_booked)}
              >
                <View style={[styles.checkbox, is_booked && styles.checkboxChecked]}>
                  {is_booked && <Ionicons name="checkmark" size={16} color="#19E675" />}
                </View>
                <Text style={styles.checkboxLabel}>I have booked this court</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.infoIcon} onPress={() => setShowBookingInfoModal(true)}>
                <Ionicons name="information-circle-outline" size={18} color="#666" />
              </TouchableOpacity>
            </View>
          )}
          
        </View>

        {/* The Requirements Section */}
        <View style={styles.section}>
        <Text style={{fontSize: 23, fontWeight: '800', color: '#000', marginBottom: 10, marginTop: 30,}}>The Requirements</Text>

          {/* Number of Players */}
          {type === 'Group' && (
          <View style={styles.numberSelectorContainer}>
            <Text style={styles.numberSelectorLabel}>Number of players</Text>
            <View style={{ marginTop: 40, marginLeft: -280}}>
            <Text style={styles.numberSelectorSublabel}>including host</Text>
            </View>
            <View style={styles.numberSelector}>
              <TouchableOpacity
                style={styles.numberButton}
                onPress={() => setGame_capacity(Math.max(3, game_capacity - 1))}
              >
                <Text style={styles.numberButtonText}>-</Text>
              </TouchableOpacity>
              <Text style={styles.numberValue}>{game_capacity}</Text>
              <TouchableOpacity
                style={styles.numberButton}
                onPress={() => setGame_capacity(game_capacity + 1)}
              >
                <Text style={styles.numberButtonText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
          )}

          {/* Game Title */}
          {type === 'Group' && (
            <View ref={setFieldRef('title')} style={styles.section}>
              <Text style={styles.inputLabel}>Game Title</Text>
              <TextInput
                ref={titleInputRef}
                style={[
                  styles.titleInput,
                  isFieldInvalid('title') && styles.fieldInvalid,
                ]}
                placeholder="Enter a title for your game..."
                placeholderTextColor="#999"
                value={title}
                onChangeText={(value) => {
                  setTitle(value);
                  clearFieldError('title');
                }}
                returnKeyType="next"
                onFocus={() => {
                  setTimeout(() => scrollToShow(titleInputRef.current), 50);
                }}
                onSubmitEditing={() => descriptionInputRef.current?.focus()}
              />
              {errorText('title')}
            </View>
          )}


        {/* Game Description */}
        <View ref={setFieldRef('description')} style={styles.section}>
          <Text style={styles.inputLabel}>Game Description</Text>
          <TextInput
            ref={descriptionInputRef}
            style={[
              styles.descriptionInput,
              isFieldInvalid('description') && styles.fieldInvalid,
            ]}
            placeholder="Write a description for your game..."
            placeholderTextColor="#999"
            value={description}
            onChangeText={(value) => {
              setDescription(value);
              clearFieldError('description');
            }}
            onFocus={() => {
              setTimeout(() => scrollToShow(descriptionInputRef.current), 50);
            }}
            onContentSizeChange={() => {
              if (descriptionInputRef.current?.isFocused()) {
                scrollToShow(descriptionInputRef.current);
              }
            }}
            multiline
            scrollEnabled={false}
            textAlignVertical="top"
            blurOnSubmit={false}
          />
          {errorText('description')}
        </View>

          {/* Cost sharing */}
          {court_type !== 'Public' && (
            <>
              <View style={styles.bookingStatusContainer}>
                <TouchableOpacity
                  style={styles.checkboxContainer}
                  onPress={() => {
                    const next = !is_paid;
                    setIs_paid(next);
                    if (!next) {
                      setPayment_amount(0);
                      clearFieldError('payment');
                    }
                  }}
                >
                  <View style={[styles.checkbox, is_paid && styles.checkboxChecked]}>
                    {is_paid && <Ionicons name="checkmark" size={16} color="#19E675" />}
                  </View>
                  <Text style={styles.checkboxLabel}>Split court booking cost</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.infoIcon} onPress={() => setShowPaidInfoModal(true)}>
                  <Ionicons name="information-circle-outline" size={18} color="#666" />
                </TouchableOpacity>
              </View>

              {is_paid && (
                <View ref={setFieldRef('payment')} style={styles.paymentInputContainer}>
                  <Text style={styles.inputLabel}>Offline reimbursement amount per player</Text>
                  <View
                    style={[
                      styles.paymentInputWrapper,
                      isFieldInvalid('payment') && styles.fieldInvalid,
                    ]}
                  >
                    <Text style={styles.dollarSign}>$</Text>
                    <TextInput
                      ref={paymentInputRef}
                      style={styles.paymentInput}
                      placeholder="0"
                      keyboardType="number-pad"
                      placeholderTextColor="#999"
                      value={payment_amount ? String(payment_amount) : ''}
                      returnKeyType="done"
                      onFocus={() => {
                        setTimeout(() => scrollToShow(paymentInputRef.current), 50);
                      }}
                      onChangeText={(text) => {
                        const cleaned = text.replace(/[^0-9]/g, '');
                        setPayment_amount(cleaned.length === 0 ? 0 : Number(cleaned));
                        clearFieldError('payment');
                      }}
                    />
                  </View>
                  {errorText('payment')}
                  <Text style={styles.paymentInputHint}>
                    This is an offline reimbursement note only. Sportiner does not process payments or collect money.
                  </Text>
                </View>
              )}
            </>
          )}
        </View>
        </ScrollView>
        {/* Create Game Button */}
        <View style={[styles.footer, { paddingBottom: keyboardVisible ? 10 : insets.bottom + 10 }]}>
          <TouchableOpacity style={styles.createButton} onPress={handleCreateGame}>
            <Text style={styles.createButtonText}>Create Game</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

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
                onPress={() => {setShowBookingInfoModal(false); setIs_booked(false);}}
              >
                <Text style={styles.bookingInfoCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.bookingInfoConfirmButton}
                onPress={() => {
                  setIs_booked(true);
                  setShowBookingInfoModal(false);
                }}
              >
                <Text style={styles.bookingInfoConfirmText}>{`Yes, I've booked it`}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Cost Sharing Info Modal */}
      <Modal
        visible={showPaidInfoModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPaidInfoModal(false)}
      >
        <View style={styles.bookingInfoModalOverlay}>
          <View style={[styles.bookingInfoModalContent, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.bookingInfoModalHeader}>
              <Text style={styles.bookingInfoModalTitle}>
                {`What does "Split court booking cost" mean?`}
              </Text>
              <TouchableOpacity onPress={() => setShowPaidInfoModal(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            <View style={styles.bookingInfoModalBody}>
              <Text style={styles.bookingInfoModalText}>
                Use this when you have already reserved the court and want joining players to coordinate their share offline.
              </Text>
              <View style={styles.bookingInfoList}>
                <View style={styles.bookingInfoItem}>
                  <Ionicons name="checkmark-circle" size={20} color="#19E675" style={styles.bookingInfoIcon} />
                  <Text style={styles.bookingInfoItemText}>The court was reserved upfront</Text>
                </View>
                <View style={styles.bookingInfoItem}>
                  <Ionicons name="checkmark-circle" size={20} color="#19E675" style={styles.bookingInfoIcon} />
                  <Text style={styles.bookingInfoItemText}>Other players reimburse you for their portion</Text>
                </View>
                <View style={styles.bookingInfoItem}>
                  <Ionicons name="checkmark-circle" size={20} color="#19E675" style={styles.bookingInfoIcon} />
                  <Text style={styles.bookingInfoItemText}>The amount you enter is the per-player court share for offline reimbursement</Text>
                </View>
              </View>
              <Text style={styles.bookingInfoNote}>
                This is an offline reimbursement note only. Sportiner does not process payments, sell digital goods, or offer subscriptions. This is for physical court cost sharing between players.
              </Text>
            </View>
            <View style={styles.bookingInfoModalActions}>
              <TouchableOpacity
                style={styles.bookingInfoCancelButton}
                onPress={() => {
                  setShowPaidInfoModal(false);
                  setIs_paid(false);
                  setPayment_amount(0);
                  clearFieldError('payment');
                }}
              >
                <Text style={styles.bookingInfoCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.bookingInfoConfirmButton}
                onPress={() => {
                  setIs_paid(true);
                  setShowPaidInfoModal(false);
                }}
              >
                <Text style={styles.bookingInfoConfirmText}>Yes, split the cost</Text>
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
  keyboardAvoidingView: {
    flex: 1,
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
    paddingBottom: 32,
    gap: 24,
  },
  section: {
    gap: 10,
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
    borderRadius: 24,
    padding: 2,
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
    marginBottom: 1
  },
  fieldInvalid: {
    borderWidth: 2,
    borderColor: '#E11D48',
  },
  fieldErrorText: {
    marginTop: -10,
    fontSize: 13,
    fontWeight: '600',
    color: '#E11D48',
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
    marginBottom: 5
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
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginTop: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
    maxHeight: 270,
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
  locationSuggestionDistanceSelected: {
    fontSize: 12,
    color: '#ffffff',
    marginTop: 2,
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
    marginTop: 12,
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
  numberSelectorSublabel: {
    fontSize: 14,
    fontWeight: '300',
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
  titleInput: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#000',
    marginBottom: 12,
  },
  paymentInputContainer: {
    marginTop: 12,
  },
  paymentInputHint: {
    fontSize: 13,
    fontWeight: '400',
    color: '#666',
    marginTop: 8,
    lineHeight: 18,
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
