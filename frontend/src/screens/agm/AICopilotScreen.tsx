import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAICopilotQuery, useAIConversations, useAIConversationDetails } from '../../hooks/useAI';
import { useAuthStore } from '../../store/authStore';
import { COLORS } from '../../theme/colors';

const SUGGESTED_PROMPTS = [
  "Which branches haven't submitted today's report?",
  'Compare T. Nagar and Coimbatore performance.',
  "Show today's operational alerts.",
  "Summarize yesterday's business.",
  'Which branch had the highest sales?',
];

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  retrieved_sources?: string[] | null;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

export default function AICopilotScreen() {
  const { user } = useAuthStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedSourceContent, setSelectedSourceContent] = useState<string | null>(null);

  const flatListRef = useRef<FlatList>(null);
  const headerOpacity = useRef(new Animated.Value(0)).current;

  const queryMutation = useAICopilotQuery();
  const { data: conversations, refetch: refetchConvs } = useAIConversations();
  const { data: convDetails } = useAIConversationDetails(activeConvId || '');

  useEffect(() => {
    if (convDetails) {
      setMessages(convDetails.messages);
    }
  }, [convDetails]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages]);

  useEffect(() => {
    Animated.timing(headerOpacity, {
      toValue: 1,
      duration: 700,
      useNativeDriver: true,
    }).start();
  }, []);

  const handleSend = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    setInputText('');
    const userMsg: Message = { id: Math.random().toString(), role: 'user', content: trimmed };
    setMessages(prev => [...prev, userMsg]);

    queryMutation.mutate(
      { conversation_id: activeConvId || undefined, content: trimmed },
      {
        onSuccess: (data) => {
          if (!activeConvId) {
            setActiveConvId(data.conversation_id);
            refetchConvs();
          }
          const assistantMsg: Message = {
            id: data.id || Math.random().toString(),
            role: 'assistant',
            content: data.content,
            retrieved_sources: data.retrieved_sources,
          };
          setMessages(prev => [...prev, assistantMsg]);
        },
        onError: (err: any) => {
          const assistantMsg: Message = {
            id: Math.random().toString(),
            role: 'assistant',
            content: `⚠️ ${err.response?.data?.detail || 'Unable to process request. Please check connection.'}`,
            retrieved_sources: [],
          };
          setMessages(prev => [...prev, assistantMsg]);
        },
      }
    );
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.msgWrapper, isUser ? styles.msgWrapperUser : styles.msgWrapperAssistant]}>
        {!isUser && (
          <View style={styles.avatarDot}>
            <Text style={styles.avatarDotText}>✨</Text>
          </View>
        )}
        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
          <Text style={[styles.bubbleText, isUser ? styles.bubbleTextUser : styles.bubbleTextAssistant]}>
            {item.content}
          </Text>

          {/* Citation Chips */}
          {!isUser && item.retrieved_sources && item.retrieved_sources.length > 0 && (
            <View style={styles.sourcesRow}>
              <Text style={styles.sourcesLabel}>Sources: </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {item.retrieved_sources.map((src, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.sourceChip}
                    onPress={() => {
                      setSelectedSourceContent(
                        `[RAG Source ${idx + 1}]\n\n${src}`
                      );
                      setModalVisible(true);
                    }}
                  >
                    <Text style={styles.sourceChipText}>⟨ {idx + 1} ⟩</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      </View>
    );
  };

  const showEmpty = messages.length === 0;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardContainer}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Chat list */}
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={item => item.id}
          style={{ flex: 1 }}
          contentContainerStyle={showEmpty ? styles.emptyContent : styles.msgContent}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <Animated.View style={[styles.emptyContainer, { opacity: headerOpacity }]}>
              {/* Logo / Brand */}
              <View style={styles.emptyLogo}>
                <Text style={styles.emptyLogoIcon}>✨</Text>
              </View>
              <Text style={styles.emptyTitle}>Pothys AGM AI Copilot</Text>
              <Text style={styles.emptyGreeting}>{getGreeting()}, {user?.full_name?.split(' ')[0] || 'Sir'}.</Text>
              <Text style={styles.emptySubtitle}>How can I assist you today?</Text>

              {/* Suggested prompts */}
              <View style={styles.suggestionsContainer}>
                {SUGGESTED_PROMPTS.map((prompt, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.suggestionCard}
                    onPress={() => handleSend(prompt)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.suggestionText}>{prompt}</Text>
                    <Text style={styles.suggestionArrow}>›</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Animated.View>
          }
        />

        {/* Typing indicator */}
        {queryMutation.isPending && (
          <View style={styles.typingBar}>
            <View style={styles.typingDots}>
              <TypingDot delay={0} />
              <TypingDot delay={200} />
              <TypingDot delay={400} />
            </View>
            <Text style={styles.typingText}>Copilot is thinking...</Text>
          </View>
        )}

        {/* Input area */}
        <View style={styles.inputArea}>
          <TextInput
            style={styles.input}
            placeholder="Ask a business question..."
            placeholderTextColor={COLORS.textMuted}
            value={inputText}
            onChangeText={setInputText}
            editable={!queryMutation.isPending}
            multiline
            maxLength={500}
            onSubmitEditing={() => handleSend(inputText)}
            returnKeyType="send"
            blurOnSubmit
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!inputText.trim() || queryMutation.isPending) && styles.sendBtnDisabled]}
            onPress={() => handleSend(inputText)}
            disabled={!inputText.trim() || queryMutation.isPending}
            activeOpacity={0.8}
          >
            <Text style={styles.sendBtnText}>↑</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Source detail modal */}
      <Modal
        animationType="slide"
        transparent
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>RAG Source Reference</Text>
            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              <Text style={styles.modalBody}>{selectedSourceContent}</Text>
            </ScrollView>
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setModalVisible(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.modalCloseBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function TypingDot({ delay }: { delay: number }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 400, delay, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 400, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <Animated.View
      style={[
        styles.typingDot,
        { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }] },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  keyboardContainer: {
    flex: 1,
  },
  emptyContent: {
    flexGrow: 1,
  },
  msgContent: {
    padding: 16,
    paddingBottom: 8,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 40,
  },
  emptyLogo: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.surfaceAlt,
    borderWidth: 1,
    borderColor: COLORS.primary + '50',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
  },
  emptyLogoIcon: {
    fontSize: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: 0.3,
    marginBottom: 8,
  },
  emptyGreeting: {
    fontSize: 16,
    color: COLORS.primary,
    fontWeight: '600',
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 32,
  },
  suggestionsContainer: {
    width: '100%',
    gap: 10,
  },
  suggestionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  suggestionText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  suggestionArrow: {
    fontSize: 18,
    color: COLORS.primary,
    fontWeight: '300',
    marginLeft: 8,
  },
  msgWrapper: {
    flexDirection: 'row',
    marginBottom: 16,
    alignItems: 'flex-end',
  },
  msgWrapperUser: {
    justifyContent: 'flex-end',
  },
  msgWrapperAssistant: {
    justifyContent: 'flex-start',
    gap: 10,
  },
  avatarDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primary + '20',
    borderWidth: 1,
    borderColor: COLORS.primary + '40',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarDotText: {
    fontSize: 14,
  },
  bubble: {
    maxWidth: '80%',
    borderRadius: 18,
    padding: 14,
  },
  bubbleUser: {
    backgroundColor: COLORS.surfaceAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.primary + '30',
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 22,
  },
  bubbleTextUser: {
    color: COLORS.text,
  },
  bubbleTextAssistant: {
    color: COLORS.text,
  },
  sourcesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderColor: COLORS.border,
  },
  sourcesLabel: {
    fontSize: 10,
    color: COLORS.textSecondary,
    fontWeight: '600',
    marginRight: 6,
  },
  sourceChip: {
    backgroundColor: COLORS.primary + '18',
    borderWidth: 1,
    borderColor: COLORS.primary + '40',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    marginRight: 6,
  },
  sourceChipText: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: '700',
  },
  typingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: 10,
  },
  typingDots: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
  },
  typingDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.primary,
  },
  typingText: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: '500',
  },
  inputArea: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignItems: 'flex-end',
    gap: 10,
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.text,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    borderRadius: 24,
    fontSize: 15,
    maxHeight: 120,
    lineHeight: 20,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
  sendBtnDisabled: {
    opacity: 0.4,
    shadowOpacity: 0,
  },
  sendBtnText: {
    color: COLORS.textOnPrimary,
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 22,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '60%',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalScroll: {
    marginBottom: 20,
    maxHeight: 300,
  },
  modalBody: {
    color: COLORS.text,
    fontSize: 14,
    lineHeight: 22,
  },
  modalCloseBtn: {
    backgroundColor: COLORS.surfaceAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalCloseBtnText: {
    color: COLORS.textSecondary,
    fontWeight: '700',
    fontSize: 14,
  },
});
