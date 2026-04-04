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
  ScrollView,
  PermissionsAndroid,
} from 'react-native';
import { Ionicons, MaterialIcons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useNavigation, useRouter } from 'expo-router';
import { PanGestureHandler, GestureHandlerRootView, State } from 'react-native-gesture-handler';
import * as Clipboard from 'expo-clipboard';
const { width, height } = Dimensions.get('window');

type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
type MessageType = 'text' | 'image' | 'video' | 'location' | 'document';

type Message = {
  id: string;
  text: string;
  sender: 'me' | 'other';
  senderName: string;
  senderLevel?: string;
  senderLevelColor?: string;
  senderAvatar?: string;
  time: string;
  status: MessageStatus;
  type: MessageType;
  isEdited?: boolean;
  replyTo?: string;
  mediaUrl?: string;
  fileSize?: string;
  duration?: number;
};

type ReplyInfo = {
  id: string;
  text: string;
  sender: 'me' | 'other';
  senderName: string;
  senderLevel?: string;
  senderLevelColor?: string;
  type: MessageType;
};

const handleGameNavigation = () => {
  router.push('/(tabs)/EventDetails')
}

const GroupChatScreen = () => {
  const router = useRouter();
  const getAvatarColor = (senderId: string) => {
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD'];
    const index = senderId.charCodeAt(0) % colors.length;
    return colors[index];
  };

  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: 'Hey everyone! How\'s it going?',
      sender: 'other',
      senderName: 'Alex',
      senderLevel: 'Advanced',
      senderLevelColor: '#FF6B6B',
      senderAvatar: 'https://picsum.photos/seed/alex/100/100.jpg',
      time: '10:30 AM',
      status: 'read',
      type: 'text',
    },
    {
      id: '2',
      text: 'Pretty good! Just working on some code',
      sender: 'other',
      senderName: 'Sarah',
      senderLevel: 'Intermediate',
      senderLevelColor: '#4ECDC4',
      senderAvatar: 'https://picsum.photos/seed/sarah/100/100.jpg',
      time: '10:32 AM',
      status: 'read',
      type: 'text',
    },
    {
      id: '3',
      text: 'Same here, debugging this React Native app',
      sender: 'me',
      senderName: 'You',
      senderLevel: 'Beginner',
      senderLevelColor: '#45B7D1',
      senderAvatar: 'https://picsum.photos/seed/you/100/100.jpg',
      time: '10:33 AM',
      status: 'read',
      type: 'text',
    },
    {
      id: '4',
      text: 'Nice! What are you building?',
      sender: 'other',
      senderName: 'Mike',
      senderLevel: 'Advanced',
      senderLevelColor: '#FF6B6B',
      senderAvatar: 'https://picsum.photos/seed/mike/100/100.jpg',
      time: '10:35 AM',
      status: 'read',
      type: 'text',
    },
  ]);

  const [inputText, setInputText] = useState('');
  const [isReplying, setIsReplying] = useState(false);
  const [replyInfo, setReplyInfo] = useState<ReplyInfo | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState({
    visible: false,
    message: null as Message | null,
    position: { x: 0, y: 0 },
  });
  const [selectedMedia, setSelectedMedia] = useState<string | null>(null);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [userPhotos, setUserPhotos] = useState<any[]>([]);
  const [userVideos, setUserVideos] = useState<any[]>([]);
  const [mediaPermission, setMediaPermission] = useState<string | null>(null);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [playingVideo, setPlayingVideo] = useState<string | null>(null);
  const [swipeReplyMessage, setSwipeReplyMessage] = useState<Message | null>(null);

  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(0)).current;

  const requestMediaPermission = async () => {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
        {
          title: 'Media Library Permission',
          message: 'Sportiner needs access to your photos and videos to send them in chat.',
          buttonNeutral: 'Ask Me Later',
          buttonNegative: 'Cancel',
          buttonPositive: 'OK',
        },
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } else {
      setMediaPermission('granted');
      return true;
    }
  };

  const loadUserMedia = async () => {
    const hasPermission = await requestMediaPermission();
    if (!hasPermission) {
      Alert.alert('Permission Required', 'Please grant access to your photo library to send media.');
      return;
    }

    try {
      const mockPhotos = Array.from({ length: 12 }, (_, i) => ({
        id: `photo-${i}`,
        uri: `https://picsum.photos/seed/user-photo-${i}/200/200.jpg`,
      }));
      
      const mockVideos = Array.from({ length: 8 }, (_, i) => ({
        id: `video-${i}`,
        uri: `https://sample-videos.com/zip/10/mp4/SampleVideo_1280x720_1mb.mp4`,
      }));
      
      setUserPhotos(mockPhotos);
      setUserVideos(mockVideos);
      setShowMediaPicker(true);
    } catch (error) {
      console.error('Error loading media:', error);
      Alert.alert('Error', 'Failed to load your media.');
    }
  };

  const handleSend = () => {
    if ((!inputText.trim() && !selectedMedia && !isReplying && !editingMessage) || (isReplying && !inputText.trim() && !selectedMedia)) {
      return;
    }

    if (editingMessage) {
      setMessages(messages.map(msg => 
        msg.id === editingMessage.id 
          ? { ...msg, text: inputText, isEdited: true }
          : msg
      ));
      setEditingMessage(null);
    } else {
      const newMessage: Message = {
        id: Date.now().toString(),
        text: inputText,
        sender: 'me',
        senderName: 'You',
        senderLevel: 'Beginner',
        senderLevelColor: '#45B7D1',
        senderAvatar: 'https://picsum.photos/seed/you/100/100.jpg',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: 'sent',
        type: selectedMedia ? (selectedMedia.includes('video') ? 'video' : 'image') : 'text',
        mediaUrl: selectedMedia || undefined,
        replyTo: replyInfo?.id,
      };
      
      setMessages([...messages, newMessage]);
      
      setTimeout(() => {
        setMessages(prev => 
          prev.map(msg => 
            msg.id === newMessage.id 
              ? { ...msg, status: 'delivered' }
              : msg
          )
        );
        
        setTimeout(() => {
          setMessages(prev => 
            prev.map(msg => 
              msg.id === newMessage.id 
                ? { ...msg, status: 'read' }
                : msg
            )
          );
        }, 1000);
      }, 500);
    }

    setInputText('');
    setSelectedMedia(null);
    setReplyInfo(null);
    setIsReplying(false);
    
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const handleReply = (message: Message) => {
    setReplyInfo({
      id: message.id,
      text: message.text,
      sender: message.sender,
      senderName: message.senderName,
      senderLevel: message.senderLevel,
      senderLevelColor: message.senderLevelColor,
      type: message.type,
    });
    setIsReplying(true);
    inputRef.current?.focus();
  };

  const handleEdit = (message: Message) => {
    setEditingMessage(message);
    setInputText(message.text);
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

  const handleSwipeReply = (message: Message) => {
    setSwipeReplyMessage(message);
    handleReply(message);
    

    setTimeout(() => {
      setSwipeReplyMessage(null);
    }, 1000);
  };

  const onGestureEvent = (message: Message) => {
    return (event: any) => {
      const { translationX, state } = event.nativeEvent;
      
      if (state === State.ACTIVE) {
       
        if (translationX > 40) {
          setSwipeReplyMessage(message);
        }
      } else if (state === State.END) {
        if (translationX > 80) { 
          handleSwipeReply(message);
        } else {
          setSwipeReplyMessage(null); 
        }
      } else if (state === State.CANCELLED) {
        setSwipeReplyMessage(null); 
      }
    };
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
    const isMe = item.sender === 'me';
    const repliedMessage = item.replyTo ? messages.find(m => m.id === item.replyTo) : null;
    const isSwipeReplying = swipeReplyMessage?.id === item.id;
    
    return (
      <View style={styles.messageContainer}>
        {!isMe && (
          <View style={styles.messageHeader}>
            <View style={[styles.avatar, { backgroundColor: getAvatarColor(item.sender) }]}>
              <Image source={{ uri: item.senderAvatar }} style={styles.avatarImage} />
            </View>
            <View style={styles.senderInfo}>
              <Text style={styles.senderName}>{item.senderName} · <Text style={[styles.senderLevel, { color: item.senderLevelColor }]}>{item.senderLevel}</Text></Text>
            </View>
          </View>
        )}
        <PanGestureHandler 
          onGestureEvent={onGestureEvent(item)}
          onHandlerStateChange={onGestureEvent(item)}
        >
          <View>
            <TouchableOpacity
              activeOpacity={0.85}
              onLongPress={(e) => handleLongPress(item, e)}
              style={[
                styles.messageBubble,
                isMe ? styles.sentMessage : styles.receivedMessage,
                !isMe && styles.receivedMessageWithAvatar,
                isSwipeReplying && styles.swipeReplyingMessage,
              ]}
            >
              {isSwipeReplying && (
                <View style={styles.swipeReplyIndicator}>
                  <Ionicons name="arrow-undo" size={16} color="#22C55E" />
                  <Text style={styles.swipeReplyText}>Reply</Text>
                </View>
              )}
              {repliedMessage && (
                <View style={styles.messageReplyPreview}>
                  <Text style={styles.messageReplyText}>
                    {`${repliedMessage.senderName}: "${repliedMessage.text}"`}
                  </Text>
                </View>
              )}
              <Text style={[styles.messageText, isMe && styles.sentMessageText]}>{item.text}</Text>
            </TouchableOpacity>
          </View>
        </PanGestureHandler>
      </View>
    );
  };

  const navigation = useNavigation()

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={28} color="#111" />
        </TouchableOpacity>

        <View style={styles.groupAvatar}>
          <Ionicons name="people" size={20} color="#fff" />
        </View>

        <TouchableOpacity onPress={handleGameNavigation} style={styles.contactInfo} >
          <View style={styles.contactNameRow}>
            <Text style={styles.contactName}>Boys Tennis Game</Text>
            <Ionicons name="chevron-forward" size={16} color="#111" style={styles.contactNameChevron} />
          </View>
          <Text style={styles.contactSubtitle}>Tue 7PM @ Cedarvale park</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderReplyPreview = () => {
    if (!replyInfo) return null;
    
    return (
      <View style={styles.replyPreview}>
        <Text style={styles.replyPreviewText}>
          {`Replying to ${replyInfo.senderName}: "${replyInfo.text}"`}
        </Text>
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

      <View style={styles.composerPill}>
        <TouchableOpacity 
          style={styles.composerIconButton}
          onPress={loadUserMedia}
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
          onFocus={() => setShowEmojiPicker(false)}
        />

        {(inputText.trim() || selectedMedia) ? (
          <TouchableOpacity
            style={styles.sendButton}
            onPress={handleSend}
            disabled={!inputText.trim() && !selectedMedia && !editingMessage && !isReplying}
          >
            <Ionicons name="send" size={18} color="#22C55E" />
          </TouchableOpacity>
        ): (null)}
      </View>
      
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
    const menuItems = [
      { id: 'copy', icon: 'copy-outline', iconSet: 'Ionicons', label: 'Copy', color: '#6B7280' },
      ...(message.sender === 'me' ? [{ id: 'edit', icon: 'create-outline', iconSet: 'Ionicons', label: 'Edit', color: '#3B82F6' }] : []),
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
                        copyToClipboard(message.text)
                        Alert.alert('Copied to clipboard', message.text);
                      } else if (item.id === 'delete') {
                        Alert.alert(
                          'Delete message',
                          'Are you sure you want to delete this message?',
                          [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Delete',
                              style: 'destructive',
                              onPress: () => {
                                setMessages(messages.filter(m => m.id !== message.id));
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
            keyExtractor={(item) => item.id}
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
    paddingTop: 50,
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
  receivedMessageWithAvatar: {
    marginLeft: 48,
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
  composerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 24,
    paddingHorizontal: 12,
    height: 46,
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
  replyPreviewText: {
    fontSize: 14,
    color: '#374151',
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
  swipeReplyText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});

export default GroupChatScreen;