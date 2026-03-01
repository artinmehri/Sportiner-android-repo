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
import { Ionicons, MaterialIcons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useRouter } from 'expo-router';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import * as ImagePicker from 'expo-image-picker'
import { useScrollEventsHandlersDefault } from '@gorhom/bottom-sheet';
import * as Clipboard from 'expo-clipboard';
import Reanimated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';


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
};

type ReplyInfo = {
  id: string;
  text: string;
  sender: 'me' | 'other';
  senderName: string;
  type: MessageType;
  mediaUrl?: string;
};

const navigateToProfile = () => {
  router.push('/(tabs)/profileDetails')
}

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
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: 'Hey there! How are you doing?',
      sender: 'other',
      senderName: 'Behrad',
      senderAvatar: 'https://picsum.photos/seed/behrad/100/100.jpg',
      time: '10:30 AM',
      status: 'read',
      type: 'text',
    },
    {
      id: '2',
      text: "I'm good, thanks for asking! How about you?",
      sender: 'me',
      senderName: 'You',
      senderAvatar: 'https://picsum.photos/seed/you/100/100.jpg',
      time: '10:32 AM',
      status: 'read',
      type: 'text',
    },
    {
      id: '3',
      text: 'I was just working on this new chat UI. What do you think?',
      sender: 'other',
      senderName: 'Behrad',
      senderAvatar: 'https://picsum.photos/seed/behrad/100/100.jpg',
      time: '10:33 AM',
      status: 'read',
      type: 'text',
    },
  ]);

  const [inputText, setInputText] = useState('');
  const [isReplying, setIsReplying] = useState(false);
  const [replyInfo, setReplyInfo] = useState<ReplyInfo | null>(null);
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

  // Image picker function
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
        text: inputText.trim(),
        sender: 'me',
        senderName: 'You',
        senderAvatar: 'https://picsum.photos/seed/you/100/100.jpg',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: 'sent',
        type: selectedMedia ? 'image' : 'text',
        mediaUrl: selectedMedia || undefined,
        replyTo: replyInfo?.id,
      };
      
      setMessages([...messages, newMessage]);

      // Reseting both text and media after sending
      setInputText('')
      setSelectedMedia(null)
      
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
      mediaUrl: message.mediaUrl || undefined,
      sender: message.sender,
      senderName: message.senderName,
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

  const closeContextMenu = () => {
    
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      setShowContextMenu({ visible: false, message: null, position: { x: 0, y: 0 } });
    });
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.push('/(tabs)/inbox')}
        >
          <Ionicons name="chevron-back" size={28} color="#111" />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigateToProfile()}>
          <Image source={{ uri: 'https://picsum.photos/seed/behrad/100/100.jpg' }} style={styles.avatar} />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigateToProfile()} style={styles.contactInfo}>
          <View style={styles.contactNameRow}>
            <Text style={styles.contactName}>Behrad</Text>
            <Ionicons name="chevron-forward" size={16} color="#111" style={styles.contactNameChevron} />
          </View>
          <Text style={styles.contactSubtitle}>Wed · 3PM @ Saint-Louis Park</Text>
        </TouchableOpacity>
      </View>
    </View>
  );


  const renderMessage = ({ item }: { item: Message }) => {
    const isMe = item.sender === 'me';
    const repliedMessage = item.replyTo ? messages.find(m => m.id === item.replyTo) : null;
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
    
            {repliedMessage && (
              <View style={styles.messageReplyPreview}>
                <Text style={styles.messageReplyText}>
                  {repliedMessage.senderName}: "{repliedMessage.text}"
                </Text>
              </View>
            )}
            {item.type === 'image' && (
              <TouchableOpacity
                onPress={() => {
                  if (item.mediaUrl) {
                    setShowImage(item.mediaUrl);
                    setShowFullScreenImage(true);
                  }
                }}
              >
                <Image source={{ uri: item.mediaUrl }} style={styles.messageImage} />
              </TouchableOpacity>
            )}

            {item.text ? (
              <Text style={[styles.messageText, isMe && styles.sentMessageText]}>{item.text}</Text>
            ) : null}
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
  } else if (selectedMedia) {
    inputStyling = styles.inputNMedia;
    // Otherwise if nothing is selected go with simple one
  } else {
    inputStyling = styles.simpleInputPill
  }
 

  const renderReplyPreview = () => {
    if (!replyInfo) return null;
    
    return (
      <View style={styles.replyPreview}>
        {replyInfo.mediaUrl ?     
        <View style={styles.replyWrapper}>
          <View>
            <Text style={styles.replySender}>
                {replyInfo.senderName}
              </Text>
              <Text style={styles.replyPreviewText}>
                  Photo
              </Text>
            </View>
            <Image source={{ uri: replyInfo.mediaUrl}} style={styles.replyImage}/>
          </View>
        :     
        <><Text style={styles.replySender}>
           {replyInfo.senderName}
          </Text>
          <Text style={styles.replyPreviewText}>
          {replyInfo.text}
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
    position: 'fixed',
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

export default ChatScreen;