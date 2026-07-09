import { useRef, useState } from "react";
import {
  Animated,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";

const COLORS = {
  background: "#F9F7F2",
  surface: "#FFFFFF",
  surfaceContainerLow: "#F4F2ED",
  primary: "#13E776",
  secondary: "#121212",
  textMuted: "#444746",
  error: "#BA1A1A",
};

export default function UserAgreement() {
  const { method, providerName, next } = useLocalSearchParams();
  const [accepted, setAccepted] = useState(false);
  const [showError, setShowError] = useState(false);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const runShake = () => {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, {
        toValue: 1,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: -1,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 1,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 0,
        duration: 50,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleAgree = () => {
    if (!accepted) {
      setShowError(true);
      runShake();
      return;
    }

    if (next === "login") {
      router.replace("/(auth)/login" as never);
      return;
    }

    router.replace({
      pathname: "/(auth)/SignupFlow" as never,
      params: {
        acceptedTerms: "true",
        ...(method ? { method: String(method) } : {}),
        ...(providerName ? { providerName: String(providerName) } : {}),
      },
    });
  };

  const checkboxTranslateX = shakeAnim.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: [-4, 0, 4],
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <View style={styles.closeButton}>
            <Ionicons name="document-text-outline" size={25} color={COLORS.secondary} />
          </View>

          <Text style={styles.logoText}>SPORTINER</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleSection}>
          <View style={styles.metaRow}>
            <View style={styles.legalPill}>
              <Text style={styles.legalPillText}>Legal</Text>
            </View>
            <Text style={styles.updateText}>Update: July 2026</Text>
          </View>

          <Text style={styles.title}>Terms of Use</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.decorativeCircle} />

          <View style={styles.section}>
            <Text style={styles.introText}>
              Welcome to Sportiner. By accessing our tennis community, you agree
              to play by the rules. This is not just legal text; it is our
              community contract.
            </Text>
            <Text style={styles.bodyText}>
              Sportiner helps players find games, join matches, communicate with
              other players, and participate in a respectful sports community. By
              using Sportiner, you agree to use the platform safely, honestly,
              and respectfully.
            </Text>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="shield-checkmark-outline" size={22} color={COLORS.primary} />
              <Text style={styles.sectionTitle}>Zero Tolerance Policy</Text>
            </View>
            <Text style={styles.bodyText}>
              Sportiner has zero tolerance for objectionable content or abusive
              behavior. Users may not post, share, upload, send, or promote
              content that is offensive, hateful, threatening, harassing,
              sexually explicit, discriminatory, violent, spam, unsafe, or
              otherwise inappropriate.
            </Text>
            <Text style={styles.bodyText}>
              Users may not harass, threaten, bully, impersonate, abuse, target,
              or intimidate other players. Accounts that violate these rules may
              have content removed and may be suspended or banned.
            </Text>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="tennisball-outline" size={22} color={COLORS.primary} />
              <Text style={styles.sectionTitle}>Community Guidelines</Text>
            </View>
            <Text style={styles.bodyText}>
              Sportiner is built for respectful tennis players. Good sportsmanship,
              punctuality, honesty, and basic respect are required.
            </Text>

            <View style={styles.guidelineGrid}>
              <View style={styles.guidelineItem}>
                <Text style={styles.standardLabel}>Standard 01</Text>
                <Text style={styles.standardText}>Respect every player.</Text>
              </View>
              <View style={styles.guidelineItem}>
                <Text style={styles.standardLabel}>Standard 02</Text>
                <Text style={styles.standardText}>No harassment or abuse.</Text>
              </View>
              <View style={styles.guidelineItem}>
                <Text style={styles.standardLabel}>Standard 03</Text>
                <Text style={styles.standardText}>No objectionable content.</Text>
              </View>
              <View style={styles.guidelineItem}>
                <Text style={styles.standardLabel}>Standard 04</Text>
                <Text style={styles.standardText}>Report unsafe behavior.</Text>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="flag-outline" size={22} color={COLORS.primary} />
              <Text style={styles.sectionTitle}>Reporting & Enforcement</Text>
            </View>
            <Text style={styles.bodyText}>
              Users can report objectionable content, abusive behavior, unsafe
              conduct, or other violations. Sportiner may review reports, remove
              content, restrict access, suspend accounts, or ban users when needed
              to protect the community.
            </Text>
          </View>

          <View style={styles.waiverSection}>
            <View style={styles.sectionHeader}>
              <Ionicons name="document-text-outline" size={22} color={COLORS.primary} />
              <Text style={styles.waiverTitle}>Liability Waiver</Text>
            </View>
            <Text style={styles.waiverText}>
              By clicking “I Agree,” you voluntarily assume all risks related to
              physical activity. Sportiner is a facilitator and is not liable for
              injuries sustained on third-party courts or during matches organized
              through the platform.
            </Text>
          </View>

          <Text style={styles.footerText}>
            For questions about these terms, contact Sportiner support.
          </Text>
        </View>

        <Pressable
          onPress={() => {
            setAccepted((current) => !current);
            setShowError(false);
          }}
          style={styles.checkboxRow}
        >
          <Animated.View
            style={[
              styles.checkbox,
              accepted && styles.checkboxAccepted,
              showError && styles.checkboxError,
              { transform: [{ translateX: checkboxTranslateX }] },
            ]}
          >
            {accepted ? (
              <Ionicons name="checkmark" size={18} color={COLORS.secondary} />
            ) : null}
          </Animated.View>
          <Text style={styles.checkboxLabel}>
            I have read and agree to the Terms of Use and Community Guidelines
          </Text>
        </Pressable>

        {showError ? (
          <Text style={styles.errorText}>Please accept the terms before continuing.</Text>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          onPress={handleAgree}
          style={({ pressed }) => [
            styles.agreeButton,
            pressed && styles.agreeButtonPressed,
          ]}
        >
          <Text style={styles.agreeButtonText}>I Agree</Text>
          <Ionicons name="arrow-forward" size={18} color={COLORS.secondary} />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    backgroundColor: COLORS.background,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.secondary,
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  closeButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: {
    color: COLORS.secondary,
    fontSize: 24,
    fontWeight: "900",
    fontStyle: "italic",
    letterSpacing: -1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 144,
  },
  titleSection: {
    marginBottom: 24,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  legalPill: {
    backgroundColor: "rgba(19, 231, 118, 0.18)",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
  },
  legalPillText: {
    color: "#005225",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  updateText: {
    color: COLORS.textMuted,
    opacity: 0.7,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  title: {
    color: COLORS.secondary,
    fontSize: 42,
    lineHeight: 44,
    fontWeight: "900",
    fontStyle: "italic",
    letterSpacing: -2,
    textTransform: "uppercase",
  },
  card: {
    position: "relative",
    overflow: "hidden",
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: COLORS.secondary,
    padding: 24,
    shadowColor: COLORS.secondary,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 6,
    marginBottom: 28,
  },
  decorativeCircle: {
    position: "absolute",
    top: -44,
    right: -44,
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: "rgba(19, 231, 118, 0.14)",
  },
  section: {
    marginBottom: 30,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  introText: {
    color: COLORS.secondary,
    fontSize: 15,
    lineHeight: 23,
    fontWeight: "800",
    fontStyle: "italic",
    marginBottom: 12,
  },
  bodyText: {
    color: COLORS.textMuted,
    fontSize: 14,
    lineHeight: 23,
    fontWeight: "500",
    marginBottom: 10,
  },
  sectionTitle: {
    color: COLORS.secondary,
    fontSize: 21,
    fontWeight: "900",
    fontStyle: "italic",
  },
  guidelineGrid: {
    gap: 14,
    marginTop: 8,
  },
  guidelineItem: {
    borderLeftWidth: 2,
    borderLeftColor: COLORS.primary,
    paddingLeft: 14,
    paddingVertical: 3,
  },
  standardLabel: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
    marginBottom: 3,
  },
  standardText: {
    color: COLORS.secondary,
    fontSize: 14,
    fontWeight: "800",
  },
  waiverSection: {
    backgroundColor: COLORS.surfaceContainerLow,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderColor: COLORS.secondary,
    marginHorizontal: -24,
    paddingHorizontal: 24,
    paddingVertical: 22,
    marginBottom: 24,
  },
  waiverTitle: {
    color: COLORS.secondary,
    fontSize: 20,
    fontWeight: "900",
    fontStyle: "italic",
    textTransform: "uppercase",
  },
  waiverText: {
    color: COLORS.secondary,
    fontSize: 13,
    lineHeight: 21,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  footerText: {
    color: COLORS.textMuted,
    opacity: 0.7,
    fontSize: 12,
    lineHeight: 18,
    fontStyle: "italic",
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderWidth: 2,
    borderColor: COLORS.secondary,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxAccepted: {
    backgroundColor: COLORS.primary,
  },
  checkboxError: {
    borderColor: COLORS.error,
  },
  checkboxLabel: {
    flex: 1,
    color: COLORS.secondary,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  errorText: {
    color: COLORS.error,
    fontSize: 12,
    fontWeight: "800",
    marginLeft: 38,
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(249, 247, 242, 0.96)",
    borderTopWidth: 2,
    borderTopColor: COLORS.secondary,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 28,
  },
  agreeButton: {
    height: 56,
    borderRadius: 999,
    backgroundColor: COLORS.primary,
    borderWidth: 2,
    borderColor: COLORS.secondary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: COLORS.secondary,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 5,
  },
  agreeButtonPressed: {
    transform: [{ translateX: 2 }, { translateY: 2 }],
    shadowOffset: { width: 1, height: 1 },
  },
  agreeButtonText: {
    color: COLORS.secondary,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 2.5,
    textTransform: "uppercase",
  },
});