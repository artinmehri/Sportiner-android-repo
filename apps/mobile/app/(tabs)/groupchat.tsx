import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  StatusBar,
  Alert,
  Dimensions,
  Animated,
  Image,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { PanGestureHandler, GestureHandlerRootView, State, GestureDetector } from 'react-native-gesture-handler';
import * as Clipboard from 'expo-clipboard';
import { blockUser, deleteMessage, editMessage, getGameInfo, getMessages, markAsRead, replyMessage, sendMessage, submitModerationReport } from '@/context/ChatContext';
import { getCurrentUserId, getUser, supabase } from '@/context/AuthContext';
import { formatGameSubtitle, GameRow } from '@/context/GameContext';
import { useUnreadMessages } from '@/context/UnreadMessagesContext';
import { Timestamp } from 'react-native-reanimated/lib/typescript/commonTypes';
import ReportModal from '@/components/ReportModal';
import ConversationStarters, {
  GROUP_CHAT_STARTERS,
} from '@/components/ConversationStarters';
const { width, height } = Dimensions.get('window');
import { Gesture } from 'react-native-gesture-handler';
import Reanimated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming, useDerivedValue } from 'react-native-reanimated';


type Message = {
  id?: string;
  sender_id: string;
  message: string
  image?: string;
  type: string;
  reply_to?: string;
  is_reply?: boolean,
  created_at?: Timestamp;
  updated_at?: Timestamp;
  is_edited?: boolean;
  status?: string
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
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { refreshUnreadCount } = useUnreadMessages();
  const [messages, setMessages] = useState<Message[]>([]);
  const [gameTitle, setGameTitle] = useState('');
  const [gameId, setGameId] = useState('');
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [userAvatars, setUserAvatars] = useState<Record<string, string>>({});
  const [userLevels, setUserLevels] = useState<Record<string, string>>({});
  const [userColors, setUserColors] = useState<Record<string, string>>({});

  const markConversationRead = async (chatId: string) => {
    await markAsRead(chatId);
    await refreshUnreadCount();
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
          newAvatars[user.id] = user.profile_picture ?? 'DEFAULT_AVATAR';
          newLevels[user.id] = user.level ?? '';
          newColors[user.id] = user.color ?? '';
        }
      });
  
      setUserNames(prev => ({ ...prev, ...newNames }));
      setUserAvatars(prev => ({ ...prev, ...newAvatars }));
      setUserLevels(prev => ({ ...prev, ...newLevels }));
      setUserColors(prev => ({ ...prev, ...newLevels }))
    };
  
    console.log("game title is: ", gameTitle)
    loadUserData();
  }, [messages]);


  useEffect(() => {
    if (!id) return;

    let cancelled = false;

    (async () => {
      const [messages, currentUser, gameRows] = await Promise.all([
        getMessages(id),
        getCurrentUserId(),
        getGameInfo(id),
      ]);

      setCurrentUserId(currentUser?.id)

      if (currentUser?.id) {
        const profile = await getUser(currentUser.id);
        if (!cancelled && profile?.name) {
          setCurrentUserName(profile.name);
        }
      }

      const gameRow = gameRows?.[0] as GameRow | undefined;
      if (!cancelled) {
        setGame(gameRow ?? null);
        console.log('this is group chat')
      }

      if (gameRow?.title && gameRow.id) {
        setGameTitle(gameRow?.title)
        setGameId(gameRow.id)
      }

      if (messages) {
        setMessages(
          messages.map((message) => {
            return {
              id: message.id,
              sender_id: message.sender_id,
              message: message.message,
              type: message.type,
              image: message.image,
              reply_to: message.reply_to,
              is_reply: message.is_reply,
              created_at: message.created_at,
              updated_at: message.updated_at,
              is_edited: message.is_edited,
              status: message.status
            };
          })
        );
      }

      if (!cancelled && id) {
        void markConversationRead(id);
      }
    })();

    // Subscribe to new messages in this chat
    const subscription = supabase
      .channel(`messages:${id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `chat_id=eq.${id}`
      }, (payload) => {
        if (cancelled) return;
        const newMessage = payload.new as any;
        setMessages(prev => [...prev, {
          id: newMessage.id,
          sender_id: newMessage.sender_id,
          message: newMessage.message,
          type: newMessage.type,
          image: newMessage.image,
          reply_to: newMessage.reply_to,
          is_reply: newMessage.is_reply,
          created_at: newMessage.created_at,
          updated_at: newMessage.updated_at,
          is_edited: newMessage.is_edited,
          status: newMessage.status
        }]);
        void markConversationRead(id);
      })
      .subscribe();

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [id, refreshUnreadCount]);


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


  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(0)).current;

  const hasConversationMessages = messages.length > 0;
  const showConversationStarters = !editingMessage && !isReplying;

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

  const scrollComposerToEnd = () => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || isSending) {
      return;
    }

    const editing = editingMessage;
    const replyingTo = isReplying ? replyInfo : null;

    // Clear edit/reply chrome immediately so the composer never gets stuck open.
    clearComposer();
    setIsSending(true);

    try {
      if (editing) {
        if (!editing.id) {
          Alert.alert('Could not edit message', 'Please try again.');
          return;
        }

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === editing.id
              ? { ...msg, message: text, is_edited: true }
              : msg
          )
        );
        await editMessage(editing.id, text);
        inputRef.current?.blur();
        return;
      }

      if (replyingTo) {
        if (!replyingTo.id || !id) {
          Alert.alert('Could not send reply', 'Please try again in a moment.');
          return;
        }

        const savedReply = await replyMessage(replyingTo.id, 'text', text, id);
        if (!savedReply) {
          Alert.alert('Could not send reply', 'Please try again.');
          return;
        }

        setMessages((prev) => {
          if (prev.some((message) => message.id === savedReply.id)) {
            return prev;
          }
          return [...prev, savedReply];
        });
        scrollComposerToEnd();
        return;
      }

      if (!id) {
        return;
      }

      const savedMessage = await sendMessage(text, 'text', id);
      if (!savedMessage) {
        Alert.alert('Could not send message', 'Please try again.');
        return;
      }

      setMessages((prev) => {
        if (prev.some((message) => message.id === savedMessage.id)) {
          return prev;
        }
        return [...prev, savedMessage];
      });
      scrollComposerToEnd();
    } catch (error) {
      console.log('handleSend error', error);
      Alert.alert('Could not send', 'Please try again.');
    } finally {
      setIsSending(false);
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
    setInputText('');
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
    reportedPostId: reportTarget.reportedMessageId,
    reason,
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

          setMessages((current) => current.filter((message) => message.sender_id !== blockedUserId));
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

  const renderMessage = ({ item }: { item: Message }) => {
    const isMe = item.sender_id === currentUserId;
    const repliedMessage = !!item.reply_to;

    return (
      <SwipeableMessage message={item} onReply={handleReply}>
        <View style={styles.messageContainer}>
          <TouchableOpacity
            activeOpacity={0.85}
            onLongPress={(e) => handleLongPress(item, e)}
            style={[
              styles.messageBubble,
              isMe ? styles.sentMessage : styles.receivedMessage,
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

            <Text style={[styles.messageText, isMe && styles.sentMessageText]}>
              {item.message}
            </Text>
          </TouchableOpacity>
        </View>
      </SwipeableMessage>
    );
  };

  let inputStyling;
  // If only text is typing, go with inputPill
  if (inputText) {
    inputStyling = styles.inputPill;
    // If both media and text are selcted go with inputNMedia
    // Otherwise if nothing is selected go with simple one
  } else {
    inputStyling = styles.simpleInputPill
  }

  const navigation = useNavigation()

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
          <Text numberOfLines={1} ellipsizeMode="tail" style={styles.contactSubtitle}>
            {formatGameSubtitle(game)}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );


  const renderReplyPreview = () => {
    if (!replyInfo) return null;
    
    return (
      <View style={styles.replyPreview}>
        {replyInfo.image ?     
        <View style={styles.replyWrapper}>
          <View>
            <Text style={styles.replySender}>
              {userNames[replyInfo.sender_id] || 'User'}              
            </Text>
              <Text style={styles.replyPreviewText}>
                  Photo
              </Text>
            </View>
            <Image source={{ uri: replyInfo.image}} style={styles.replyImage}/>
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
    <View style={[styles.inputContainer, { paddingBottom: insets.bottom }]}>
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
        <View style={inputStyling}>
            <TextInput
              ref={inputRef}
              style={styles.composerInput}
              value={inputText}
              onChangeText={setInputText}
              placeholder={editingMessage ? 'Edit message...' : isReplying ? 'Write a reply...' : 'Type...'}
              placeholderTextColor="#6B7280"
              multiline={false}
              editable={!isSending}
            />
            {inputText.trim() ? (
                      <TouchableOpacity
                        style={styles.sendButton}
                        onPress={() => void handleSend()}
                        disabled={isSending || !inputText.trim()}
                      >
                        <Ionicons name="send" size={22} color="#22C55E" />
                      </TouchableOpacity>
                   ) : null}
            </View>
          </View>
    </View>
  );

  const renderContextMenu = () => {
    if (!showContextMenu.visible || !showContextMenu.message) return null;
    
  
    Animated.timing(slideAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();

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
                                    setMessages(prev => prev.filter(m => m.id !== message.id));
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
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <TouchableWithoutFeedback onPress={closeContextMenu}>
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(item, index) => item.id || `message-${index}`}
            contentContainerStyle={[
              styles.messagesContainer,
              { paddingBottom: 80 + (replyInfo || editingMessage ? 60 : 0) + insets.bottom },
            ]}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
            removeClippedSubviews={true}
            maxToRenderPerBatch={10}
            updateCellsBatchingPeriod={50}
            initialNumToRender={15}
            windowSize={10}
            getItemLayout={(data, index) => ({
              length: 100, 
              offset: 100 * index,
              index,
            })}
          />
        </TouchableWithoutFeedback>
        
        {renderInput()}
        {renderContextMenu()}
        <ReportModal
          visible={!!reportTarget}
          title={reportTarget?.title}
          submitting={submittingReport}
          onClose={() => setReportTarget(null)}
          onSubmit={handleSubmitReport}
        />
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
    color: '#6B7280',
    fontSize: 12,
    marginTop: 2,
  },
  messageContainer: {
    marginBottom: 16,
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
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
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
    maxWidth: '78%',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    marginBottom: 12,
  },
  sentMessage: {
    backgroundColor: '#22C55E',
    marginLeft: 'auto',
  },
  receivedMessage: {
    backgroundColor: '#F3F4F6',
    marginRight: 'auto',
  },
  messageText: {
    fontSize: 16,
    color: '#000',
    lineHeight: 20,
  },
  sentMessageText: {
    color: '#fff',
  },
  messageImage: {
    width: 200,
    height: 150,
    borderRadius: 8,
    marginBottom: 4,
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
    alignItems: 'center',
    paddingHorizontal: 4,
    marginTop: 0.5
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
    height: 40,
  },
  composerIconButton: {
    paddingRight: 10,
  },
  composerInput: {
    flex: 1,
    fontSize: 16,
    color: '#111',
    paddingVertical: 0,
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
    marginHorizontal: 14,
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
});

export default GroupChatScreen;
