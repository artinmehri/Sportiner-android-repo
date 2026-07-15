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
import { Timestamp } from 'react-native-reanimated/lib/typescript/commonTypes';
import ReportModal from '@/components/ReportModal';
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
  const [messages, setMessages] = useState<Message[]>([]);
  const [gameTitle, setGameTitle] = useState('');
  const [gameId, setGameId] = useState('');
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [userAvatars, setUserAvatars] = useState<Record<string, string>>({});
  const [userLevels, setUserLevels] = useState<Record<string, string>>({});
  const [userColors, setUserColors] = useState<Record<string, string>>({});

  
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

      // Mark conversation as read (fire-and-forget, error handling in markAsRead)
      if (id) {
        markAsRead(id);
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
      })
      .subscribe();

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [id]);


  const handleGameNavigation = () => {
    router.push({ pathname: '/(tabs)/EventDetails', params: {id: gameId} })
  }

  const [game, setGame] = useState<GameRow | null>(null);
  const [inputText, setInputText] = useState('');
  const [isReplying, setIsReplying] = useState(false);
  const [replyInfo, setReplyInfo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [showContextMenu, setShowContextMenu] = useState({
    visible: false,
    message: null as Message | null,
    position: { x: 0, y: 0 },
  });
  const [currentUserId, setCurrentUserId] = useState<string | undefined>()
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [submittingReport, setSubmittingReport] = useState(false);


  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(0)).current;

  const handleSend = async () => {
    if ((!inputText.trim() && !isReplying && !editingMessage) || (isReplying && !inputText.trim())) {
      return;
    }

    // Editing a message
    if (editingMessage) {
      setMessages(messages.map(msg => 
        msg.id === editingMessage.id 
          ? { ...msg, message: inputText, is_edited: true }
          : msg
      ));

      if (editingMessage.id) {
      await editMessage(editingMessage.id, inputText.trim())
      setEditingMessage(null);
      setInputText('');
      }

      // Replying to a message
    } else if (isReplying && replyInfo) {

      if (!replyInfo.id || !id) {
        Alert.alert('Could not send reply', 'Please try again in a moment.');
        return;
      }

      console.log('replying message')
      const savedReply = await replyMessage(replyInfo.id, 'text', inputText.trim(), id)

      if (!savedReply) {
        Alert.alert('Could not send reply', 'Please try again.');
        return;
      }

      setMessages(prev => [...prev, savedReply]);
      setInputText('');
      setReplyInfo(null);
      setIsReplying(false);
      inputRef.current?.focus();

      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);

    // Sending a normal message 
    } else {
      if (id) {
        const savedMessage = await sendMessage(inputText.trim(), 'text', id)

        if (!savedMessage) {
          Alert.alert('Could not send message', 'Please try again.');
          return;
        }
      
        setMessages(prev => [...prev, savedMessage]);


        // Reseting both text and media after sending
        setInputText('');
        setReplyInfo(null);
        setIsReplying(false);
      
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
  }
}   

const getOriginalMessage = (messageId: string) => {
  const foundMessage = messages.find((message) => message.id === messageId);
  return foundMessage?.message ?? 'Original message deleted';
}


const handleReply = (message: Message) => {
  setReplyInfo(message)
  setIsReplying(true)
  inputRef.current?.focus();
};

const handleEdit = (message: Message) => {
  setEditingMessage(message);
  setInputText(message.message);
  setShowContextMenu({ visible: false, message: null, position: { x: 0, y: 0 } });
  inputRef.current?.focus();
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
            <Text style={styles.contactName}>{gameTitle}</Text>
            <Ionicons name="chevron-forward" size={16} color="#111" style={styles.contactNameChevron} />
          </View>
          <Text style={styles.contactSubtitle}>{formatGameSubtitle(game)}</Text>
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
          onPress={() => {
            setReplyInfo(null);
            setIsReplying(false);
          }}
        >
          <Ionicons name="close" size={16} color="#666" />
        </TouchableOpacity>
      </View>
    );
  };

  const renderInput = () => (
    <View style={[styles.inputContainer, { paddingBottom: insets.bottom }]}>
      {editingMessage && (
        <View style={styles.editHeader}>
          <Text style={styles.editHeaderText}>Editing message</Text>
          <TouchableOpacity
            style={styles.cancelEditButton}
            onPress={() => {
              setEditingMessage(null);
              setInputText('');
            }}
          >
            <Text style={styles.cancelEditText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {renderReplyPreview()}

    
      <View style={styles.simpleComposerPill}>
        <View style={inputStyling}>
            <TextInput
              ref={inputRef}
              style={styles.composerInput}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Type..."
              placeholderTextColor="#6B7280"
              multiline={false}
            />
            {inputText.trim() &&
                      <TouchableOpacity
                        style={styles.sendButton}
                        onPress={handleSend}
                        disabled={!inputText.trim() && !editingMessage && !isReplying}
                      >
                        <Ionicons name="send" size={22} color="#22C55E" />
                      </TouchableOpacity>
                   }
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
    flexDirection: 'row',
    alignItems: 'center',
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
    flexShrink: 1,
  },
  contactNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  contactName: {
    color: '#111',
    fontSize: 18,
    fontWeight: '700',
  },
  contactNameChevron: {
    marginLeft: 4,
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
