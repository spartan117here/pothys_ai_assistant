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
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ScrollView
} from 'react-native';
import { useAICopilotQuery, useAIConversations, useAIConversationDetails } from '../../hooks/useAI';
import { COLORS } from '../../theme/colors';

const QUICK_PROMPTS = [
  "Summarize today's reports",
  "Which branch had the lowest sales?",
  "Who hasn't uploaded today's report?",
  "Compare Chennai and Coimbatore sales",
  "Show active inventory shortages",
];

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  retrieved_sources?: string[] | null;
}

export default function AICopilotScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  
  // RAG source details modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [selectedSourceContent, setSelectedSourceContent] = useState<string | null>(null);

  const flatListRef = useRef<FlatList>(null);
  
  const queryMutation = useAICopilotQuery();
  const { data: conversations, refetch: refetchConvs } = useAIConversations();
  const { data: convDetails, refetch: refetchDetails } = useAIConversationDetails(activeConvId || '');

  // Load message history if thread is switched
  useEffect(() => {
    if (convDetails) {
      setMessages(convDetails.messages);
    }
  }, [convDetails]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages]);

  const handleSendMessage = async (textToSend: string) => {
    const text = textToSend.trim();
    if (!text) return;

    setInputText('');

    // Append user query message immediately to list for smooth UX response
    const userMsgId = Math.random().toString();
    const userMsg: Message = { id: userMsgId, role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);

    // Trigger API call
    queryMutation.mutate(
      {
        conversation_id: activeConvId || undefined,
        content: text
      },
      {
        onSuccess: (data) => {
          // If a new thread was created, save the thread ID
          if (!activeConvId) {
            setActiveConvId(data.conversation_id);
            refetchConvs();
          }
          
          // Append assistant response
          const assistantMsg: Message = {
            id: data.id || Math.random().toString(),
            role: 'assistant',
            content: data.content,
            retrieved_sources: data.retrieved_sources
          };
          setMessages(prev => [...prev, assistantMsg]);
        },
        onError: (err: any) => {
          const assistantMsg: Message = {
            id: Math.random().toString(),
            role: 'assistant',
            content: `Error: ${err.response?.data?.detail || 'Failed to complete RAG request. Please check connection.'}`,
            retrieved_sources: []
          };
          setMessages(prev => [...prev, assistantMsg]);
        }
      }
    );
  };

  const handleShowCitationDetail = (content: string, index: number) => {
    setSelectedSource(`Source ${index + 1}`);
    setSelectedSourceContent(
      `[Vector Database Audit Details - RAG Ingest Logs]\n` +
      `Matching chunk for [Source ${index + 1}] details:\n\n` +
      `Raw Extracted Content Chunk:\n` +
      `"${content}"`
    );
    setModalVisible(true);
  };

  const renderMessageBubble = ({ item }: { item: Message }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.bubbleWrapper, isUser ? styles.userWrapper : styles.assistantWrapper]}>
        <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
          <Text style={[styles.bubbleText, isUser ? styles.userText : styles.assistantText]}>
            {item.content}
          </Text>
          
          {/* Render Citation Chips if available */}
          {!isUser && item.retrieved_sources && item.retrieved_sources.length > 0 && (
            <View style={styles.citationsContainer}>
              <Text style={styles.citationsLabel}>Sources used: </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {item.retrieved_sources.map((source, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.citationChip}
                    onPress={() => handleShowCitationDetail(source, idx)}
                  >
                    <Text style={styles.citationChipText}>{`Source ${idx + 1}`}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Pothys AGM AI Copilot</Text>
        <Text style={styles.headerStatus}>● Online (Strict RAG-Restricted Mode)</Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardContainer}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Active conversation messages list */}
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessageBubble}
          keyExtractor={item => item.id}
          style={{ flex: 1 }}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>Secure AI Operations Room</Text>
              <Text style={styles.emptySub}>
                Ask me questions regarding today's sales, target accomplishments, pending branch uploads, or inventory remarks.
              </Text>
            </View>
          }
        />

        {/* Loading Spinner for pending response */}
        {queryMutation.isPending && (
          <View style={styles.typingContainer}>
            <ActivityIndicator color={COLORS.primary} size="small" />
            <Text style={styles.typingText}>Searching vector DB and summarizing...</Text>
          </View>
        )}

        {/* Quick Action Prompt tags */}
        {messages.length === 0 && (
          <View style={styles.quickPromptsSection}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickPromptsScroll}>
              {QUICK_PROMPTS.map((prompt, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.promptTag}
                  onPress={() => handleSendMessage(prompt)}
                >
                  <Text style={styles.promptTagText}>{prompt}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Input box section */}
        <View style={styles.inputArea}>
          <TextInput
            style={styles.input}
            placeholder="Ask AI a domain-restricted business query..."
            placeholderTextColor={COLORS.textMuted}
            value={inputText}
            onChangeText={setInputText}
            editable={!queryMutation.isPending}
          />
          <TouchableOpacity
            style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
            onPress={() => handleSendMessage(inputText)}
            disabled={!inputText.trim() || queryMutation.isPending}
          >
            <Text style={styles.sendButtonText}>Send</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* RAG audit details modal drawer */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>RAG VECTOR AUDIT TRANSPARENCY</Text>
            <ScrollView style={styles.modalScroll}>
              <Text style={styles.modalText}>{selectedSourceContent}</Text>
            </ScrollView>
            <TouchableOpacity
              style={styles.closeModalButton}
              onPress={() => setModalVisible(false)}
            >
              <Text style={styles.closeModalButtonText}>Close Audit Panel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  headerStatus: {
    fontSize: 10,
    color: COLORS.primary,
    marginTop: 4,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  keyboardContainer: {
    flex: 1,
  },
  messageList: {
    padding: 20,
    paddingBottom: 10,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 100,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.primary,
    marginBottom: 12,
  },
  emptySub: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  bubbleWrapper: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  userWrapper: {
    justifyContent: 'flex-end',
  },
  assistantWrapper: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '80%',
    padding: 14,
    borderRadius: 16,
  },
  userBubble: {
    backgroundColor: COLORS.surfaceAlt,
    borderBottomRightRadius: 2,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  assistantBubble: {
    backgroundColor: COLORS.surface,
    borderBottomLeftRadius: 2,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 22,
  },
  userText: {
    color: COLORS.text,
  },
  assistantText: {
    color: COLORS.text,
  },
  citationsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderColor: COLORS.border,
  },
  citationsLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  citationChip: {
    backgroundColor: COLORS.primary + '1F',
    borderWidth: 1,
    borderColor: COLORS.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginRight: 6,
  },
  citationChipText: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: '700',
  },
  typingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  typingText: {
    color: COLORS.primary,
    fontSize: 12,
    marginLeft: 8,
    fontWeight: '600',
  },
  quickPromptsSection: {
    paddingVertical: 8,
    borderTopWidth: 1,
    borderColor: COLORS.border,
  },
  quickPromptsScroll: {
    paddingHorizontal: 20,
  },
  promptTag: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  promptTagText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  inputArea: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.text,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    fontSize: 15,
    marginRight: 12,
  },
  sendButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    color: COLORS.textOnPrimary,
    fontWeight: '700',
    fontSize: 15,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    maxHeight: '60%',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
    letterSpacing: 2,
    marginBottom: 16,
    textAlign: 'center',
  },
  modalScroll: {
    marginBottom: 20,
  },
  modalText: {
    color: COLORS.text,
    fontSize: 14,
    lineHeight: 22,
  },
  closeModalButton: {
    backgroundColor: COLORS.surfaceAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  closeModalButtonText: {
    color: COLORS.textSecondary,
    fontWeight: '700',
    fontSize: 15,
  },
});
