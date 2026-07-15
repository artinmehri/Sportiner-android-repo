import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

export const REPORT_REASONS = [
  'Harassment or abuse',
  'Hate or discrimination',
  'Sexual content',
  'Threats or unsafe behavior',
  'Spam or scam',
  'Other',
] as const;

type ReportModalProps = {
  visible: boolean;
  title?: string;
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (reason: string, details: string) => Promise<void> | void;
};

export default function ReportModal({
  visible,
  title = 'Submit Report',
  submitting = false,
  onClose,
  onSubmit,
}: ReportModalProps) {
  const [selectedReason, setSelectedReason] = useState<string>(REPORT_REASONS[0]);
  const [details, setDetails] = useState('');

  const handleSubmit = async () => {
    await onSubmit(selectedReason, details.trim());
    setSelectedReason(REPORT_REASONS[0]);
    setDetails('');
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={22} color="#111" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.label}>Reason</Text>
            {REPORT_REASONS.map((reason) => {
              const active = selectedReason === reason;
              return (
                <TouchableOpacity
                  key={reason}
                  style={[styles.reasonRow, active && styles.reasonRowActive]}
                  onPress={() => setSelectedReason(reason)}
                >
                  <View style={[styles.radio, active && styles.radioActive]}>
                    {active && <View style={styles.radioDot} />}
                  </View>
                  <Text style={styles.reasonText}>{reason}</Text>
                </TouchableOpacity>
              );
            })}

            <Text style={[styles.label, styles.detailsLabel]}>Details optional</Text>
            <TextInput
              value={details}
              onChangeText={setDetails}
              placeholder="Add context for the moderation team"
              placeholderTextColor="#6B7280"
              multiline
              style={styles.detailsInput}
              textAlignVertical="top"
            />

            <TouchableOpacity
              disabled={submitting}
              style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
              onPress={handleSubmit}
            >
              <Text style={styles.submitText}>{submitting ? 'Submitting...' : 'Submit Report'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  card: {
    maxHeight: '86%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 28,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 13,
    fontWeight: '800',
    color: '#374151',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 8,
  },
  reasonRowActive: {
    borderColor: '#19E675',
    backgroundColor: '#E8FCF1',
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#9CA3AF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  radioActive: {
    borderColor: '#19E675',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#19E675',
  },
  reasonText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#111',
  },
  detailsLabel: {
    marginTop: 8,
  },
  detailsInput: {
    minHeight: 104,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    padding: 14,
    fontSize: 15,
    color: '#111',
    marginBottom: 16,
  },
  submitButton: {
    height: 52,
    borderRadius: 999,
    backgroundColor: '#19E675',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.55,
  },
  submitText: {
    color: '#002000',
    fontSize: 15,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
