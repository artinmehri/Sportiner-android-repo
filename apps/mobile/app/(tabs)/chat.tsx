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
  Modal,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import * as ImagePicker from 'expo-image-picker'
import * as Clipboard from 'expo-clipboard';
import Reanimated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { deleteMessage, editMessage, findOtherPlayer, getGameInfo, getMessages, replyMessage, sendMessage } from '@/context/ChatContext';
import { getCurrentUserId, getUser, } from '@/context/AuthContext';
import { formatGameSubtitle, type GameRow } from '@/context/GameContext';
import { Timestamp } from 'react-native-reanimated/lib/typescript/commonTypes';
const { width, height } = Dimensions.get('window');

const DEFAULT_AVATAR =
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100&q=80';

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

const SWIPE_THRESHOLD = 80;

type SwipeableMessageProps = {
  message: Message;
  onReply: (message: Message) => void;
  onSwipeProgress?: (message: Message | null) => void;
  children: React.ReactNode;
};


const SwipeableMessage = ({ message, onReply, onSwipeProgress, children }: SwipeableMessageProps) => {
  const translateX = useSharedValue(0);

  const panGesture = Gesture.Pan()
    .activeOffsetX(20)
    .onUpdate((e) => {
      if (e.translationX >= 0) {
        translateX.value = e.translationX;
        if (e.translationX > 20 && onSwipeProgress) {
          runOnJS(onSwipeProgress)(message);
        }
      }
    })
    .onEnd((e) => {
      if (e.translationX > SWIPE_THRESHOLD) {
        runOnJS(onReply)(message);
      }
      translateX.value = withTiming(0, { duration: 200 });
      if (onSwipeProgress) {
        runOnJS(onSwipeProgress)(null);
      }
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

// Copy to clipboard function
const copyToClipboard = async (message: any) => {
  await Clipboard.setStringAsync(message)
}


const ChatScreen = () => {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [game, setGame] = useState<GameRow | null>(null);
  const [otherUserId, setOtherUserId] = useState('');
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('');
  const [currentUserId, setCurrentUserId] = useState()
  const [userNames, setUserNames] = useState<Record<string, string>>({});


  useEffect(() => {
    const loadUserNames = async () => {
      const uniqueUserIds = [...new Set(messages.map(m => m.sender_id))];
  
      const missingUserIds = uniqueUserIds.filter(
        id => !userNames[id]
      );
  
      if (missingUserIds.length === 0) return;
  
      const users = await Promise.all(
        missingUserIds.map(id => getUser(id))
      );
  
      const newNames: Record<string, string> = {};
      users.forEach(user => {
        if (user) {
          newNames[user.id] = user.name;
        }
      });
  
      setUserNames(prev => ({
        ...prev,
        ...newNames,
      }));
    };
  
    loadUserNames();
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
        console.log(gameRow)
        setGame(gameRow ?? null);
      }

      const otherPlayerId = await findOtherPlayer(id);
      if (cancelled || !otherPlayerId) return;

      const otherPlayer = await getUser(otherPlayerId);
      if (cancelled || !otherPlayer) return;

      setOtherUserId(otherPlayer.id);
      setName(otherPlayer.name);
      setAvatar(otherPlayer.profile_picture ?? DEFAULT_AVATAR);

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
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);


  const navigateToProfile = () => {
    if (!otherUserId) return;
    router.push({ pathname: "/(tabs)/profileDetails", params: { id: otherUserId } });
  };


  const [inputText, setInputText] = useState('');
  const [isReplying, setIsReplying] = useState(false);
  const [replyInfo, setReplyInfo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [showContextMenu, setShowContextMenu] = useState({
    visible: false,
    message: null as Message | null,
    position: { x: 0, y: 0 },
  });
  const [selectedMedia, setSelectedMedia] = useState<string | null>(null);
  const [showFullScreenImage, setShowFullScreenImage] = useState(false);
  const [showImage, setShowImage] = useState<string | null>(null);
  const [swipeReplyMessage, setSwipeReplyMessage] = useState<Message | null>(null);

  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(0)).current;

  const pickImgae = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 1
    });

    if (!result.canceled) {
      setSelectedMedia(result.assets[0].uri)
      console.log(result)
    } else {
      alert("You did not select any image or gave any permission, nope, thats what bad boys do, don't be a bad boy")
    }
  }


  const handleSend = async () => {
    if ((!inputText.trim() && !selectedMedia && !isReplying && !editingMessage) || (isReplying && !inputText.trim() && !selectedMedia)) {
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

    if (currentUserId && replyInfo?.id && id) {
      console.log('replying message')
      await replyMessage(replyInfo.id, 'text', inputText.trim(), id)
      setIsReplying(false);
      inputRef.current?.focus();
    }

    if (currentUserId) {
    const newReply: Message = {
      sender_id: currentUserId,
      message: inputText.trim(),
      type: 'text',
      reply_to: replyInfo.id,
      is_reply: true,
    };

    setMessages([...messages, newReply]);
  }

    setInputText('');
    setSelectedMedia(null);
    setReplyInfo(null);
    setIsReplying(false);
    setSwipeReplyMessage(null); 


    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);

    // Sending a normal message 
    } else {
      if (currentUserId) {
      const newMessage: Message = {
        sender_id: currentUserId,
        message: inputText.trim(),
        type: 'text'
      };
    
      if (id) {
      await sendMessage(inputText.trim(), 'text', id)
      }
      
      setMessages([...messages, newMessage]);


      // Reseting both text and media after sending
      setInputText('');
      setSelectedMedia(null);
      setReplyInfo(null);
      setIsReplying(false);
      
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    };
  }
}   

  const getOriginalMessage = (messageId: string) => {
    const foundMessage = messages.find((message) => message.id === messageId);
    return foundMessage?.message ?? 'Original message deleted';
  }

  const handleReply = (message: Message) => {
    setSwipeReplyMessage(null)
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

  const closeContextMenu = () => {
    
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      setShowContextMenu({ visible: false, message: null, position: { x: 0, y: 0 } });
    });
  };

  const navigation = useNavigation();


  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="chevron-back" size={28} color="#111" />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigateToProfile()}>
          <Image source={{ uri: avatar }} style={styles.avatar} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => navigateToProfile()}
          style={styles.contactInfo}
        >
          <View style={styles.contactNameRow}>
            <Text style={styles.contactName}>{name}</Text>
            <Ionicons name="chevron-forward" size={16} color="#111" style={styles.contactNameChevron} />
          </View>
          <Text style={styles.contactSubtitle}>{formatGameSubtitle(game)}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );


  const renderMessage = ({ item }: { item: Message }) => {
    const isMe = item.sender_id === currentUserId;
    const repliedMessage = item.is_reply
    const isSwipeReplying = swipeReplyMessage?.id === item.id;

    return (
      <SwipeableMessage
        message={item}
        onReply={handleReply}
        onSwipeProgress={setSwipeReplyMessage}
      >

        
        <View style={styles.messageWrapper}>


        {isSwipeReplying && (
                <View style={styles.swipeReplyIndicator}>
                  <Ionicons style={styles.swipeReplyIcon} name="arrow-undo" size={30} color="#22C55E" />
                </View>
            )}


          <TouchableOpacity
            onLongPress={(e) => handleLongPress(item, e)}
            style={[
              styles.messageBubble,
              isMe ? styles.sentMessage : styles.receivedMessage,
              isSwipeReplying && styles.swipeReplyingMessage,
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
            {item.type === 'image' && (
              <TouchableOpacity
                onPress={() => {
                  if (item.type === 'image' && item.image) {
                    setShowImage(item.image);
                    setShowFullScreenImage(true);
                  }
                }}
              >
                <Image source={{ uri: item.image }} style={styles.messageImage} />
              </TouchableOpacity>
            )}

            {item.type === 'text' ? (
              <Text style={[styles.messageText, isMe && styles.sentMessageText]}>{item.message}</Text>
            ) : null}

            {item.is_edited && (
                  <Text style={[styles.editedLabel, isMe && styles.editedLabelSent]}>edited</Text>
            )}

          </TouchableOpacity>
        </View>
      </SwipeableMessage>
    );
  };

  let inputStyling;
  if (inputText) {
    inputStyling = styles.inputPill;
  } else if (selectedMedia) {
    inputStyling = styles.inputNMedia;
  } else {
    inputStyling = styles.simpleInputPill
  }
 

  const renderReplyPreview = () => {
    if (!replyInfo) return null;
    
    return (
      <View style={styles.replyPreview}>
        {replyInfo.image ?     
        <View style={styles.replyWrapper}>
          <View>
            <Text style={styles.replySender}>
              {userNames[replyInfo.sender_id] || 'User'}              </Text>
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

    
      <View style={selectedMedia ? styles.composerPill: styles.simpleComposerPill}>

        {selectedMedia && (
          <View style={styles.mediaPreview}>
            {selectedMedia.includes('video') ? (
              <View style={styles.videoPreview}>
                <Image source={{ uri: 'https://picsum.photos/seed/video-thumb/100/100.jpg' }} style={styles.mediaThumbnail} />
                <Ionicons name="videocam" size={16} color="#666" style={styles.mediaIcon} />
              </View>
            ) : (
              <View style={styles.imagePreview}>
                <Image source={{ uri: selectedMedia }} style={styles.mediaThumbnail} />
                <TouchableOpacity 
                  style={styles.removeMediaButton}
                  onPress={() => setSelectedMedia(null)}
                >
                  <Ionicons name="close" size={16} color="#fff" />
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}


        <View style={inputStyling}>
            <TouchableOpacity 
              style={styles.composerIconButton}
              onPress={pickImgae}
            >
              <Ionicons name="image-outline" size={20} color="#111" />
            </TouchableOpacity>

            <TextInput
              ref={inputRef}
              style={styles.composerInput}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Type..."
              placeholderTextColor="#6B7280"
              multiline={false}
            />
            {(inputText.trim() || selectedMedia) &&
                      <TouchableOpacity
                        style={styles.sendButton}
                        onPress={handleSend}
                        disabled={!inputText.trim() && !selectedMedia && !editingMessage && !isReplying}
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
    
    const message = showContextMenu.message;
    const menuItems = [
      { id: 'copy', icon: 'copy-outline', iconSet: 'Ionicons', label: 'Copy', color: '#6B7280' },
      ...(message.sender_id === currentUserId ? [{ id: 'edit', icon: 'create-outline', iconSet: 'Ionicons', label: 'Edit', color: '#3B82F6' }] : []),
      { id: 'delete', icon: 'trash-outline', iconSet: 'Ionicons', label: 'Delete', color: '#EF4444' },
      { id: 'pin', icon: 'pin-outline', iconSet: 'Ionicons', label: 'Pin', color: '#F59E0B' },
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
                                await deleteMessage(message.id)
                                setMessages(prev => prev.filter(m => m.id !== message.id));
                                }
                              },
                            },
                          ]
                        );
                      } else if (item.id === 'pin') {
                        Alert.alert('Message pinned');
                      }
                      setShowContextMenu({ visible: false, message: null, position: { x: 0, y: 0 } });
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
              length: 80, 
              offset: 80 * index,
              index,
            })}
          />
        </TouchableWithoutFeedback>
        
        {renderInput()}
        {renderContextMenu()}

        <Modal
        visible={showFullScreenImage}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowFullScreenImage(false)}
      >
        <View style={styles.modalContainer}>
          <TouchableOpacity 
            style={styles.closeButton} 
            onPress={() => setShowFullScreenImage(false)}
          >
            <Ionicons name="close" size={28} color="white" />
          </TouchableOpacity>
          {showImage && (
            <Image 
              source={{ uri: showImage }} 
              style={styles.fullScreenImage} 
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>
    
      </KeyboardAvoidingView>
    </GestureHandlerRootView>
    );
  }

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
    maxHeight: '100%',
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
  editedLabel: {
    fontSize: 11,
    color: 'rgba(0, 0, 0, 0.35)',
    marginTop: 3,
    alignSelf: 'flex-end',
  },
  editedLabelSent: {
    color: 'rgba(255, 255, 255, 0.55)',
  },
  sentMessageText: {
    color: '#fff',
  },
  messageImage: {
    width: 200,
    height: 300,
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
    alignSelf: 'flex-start',
    marginLeft: 1,
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
  mediaPickerContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  mediaPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  mediaPickerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111',
  },
  mediaPickerContent: {
    flex: 1,
  },
  mediaSection: {
    marginBottom: 20,
  },
  mediaSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
    marginHorizontal: 20,
    marginBottom: 10,
  },
  mediaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 10,
  },
  mediaItem: {
    width: '33.33%',
    height: 120,
    padding: 5,
  },
  videoOverlay: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -8 }, { translateY: -8 }],
    backgroundColor: 'rgba(0,0,0,0.6)',
    width: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  zoomContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoomCloseButton: {
    position: 'absolute',
    top: 60,
    right: 20,
    zIndex: 1,
  },
  zoomScrollView: {
    flex: 1,
    width: '100%',
  },
  zoomContentContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoomedImage: {
    width: '100%',
    height: '100%',
  },
  
  videoPlayerContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoCloseButton: {
    position: 'absolute',
    top: 60,
    right: 20,
    zIndex: 1,
  },
  videoPlayerPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoPlayerText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 10,
  },
  videoPlayerSubtext: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    marginTop: 5,
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
  // Input container styles
  inputContainer: {
    backgroundColor: '#fff',
    paddingTop: 8,
    paddingHorizontal: 14,
  },
  composerPill: {
    flexDirection: 'column',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 24,
    paddingHorizontal: 12,
    height: 112,
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
    marginTop: 1,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: -10
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
  contextMenuText: {
    fontSize: 15,
    color: '#111',
    fontWeight: '500',
  },
  messageWrapper: {
    flexDirection: 'row'
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
    flexDirection: 'row',
    marginRight: 10,
    justifyContent: 'center',
    marginTop: '3%'
  },
  swipeReplyIcon: {
    color: '#19E675',
    fontWeight: '600',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'black',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 60,
    right: 20,
    zIndex: 1,
  },
  fullScreenImage: {
    width: '100%',
    height: '100%',
  },
});

export default ChatScreen