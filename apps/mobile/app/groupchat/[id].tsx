import React, { useCallback, useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  StatusBar,
  Alert,
  Dimensions,
  Animated,
  Image,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { PanGestureHandler, GestureHandlerRootView, State, GestureDetector } from 'react-native-gesture-handler';
import * as Clipboard from 'expo-clipboard';
import { blockUser, deleteMessage, editMessage, getConversationMemberIds, getGameInfo, markAsRead, replyMessage, sendMessage, submitModerationReport } from '@/context/ChatContext';
import { getCurrentUserId, getUser } from '@/context/AuthContext';
import { formatGameSubtitle, GameRow } from '@/context/GameContext';
import { useUnreadMessages } from '@/context/UnreadMessagesContext';
import ReportModal from '@/components/ReportModal';
import ConversationStarters, {
  GROUP_CHAT_STARTERS,
} from '@/components/ConversationStarters';
import { useOnlinePresence } from '@/context/OnlinePresenceContext';
import { useChatMessages } from '@/context/MessagesContext';
import type { ChatMessage } from '@/lib/chatMessages';
import {
  ChatImageError,
  newChatMessageId,
  pickChatImage,
  removeChatImage,
  uploadChatImage,
  type ChatImageAsset,
} from '@/lib/chatImages';
import {
  isUgcTextRejectedError,
  UGC_TEXT_REJECTED_COPY,
} from '@/lib/ugcModeration';
const { width, height } = Dimensions.get('window');
import { Gesture } from 'react-native-gesture-handler';
import Reanimated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

const DEFAULT_AVATAR =
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100&q=80';


type Message = ChatMessage;

type PendingPhoto = {
  asset: ChatImageAsset;
  messageId: string;
  uploadedPath?: string;
};

type ReportTarget = {
  reportedUserId: string;
  reportedMessageId?: string | null;
  title: string;
};


const SWIPE_THRESHOLD = 80;

type SwipeableMessageProps = {
  message: Message;
  onReply: (message: Message) => void;
  children: React.ReactNode;
};


const SwipeableMessage = ({ message, onReply, children }: SwipeableMessageProps) => {
  const translateX = useSharedValue(0);

  const panGesture = Gesture.Pan()
    .activeOffsetX(20)
    .failOffsetY([-12, 12])
    .onUpdate((e) => {
      if (e.translationX >= 0) {
        translateX.value = e.translationX;
      }
    })
    .onEnd((e) => {
      if (e.translationX > SWIPE_THRESHOLD) {
        runOnJS(onReply)(message);
      }
      translateX.value = withTiming(0, { duration: 200 });
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <GestureDetector gesture={panGesture}>
      <Reanimated.View style={animatedStyle}>{children}</Reanimated.View>
    </GestureDetector>
  );
};


const GroupChatScreen = () => {
  const { id, messageId: messageIdParam } = useLocalSearchParams<{
    id: string;
    messageId?: string;
  }>();
  const messageId = Array.isArray(messageIdParam) ? messageIdParam[0] : messageIdParam;
  const { refreshUnreadCount } = useUnreadMessages();
  const refreshUnreadCountRef = useRef(refreshUnreadCount);
  refreshUnreadCountRef.current = refreshUnreadCount;
  const { isUserOnline } = useOnlinePresence();
  const {
    messages,
    upsertMessages,
    patchMessage,
    dropMessage,
    dropMessagesFromSender,
  } = useChatMessages(id);
  const [screenFocused, setScreenFocused] = useState(true);
  const [gameTitle, setGameTitle] = useState('');
  const [gameId, setGameId] = useState('');
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [userAvatars, setUserAvatars] = useState<Record<string, string>>({});
  const [userLevels, setUserLevels] = useState<Record<string, string>>({});
  const [userColors, setUserColors] = useState<Record<string, string>>({});
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const isNearBottomRef = useRef(true);
  const scrolledToMessageIdRef = useRef<string | null>(null);

  useEffect(() => {
    scrolledToMessageIdRef.current = null;
  }, [id]);

  const markConversationRead = async (chatId: string) => {
    await markAsRead(chatId);
    await refreshUnreadCountRef.current();
  };

  
  useEffect(() => {
    const loadUserData = async () => {
      const uniqueUserIds = [...new Set(messages.map(m => m.sender_id))];
  
      const missingUserIds = uniqueUserIds.filter(id => !userNames[id]);
  
      if (missingUserIds.length === 0) return;
  
      const users = await Promise.all(
        missingUserIds.map(id => getUser(id))
      );
  
      const newNames: Record<string, string> = {};
      const newAvatars: Record<string, string> = {};
      const newLevels: Record<string, string> = {};
      const newColors: Record<string, string> = {};
  
      users.forEach(user => {
        if (user) {
          newNames[user.id] = user.name;
          newAvatars[user.id] = user.profile_picture || DEFAULT_AVATAR;
          newLevels[user.id] = user.level ?? '';
          newColors[user.id] = user.color ?? '';
        }
      });
  
      setUserNames(prev => ({ ...prev, ...newNames }));
      setUserAvatars(prev => ({ ...prev, ...newAvatars }));
      setUserLevels(prev => ({ ...prev, ...newLevels }));
      setUserColors(prev => ({ ...prev, ...newColors }));
    };
  
    console.log("game title is: ", gameTitle)
    loadUserData();
  }, [messages]);


  useEffect(() => {
    if (!id) return;

    let cancelled = false;

    (async () => {
      const [currentUser, gameRows, conversationMemberIds] = await Promise.all([
        getCurrentUserId(),
        getGameInfo(id),
        getConversationMemberIds(id),
      ]);

      if (cancelled) return;
      setCurrentUserId(currentUser?.id)
      setMemberIds(conversationMemberIds);

      if (currentUser?.id) {
        const profile = await getUser(currentUser.id);
        if (!cancelled && profile?.name) {
          setCurrentUserName(profile.name);
        }
      }

      if (cancelled) return;

      const gameRow = gameRows?.[0] as GameRow | undefined;
      setGame(gameRow ?? null);

      if (gameRow?.title && gameRow.id) {
        setGameTitle(gameRow?.title)
        setGameId(gameRow.id)
      }

      void markConversationRead(id);
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  // History and live updates come from the shared store, so mark read whenever
  // this conversation's cached list grows. Gated on focus: pushing a second
  // conversation on top leaves this one mounted, and it must not swallow the
  // unread badge for messages the user never actually looked at.
  useFocusEffect(
    useCallback(() => {
      setScreenFocused(true);
      return () => setScreenFocused(false);
    }, [])
  );

  useEffect(() => {
    if (!id || !screenFocused || messages.length === 0) return;
    void markConversationRead(id);
  }, [id, messages.length, screenFocused]);


  const handleGameNavigation = () => {
    router.push({ pathname: '/(tabs)/EventDetails', params: {id: gameId} })
  }

  const [game, setGame] = useState<GameRow | null>(null);
  const [inputText, setInputText] = useState('');
  const [isReplying, setIsReplying] = useState(false);
  const [replyInfo, setReplyInfo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState({
    visible: false,
    message: null as Message | null,
    position: { x: 0, y: 0 },
  });
  const [currentUserId, setCurrentUserId] = useState<string | undefined>()
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [submittingReport, setSubmittingReport] = useState(false);
  const [currentUserName, setCurrentUserName] = useState('');
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState<PendingPhoto | null>(null);
  const [failedPhotoId, setFailedPhotoId] = useState<string | null>(null);
  const pendingPhotoRef = useRef<PendingPhoto | null>(null);
  const [showFullScreenImage, setShowFullScreenImage] = useState(false);
  const [showImage, setShowImage] = useState<string | null>(null);


  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(0)).current;

  const hasConversationMessages = messages.length > 0;
  const showConversationStarters = !editingMessage && !isReplying && !keyboardVisible;

  const applySuggestion = (text: string) => {
    setInputText(text);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  };

  const clearComposer = () => {
    setInputText('');
    setEditingMessage(null);
    setReplyInfo(null);
    setIsReplying(false);
  };

  const setPhotoDraft = (photo: PendingPhoto | null) => {
    pendingPhotoRef.current = photo;
    setPendingPhoto(photo);
  };

  const clearPhotoDraft = () => setPhotoDraft(null);

  const restoreComposerAfterFailedSend = (text: string, replyingTo: Message | null) => {
    setInputText(text);
    if (replyingTo) {
      setReplyInfo(replyingTo);
      setIsReplying(true);
    }
  };

  const hasPendingMessageScroll =
    Boolean(messageId) && scrolledToMessageIdRef.current !== messageId;

  const scrollComposerToEnd = (force = false) => {
    if (!force && !isNearBottomRef.current) {
      return;
    }
    if (!force && hasPendingMessageScroll) {
      return;
    }
    requestAnimationFrame(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    });
  };

  const scrollComposerToEndRef = useRef(scrollComposerToEnd);
  scrollComposerToEndRef.current = scrollComposerToEnd;

  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {
        setKeyboardVisible(true);
        scrollComposerToEndRef.current(false);
      }
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardVisible(false)
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    if (!showContextMenu.visible) {
      return;
    }
    slideAnim.setValue(0);
    Animated.timing(slideAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [showContextMenu.visible, slideAnim]);

  useEffect(() => {
    if (!messageId || messages.length === 0) {
      return;
    }

    if (scrolledToMessageIdRef.current === messageId) {
      return;
    }

    const messageIndex = messages.findIndex(
      (message) => message.id === messageId
    );

    if (messageIndex === -1) {
      return;
    }

    isNearBottomRef.current = false;
    scrolledToMessageIdRef.current = messageId;

    requestAnimationFrame(() => {
      flatListRef.current?.scrollToIndex({
        index: messageIndex,
        animated: true,
        viewPosition: 0.5,
      });
    });
  }, [messageId, messages]);

  const handleMessagesScroll = (event: {
    nativeEvent: {
      contentOffset: { y: number };
      contentSize: { height: number };
      layoutMeasurement: { height: number };
    };
  }) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom =
      contentSize.height - contentOffset.y - layoutMeasurement.height;
    isNearBottomRef.current = distanceFromBottom < 140;
  };

  const handleSendPhoto = async (pending: PendingPhoto) => {
    if (!id || !currentUserId || isSending) return;

    const optimisticMessage: Message = {
      id: pending.messageId,
      chat_id: id,
      sender_id: currentUserId,
      message: 'Photo',
      type: 'image',
      imageUrl: pending.asset.uri,
      created_at: new Date().toISOString(),
      status: 'uploading',
    };

    setIsSending(true);
    setIsUploadingImage(true);
    setPendingPhoto(null);
    upsertMessages([optimisticMessage]);
    scrollComposerToEnd(true);

    try {
      let uploadedPath = pending.uploadedPath;
      if (!uploadedPath) {
        const uploaded = await uploadChatImage(id, pending.messageId, pending.asset);
        uploadedPath = uploaded.path;
        pendingPhotoRef.current = { ...pending, uploadedPath };
      }

      const savedMessage = await sendMessage('Photo', 'image', id, uploadedPath, pending.messageId);
      if (!savedMessage) throw new ChatImageError('upload');

      patchMessage(pending.messageId, {
        ...savedMessage,
        status: 'sent',
      });
      setFailedPhotoId(null);
      clearPhotoDraft();
      void markConversationRead(id);
    } catch {
      setFailedPhotoId(pending.messageId);
      patchMessage(pending.messageId, {
        status: 'failed',
        imageUrl: pending.asset.uri,
      });
      Alert.alert('Photo failed to send', 'Tap Retry on the photo to try again.');
    } finally {
      setIsUploadingImage(false);
      setIsSending(false);
    }
  };

  const handleRetryPhoto = () => {
    const pending = pendingPhotoRef.current;
    if (!pending) {
      Alert.alert('Photo unavailable', 'Please choose the photo again.');
      return;
    }
    void handleSendPhoto(pending);
  };

  const handleRemoveFailedPhoto = async (messageId: string) => {
    const pending = pendingPhotoRef.current;
    if (pending?.messageId !== messageId) {
      if (failedPhotoId === messageId) setFailedPhotoId(null);
      dropMessage(messageId);
      return;
    }

    try {
      if (pending.uploadedPath) await removeChatImage(pending.uploadedPath);
    } catch {
      Alert.alert('Could not remove photo', 'Please try again.');
      return;
    }

    clearPhotoDraft();
    setFailedPhotoId(null);
    dropMessage(messageId);
  };

  const handleSend = async () => {
    if (isSending) return;

    const pending = pendingPhotoRef.current;
    if (pending && !editingMessage && !isReplying) {
      await handleSendPhoto(pending);
      return;
    }

    const text = inputText.trim();
    if (!text) return;

    const editing = editingMessage;
    const replyingTo = isReplying ? replyInfo : null;

    if (!editing) {
      clearComposer();
      isNearBottomRef.current = true;
      scrollComposerToEnd(true);
    }

    setIsSending(true);

    try {
      if (editing) {
        if (!editing.id) {
          Alert.alert('Could not edit message', 'Please try again.');
          return;
        }

        const savedEdit = await editMessage(editing.id, text);
        if (!savedEdit) {
          Alert.alert('Could not edit message', 'Your original message was not changed. Please try again.');
          return;
        }

        patchMessage(editing.id, {
          message: savedEdit.message ?? text,
          is_edited: true,
        });
        clearComposer();
        inputRef.current?.blur();
        return;
      }

      if (replyingTo) {
        if (!replyingTo.id || !id) {
          restoreComposerAfterFailedSend(text, replyingTo);
          Alert.alert('Could not send reply', 'Please try again in a moment.');
          return;
        }

        const savedReply = await replyMessage(replyingTo.id, 'text', text, id);
        if (!savedReply) {
          restoreComposerAfterFailedSend(text, replyingTo);
          Alert.alert('Could not send reply', 'Please try again.');
          return;
        }

        upsertMessages([savedReply]);
        scrollComposerToEnd(true);
        if (id) {
          void markConversationRead(id);
        }
        return;
      }

      if (!id) {
        setInputText(text);
        return;
      }

      const savedMessage = await sendMessage(text, 'text', id);
      if (!savedMessage) {
        setInputText(text);
        Alert.alert('Could not send message', 'Please try again.');
        return;
      }

      upsertMessages([savedMessage]);
      scrollComposerToEnd(true);
      void markConversationRead(id);
    } catch (error) {
      console.log('handleSend error', error);
      restoreComposerAfterFailedSend(text, editing ? null : replyingTo);
      if (isUgcTextRejectedError(error)) {
        Alert.alert(UGC_TEXT_REJECTED_COPY.title, UGC_TEXT_REJECTED_COPY.message);
        return;
      }
      Alert.alert('Could not send', 'Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  const handlePickImage = async () => {
    if (!id || isSending || pendingPhotoRef.current || failedPhotoId || editingMessage || isReplying) return;

    try {
      const asset = await pickChatImage();
      if (!asset) return;
      setPhotoDraft({ asset, messageId: newChatMessageId() });
    } catch (error) {
      const code = error instanceof ChatImageError ? error.code : 'upload';
      if (code === 'permission') {
        Alert.alert(
          'Photo access is off',
          'To share photos in chat, allow photo access for Sportiner in Settings.',
        );
      } else if (code === 'too-large') {
        Alert.alert(
          'Photo too large',
          'This photo is still too large to upload after processing. Try a smaller image.',
        );
      } else if (code === 'invalid') {
        Alert.alert('Couldn\'t use photo', 'We couldn\'t read this photo. Try choosing another image.');
      } else if (code === 'processing') {
        Alert.alert(
          'Couldn\'t process photo',
          'We couldn\'t prepare this photo for upload. Please try another photo.',
        );
      } else if (code === 'not-authenticated') {
        Alert.alert('Could not send photo', 'Please sign in again and try again.');
      } else {
        Alert.alert('Couldn\'t upload photo', 'Check your connection and try again.');
      }
    }
  };

  const getOriginalMessage = (messageId: string) => {
    const foundMessage = messages.find((message) => message.id === messageId);
    return foundMessage?.message ?? 'Original message deleted';
  };

  const handleReply = (message: Message) => {
    setEditingMessage(null);
    setReplyInfo(message);
    setIsReplying(true);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  };

  const handleEdit = (message: Message) => {
    setReplyInfo(null);
    setIsReplying(false);
    setEditingMessage(message);
    setInputText(message.message);
    setShowContextMenu({ visible: false, message: null, position: { x: 0, y: 0 } });
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  };


  const handleLongPress = (message: Message, event: any) => {
    const { pageX, pageY } = event.nativeEvent;
    setShowContextMenu({
      visible: true,
      message,
      position: { x: pageX, y: pageY },
    });
  };

const openReportUser = (reportedUserId: string) => {
  if (!reportedUserId || reportedUserId === currentUserId) return;
  setShowContextMenu({ visible: false, message: null, position: { x: 0, y: 0 } });
  setReportTarget({
    reportedUserId,
    reportedMessageId: null,
    title: 'Report User',
  });
};

const openReportMessage = (message: Message) => {
  if (!message.id || message.sender_id === currentUserId) return;
  setShowContextMenu({ visible: false, message: null, position: { x: 0, y: 0 } });
  setReportTarget({
    reportedUserId: message.sender_id,
    reportedMessageId: message.id,
    title: 'Report Message',
  });
};

const handleSubmitReport = async (reason: string, details: string) => {
  if (!reportTarget) return;

  setSubmittingReport(true);
  const success = await submitModerationReport({
    reportedUserId: reportTarget.reportedUserId,
    reportedMessageId: reportTarget.reportedMessageId,
    reason,
    details,
  });
  setSubmittingReport(false);

  if (!success) {
    Alert.alert('Error', 'Failed to submit report');
    return;
  }

  setReportTarget(null);
  Alert.alert(
    'Report submitted',
    'Our moderation team will review it and take action if it violates our Community Guidelines.'
  );
};

const handleBlockUser = (blockedUserId: string) => {
  if (!blockedUserId || blockedUserId === currentUserId) return;
  setShowContextMenu({ visible: false, message: null, position: { x: 0, y: 0 } });

  Alert.alert(
    'Block User',
    'This user will no longer be able to message you.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: async () => {
          const success = await blockUser(blockedUserId);

          if (!success) {
            Alert.alert('Error', 'Failed to block user');
            return;
          }

          dropMessagesFromSender(blockedUserId);
          Alert.alert('User Blocked', 'You have successfully blocked this user.');
        },
      },
    ]
  );
};


  const closeContextMenu = () => {
   
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      setShowContextMenu({ visible: false, message: null, position: { x: 0, y: 0 } });
    });
  };

  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const isMe = item.sender_id === currentUserId;
    const repliedMessage = !!item.reply_to;
    const senderName = userNames[item.sender_id] || 'User';
    const senderAvatar = userAvatars[item.sender_id] || DEFAULT_AVATAR;
    const previousSenderId = index > 0 ? messages[index - 1]?.sender_id : null;
    const nextSenderId = index < messages.length - 1 ? messages[index + 1]?.sender_id : null;
    // WhatsApp: name on first message in a streak, avatar on the last.
    const showSenderName = !isMe && previousSenderId !== item.sender_id;
    const showSenderAvatar = !isMe && nextSenderId !== item.sender_id;

    return (
      <SwipeableMessage message={item} onReply={handleReply}>
        <View
          style={[
            styles.messageContainer,
            isMe ? styles.messageContainerSent : styles.messageContainerReceived,
            !showSenderName && !isMe && styles.messageContainerGrouped,
          ]}
        >
          {!isMe ? (
            <View style={styles.messageAvatarSlot}>
              {showSenderAvatar ? (
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() =>
                    router.push({
                      pathname: '/(tabs)/profileDetails',
                      params: { id: item.sender_id },
                    })
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`View ${senderName}'s profile`}
                >
                  <Image source={{ uri: senderAvatar }} style={styles.messageAvatar} />
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          <View style={[styles.messageContent, isMe && styles.messageContentSent]}>
            {showSenderName ? (
              <Text style={styles.senderName} numberOfLines={1}>
                {senderName}
              </Text>
            ) : null}

            <TouchableOpacity
              activeOpacity={0.85}
              onLongPress={(e) => handleLongPress(item, e)}
              style={[
                styles.messageBubble,
                isMe ? styles.sentMessage : styles.receivedMessage,
                showSenderName && styles.receivedMessageWithName,
              ]}
            >
              {repliedMessage && item.reply_to && (
                <View style={styles.messageReplyPreview}>
                  <Text style={styles.messageReplyText}>
                    {(() => {
                      const original = messages.find(m => m.id === item.reply_to);
                      const originalSender = userNames[original?.sender_id ?? ''] || 'User';
                      return `${originalSender}: "${getOriginalMessage(item.reply_to)}"`;
                    })()}
                  </Text>
                </View>
              )}

              {item.imageUrl ? (
                <View style={styles.imageMessageContainer}>
                  <TouchableOpacity
                    disabled={item.status === 'uploading'}
                    onLongPress={(e) => handleLongPress(item, e)}
                    onPress={() => {
                      setShowImage(item.imageUrl ?? null);
                      setShowFullScreenImage(true);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="View photo"
                  >
                    <Image
                      source={{ uri: item.imageUrl }}
                      style={styles.messageImage}
                      resizeMode="contain"
                    />
                    {item.status === 'uploading' ? (
                      <View style={styles.imageStatusOverlay}>
                        <ActivityIndicator color="#FFFFFF" />
                      </View>
                    ) : null}
                  </TouchableOpacity>
                  {item.status === 'failed' ? (
                    <View style={styles.failedPhotoContainer}>
                      <Text style={styles.failedPhotoText}>Failed to send</Text>
                      <View style={styles.failedPhotoActions}>
                        <TouchableOpacity onPress={handleRetryPhoto}>
                          <Text style={styles.failedPhotoActionText}>Retry</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => void handleRemoveFailedPhoto(item.id ?? '')}>
                          <Text style={styles.failedPhotoActionText}>Remove</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : null}
                </View>
              ) : item.type === 'text' ? (
                <Text style={[styles.messageText, isMe && styles.sentMessageText]}>
                  {item.message}
                </Text>
              ) : null}

              {item.is_edited ? (
                <Text style={[styles.editedLabel, isMe && styles.editedLabelSent]}>edited</Text>
              ) : null}
            </TouchableOpacity>
          </View>
        </View>
      </SwipeableMessage>
    );
  };

  const navigation = useNavigation()
  const onlineMemberCount = memberIds.filter(
    (memberId) => memberId !== currentUserId && isUserOnline(memberId)
  ).length;

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="chevron-back" size={28} color="#111" />
        </TouchableOpacity>

        { game &&
        <TouchableOpacity onPress={() => handleGameNavigation()}>
          <Image source={{ uri: game.image ?? undefined }} style={styles.avatar} />
        </TouchableOpacity>
        }

        <TouchableOpacity onPress={() => handleGameNavigation()} style={styles.contactInfo}>
          <View style={styles.contactNameRow}>
            <Text numberOfLines={1} ellipsizeMode="tail" style={styles.contactName}>{gameTitle}</Text>
            <Ionicons name="chevron-forward" size={16} color="#111" style={styles.contactNameChevron} />
          </View>
          <View style={styles.contactMetaRow}>
            <View
              accessibilityLabel={`${onlineMemberCount} other players online`}
              style={[styles.presenceDot, onlineMemberCount === 0 && styles.presenceDotOffline]}
            />
            <Text style={styles.presenceText}>
              {onlineMemberCount > 0 ? `${onlineMemberCount} online` : 'No one else online'}
            </Text>
            <Text numberOfLines={1} ellipsizeMode="tail" style={styles.contactSubtitle}>
              {formatGameSubtitle(game)}
            </Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );


  const renderReplyPreview = () => {
    if (!replyInfo) return null;
    
    return (
      <View style={styles.replyPreview}>
        {replyInfo.imageUrl ?     
        <View style={styles.replyWrapper}>
          <View>
            <Text style={styles.replySender}>
              {userNames[replyInfo.sender_id] || 'User'}              
            </Text>
              <Text style={styles.replyPreviewText}>
                  Photo
              </Text>
            </View>
            <Image source={{ uri: replyInfo.imageUrl}} style={styles.replyImage}/>
          </View>
        :     
        <><Text style={styles.replySender}>
            {userNames[replyInfo.sender_id] || 'User'}          
          </Text>
          <Text style={styles.replyPreviewText}>
          {replyInfo.message}
        </Text></> 
        }
    
        <TouchableOpacity 
          style={styles.closeReplyButton}
          onPress={clearComposer}
        >
          <Ionicons name="close" size={16} color="#666" />
        </TouchableOpacity>
      </View>
    );
  };

  const renderInput = () => (
    <View style={[styles.inputContainer, { paddingBottom: keyboardVisible ? 8 : insets.bottom }]}>
      {editingMessage ? (
        <View style={styles.editHeader}>
          <Text style={styles.editHeaderText}>Editing message</Text>
          <TouchableOpacity
            style={styles.cancelEditButton}
            onPress={clearComposer}
          >
            <Text style={styles.cancelEditText}>✕</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {!editingMessage ? renderReplyPreview() : null}

      {pendingPhoto ? (
        <View style={styles.mediaPreview}>
          <View style={styles.imagePreview}>
            <Image source={{ uri: pendingPhoto.asset.uri }} style={styles.mediaThumbnail} />
            <TouchableOpacity
              style={styles.removeMediaButton}
              onPress={clearPhotoDraft}
              accessibilityRole="button"
              accessibilityLabel="Remove selected photo"
            >
              <Ionicons name="close" size={14} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {isUploadingImage ? (
        <View style={styles.uploadingImageStatus}>
          <ActivityIndicator size="small" color="#22C55E" />
          <Text style={styles.uploadingImageText}>Uploading photo...</Text>
        </View>
      ) : null}

      {showConversationStarters ? (
        <ConversationStarters
          suggestions={GROUP_CHAT_STARTERS}
          onSelect={applySuggestion}
          expandedByDefault={!hasConversationMessages}
          systemBanner={
            !hasConversationMessages
              ? `${currentUserName || 'A player'} joined the game. Say hello and coordinate the details!`
              : null
          }
        />
      ) : null}

    
      <View style={styles.simpleComposerPill}>
        <View style={styles.inputPill}>
            {!editingMessage && !isReplying ? (
              <TouchableOpacity
                style={styles.composerIconButton}
                onPress={() => void handlePickImage()}
                disabled={isSending || Boolean(pendingPhoto) || Boolean(failedPhotoId)}
                accessibilityRole="button"
                accessibilityLabel="Choose a photo"
              >
                {isUploadingImage ? (
                  <ActivityIndicator size="small" color="#22C55E" />
                ) : (
                  <Ionicons name="image-outline" size={22} color="#22C55E" />
                )}
              </TouchableOpacity>
            ) : null}
            <TextInput
              ref={inputRef}
              style={styles.composerInput}
              value={inputText}
              onChangeText={setInputText}
              onContentSizeChange={() => scrollComposerToEnd(false)}
              placeholder={editingMessage ? 'Edit message...' : isReplying ? 'Write a reply...' : 'Type...'}
              placeholderTextColor="#6B7280"
              multiline
              blurOnSubmit={false}
              returnKeyType="default"
            />
            {inputText.trim() || pendingPhoto ? (
                      <TouchableOpacity
                        style={styles.sendButton}
                        onPress={() => void handleSend()}
                        disabled={isSending}
                      >
                        <Ionicons name="send" size={22} color={isSending ? '#86EFAC' : '#22C55E'} />
                      </TouchableOpacity>
                   ) : null}
            </View>
          </View>
    </View>
  );

  const renderContextMenu = () => {
    if (!showContextMenu.visible || !showContextMenu.message) return null;

    //copy to clipboard function
    const copyToClipboard = async (text: string) => {
    await Clipboard.setStringAsync(text);
}
    
    const message = showContextMenu.message;
    const isOwnMessage = message.sender_id === currentUserId;
    const menuItems = [
      { id: 'copy', icon: 'copy-outline', iconSet: 'Ionicons', label: 'Copy', color: '#6B7280' },
      ...(isOwnMessage ? [{ id: 'edit', icon: 'create-outline', iconSet: 'Ionicons', label: 'Edit', color: '#3B82F6' }] : []),
      ...(isOwnMessage ? [{ id: 'delete', icon: 'trash-outline', iconSet: 'Ionicons', label: 'Delete', color: '#EF4444' }] : []),
      ...(!isOwnMessage ? [{ id: 'report-message', icon: 'flag-outline', iconSet: 'Ionicons', label: 'Report Message', color: '#EF4444' }] : []),
      ...(!isOwnMessage ? [{ id: 'report-user', icon: 'person-remove-outline', iconSet: 'Ionicons', label: 'Report User', color: '#EF4444' }] : []),
      ...(!isOwnMessage ? [{ id: 'block-user', icon: 'ban-outline', iconSet: 'Ionicons', label: 'Block User', color: '#EF4444' }] : []),
    ];
    
    const menuWidth = 250;
    const menuHeight = 48 * menuItems.length + 16;
    const padding = 10;
    
    let left = showContextMenu.position.x - menuWidth / 2;
    let top = showContextMenu.position.y - menuHeight;
    
    if (left < padding) left = padding;
    if (left + menuWidth > width - padding) left = width - menuWidth - padding;
    if (top < padding) top = padding;
    
    return (
      <TouchableWithoutFeedback onPress={closeContextMenu}>
        <Animated.View 
          style={styles.contextMenuOverlay}
        >
          <Animated.View style={[styles.contextMenu, { left: Number(left), top: Number(top) }]}>
            <Animated.View style={{ opacity: slideAnim }}>
              {menuItems.map((item) => {
                const IconComponent = item.iconSet === 'Ionicons' ? Ionicons : Feather;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.contextMenuItem}
                    onPress={() => {
                      if (item.id === 'edit') {
                        handleEdit(message);
                      } else if (item.id === 'copy') {
                        copyToClipboard(message.message)
                        Alert.alert('Copied to clipboard', message.message);
                      } else if (item.id === 'delete') {
                        Alert.alert(
                          'Delete message',
                          'Are you sure you want to delete this message?',
                          [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Delete',
                              style: 'destructive',
                              onPress: async () => {
                                if (message.id) {
                                  const deleted = await deleteMessage(message.id);
                                  if (deleted) {
                                    dropMessage(message.id);
                                  } else {
                                    Alert.alert('Could not delete message', 'Please try again.');
                                  }
                                }
                              },
                            },
                          ]
                        );
                      } else if (item.id === 'report-message') {
                        openReportMessage(message);
                      } else if (item.id === 'report-user') {
                        openReportUser(message.sender_id);
                      } else if (item.id === 'block-user') {
                        handleBlockUser(message.sender_id);
                      }
                      if (!['report-message', 'report-user', 'block-user'].includes(item.id)) {
                        setShowContextMenu({ visible: false, message: null, position: { x: 0, y: 0 } });
                      }
                    }}
                  >
                    <View style={[styles.contextMenuIconContainer, { backgroundColor: item.color + '20' }]}>
                      <IconComponent name={item.icon as any} size={18} color={item.color} />
                    </View>
                    <Text style={styles.contextMenuText}>{item.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </Animated.View>
          </Animated.View>
        </Animated.View>
      </TouchableWithoutFeedback>
    );
  };

  return (
    <GestureHandlerRootView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      {renderHeader()}
      
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(item, index) => item.id || `message-${index}`}
            contentContainerStyle={[
              styles.messagesContainer,
              { paddingBottom: 24 + (replyInfo || editingMessage ? 56 : 0) },
            ]}
            onScroll={handleMessagesScroll}
            scrollEventThrottle={16}
            onContentSizeChange={() => scrollComposerToEnd(false)}
            onScrollToIndexFailed={({ index, averageItemLength }) => {
              flatListRef.current?.scrollToOffset({
                offset: Math.max(0, averageItemLength * index),
                animated: false,
              });
              requestAnimationFrame(() => {
                flatListRef.current?.scrollToIndex({
                  index,
                  animated: true,
                  viewPosition: 0.5,
                });
              });
            }}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            onScrollBeginDrag={closeContextMenu}
            removeClippedSubviews={false}
            maxToRenderPerBatch={12}
            updateCellsBatchingPeriod={50}
            initialNumToRender={20}
            windowSize={12}
          />
        
        {renderInput()}
        {renderContextMenu()}
        <ReportModal
          visible={!!reportTarget}
          title={reportTarget?.title}
          submitting={submittingReport}
          onClose={() => setReportTarget(null)}
          onSubmit={handleSubmitReport}
        />
        <Modal
          visible={showFullScreenImage}
          transparent
          animationType="fade"
          onRequestClose={() => setShowFullScreenImage(false)}
        >
          <View style={styles.modalContainer}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowFullScreenImage(false)}
              accessibilityRole="button"
              accessibilityLabel="Close photo"
            >
              <Ionicons name="close" size={28} color="white" />
            </TouchableOpacity>
            {showImage ? (
              <Image source={{ uri: showImage }} style={styles.fullScreenImage} resizeMode="contain" />
            ) : null}
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingBottom: 10,
    paddingTop: 60,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    marginRight: 8,
  },
  backButton: {
    paddingVertical: 8,
    paddingRight: 10,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#D1D5DB',
    marginRight: 10,
  },
  contactInfo: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  contactNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  contactName: {
    flexShrink: 1,
    color: '#111',
    fontSize: 18,
    fontWeight: '700',
  },
  contactNameChevron: {
    marginLeft: 4,
    flexShrink: 0,
  },
  contactSubtitle: {
    flex: 1,
    color: '#6B7280',
    fontSize: 12,
  },
  contactMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    marginTop: 2,
    gap: 5,
  },
  presenceDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#16A34A',
    flexShrink: 0,
  },
  presenceDotOffline: {
    backgroundColor: '#9CA3AF',
  },
  presenceText: {
    color: '#4B5563',
    fontSize: 12,
    flexShrink: 0,
  },
  messageContainer: {
    marginBottom: 8,
    width: '100%',
  },
  messageContainerSent: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  messageContainerReceived: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
  },
  messageContainerGrouped: {
    marginBottom: 2,
  },
  messageAvatarSlot: {
    width: 34,
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  messageAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#D1D5DB',
  },
  messageContent: {
    flexShrink: 1,
    maxWidth: '78%',
  },
  messageContentSent: {
    alignItems: 'flex-end',
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    marginLeft: 8,
  },
  avatarText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  avatarImage: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  senderInfo: {
    flexDirection: 'column',
    marginLeft: 8,
  },
  senderName: {
    fontSize: 13,
    color: '#16A34A',
    fontWeight: '600',
    marginBottom: 4,
    marginLeft: 4,
  },
  senderLevel: {
    fontSize: 12,
    fontWeight: '600',
  },
  groupAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#22C55E',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  messagesContainer: {
    paddingHorizontal: 14,
    paddingTop: 14,
  },
  messageBubble: {
    maxWidth: '100%',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
  },
  sentMessage: {
    backgroundColor: '#22C55E',
    borderBottomRightRadius: 4,
  },
  receivedMessage: {
    backgroundColor: '#F3F4F6',
    borderBottomLeftRadius: 4,
  },
  receivedMessageWithName: {
    borderTopLeftRadius: 14,
  },
  messageText: {
    fontSize: 16,
    color: '#000',
    lineHeight: 20,
  },
  sentMessageText: {
    color: '#fff',
  },
  editedLabel: {
    fontSize: 11,
    color: 'rgba(0, 0, 0, 0.35)',
    marginTop: 3,
    alignSelf: 'flex-end',
  },
  editedLabelSent: {
    color: 'rgba(255, 255, 255, 0.55)',
  },
  messageImage: {
    width: 200,
    height: 150,
    borderRadius: 8,
    marginBottom: 4,
  },
  imageMessageContainer: {
    position: 'relative',
  },
  imageStatusOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
  },
  failedPhotoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingTop: 4,
  },
  failedPhotoText: {
    color: '#B91C1C',
    fontSize: 12,
  },
  failedPhotoActions: {
    flexDirection: 'row',
    gap: 12,
  },
  failedPhotoActionText: {
    color: '#166534',
    fontSize: 12,
    fontWeight: '600',
  },
  videoContainer: {
    position: 'relative',
    marginBottom: 4,
  },
  videoThumbnail: {
    width: 200,
    height: 150,
    borderRadius: 8,
  },
  playButton: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -10 }, { translateY: -10 }],
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaPreview: {
    marginTop: 8,
    marginHorizontal: 14,
  },
  imagePreview: {
    position: 'relative',
    alignSelf: 'flex-start',
  },
  videoPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 8,
  },
  mediaThumbnail: {
    width: 60,
    height: 60,
    borderRadius: 6,
  },
  mediaIcon: {
    marginLeft: 8,
  },
  removeMediaButton: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#666',
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageReplyPreview: {
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginBottom: 6,
    borderRadius: 4,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(0, 0, 0, 0.2)',
  },
  messageReplyText: {
    fontSize: 12,
    color: 'rgba(0, 0, 0, 0.6)',
    fontStyle: 'italic',
  },
  messageTime: {
    fontSize: 11,
    color: 'rgba(0,0,0,0.45)',
    marginTop: 4,
    textAlign: 'right',
  },
  sentMessageTime: {
    color: 'rgba(255,255,255,0.7)',
  },
  inputContainer: {
    backgroundColor: '#fff',
    paddingTop: 8,
    paddingHorizontal: 14,
  },
  uploadingImageStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 6,
  },
  uploadingImageText: {
    color: '#4B5563',
    fontSize: 13,
  },
    simpleInputPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4.5,
    marginTop: 7.9
  },
  inputNMedia: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4.5,
  },
  inputPill: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 4,
    width: '100%',
  },
  composerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 24,
    paddingHorizontal: 12,
    height: 46,
  },
  simpleComposerPill: {
    flexDirection: 'column',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 24,
    paddingHorizontal: 12,
    minHeight: 40,
    maxHeight: 112,
    paddingVertical: 4,
  },
  composerIconButton: {
    paddingRight: 10,
    paddingBottom: 6,
  },
  composerInput: {
    flex: 1,
    fontSize: 16,
    color: '#111',
    paddingTop: 6,
    paddingBottom: 6,
    maxHeight: 96,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  replyPreview: {
    backgroundColor: '#F3F4F6',
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#22C55E',
  },
  replyWrapper: {
    flexDirection: 'row'
  },
  replySender: {
    fontSize: 15,
    fontWeight: '700',
    color: '#22C55E',
  },
  replyPreviewText: {
    fontSize: 14,
    color: '#374151',
  },
  replyImage: {
    width: 40,
    height: 40,
    borderRadius: 7,
    marginLeft: 210
  },
  closeReplyButton: {
    position: 'absolute',
    right: 8,
    top: 8,
  },

  editHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
  },
  editHeaderText: {
    fontSize: 14,
    color: '#666',
  },
  cancelEditButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  cancelEditText: {
    fontSize: 16,
    color: '#666',
  },

  contextMenuOverlay: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
  },
  contextMenu: {
    position: 'absolute',
    width: 200,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  contextMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  contextMenuIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  contextMenuIcon: {
  
  },
  contextMenuText: {
    fontSize: 15,
    color: '#111',
    fontWeight: '500',
  },
  swipeReplyingMessage: {
    transform: [{ scale: 0.98 }],
    shadowColor: '#22C55E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  swipeReplyIndicator: {
    position: 'absolute',
    top: -25,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#22C55E',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  swipeReplyIcon: {
    color: '#19E675',
    fontWeight: '600',
  },
  swipeReplyText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 58,
    right: 20,
    zIndex: 1,
    padding: 8,
  },
  fullScreenImage: {
    width: '100%',
    height: '80%',
  },
});

export default GroupChatScreen;
