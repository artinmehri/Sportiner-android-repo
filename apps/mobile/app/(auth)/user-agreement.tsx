import { useRef, useState } from "react";
import {
  Alert,
  Animated,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { supabase } from "@/context/AuthContext";
import { LEGAL_LAST_UPDATED, LEGAL_LINKS } from "@/constants/legal";
import {
  acceptTermsLocally,
  persistTermsAcceptanceForUser,
} from "@/lib/termsAcceptance";
import {
  logOnboardingError,
  onboardingErrorCopy,
  OnboardingFlowError,
  providerFromMethod,
  toOnboardingError,
} from "@/lib/onboardingErrors";

const COLORS = {
  background: "#F9F7F2",
  surface: "#FFFFFF",
  surfaceContainerLow: "#F4F2ED",
  primary: "#13E776",
  secondary: "#121212",
  textMuted: "#444746",
  error: "#BA1A1A",
};

const legalActions = [
  {
    label: "Terms of Use",
    icon: "document-text-outline" as const,
    url: LEGAL_LINKS.terms,
  },
  {
    label: "Privacy Policy",
    icon: "lock-closed-outline" as const,
    url: LEGAL_LINKS.privacy,
  },
  {
    label: "Community Guidelines",
    icon: "people-outline" as const,
    url: LEGAL_LINKS.communityGuidelines,
  },
  {
    label: "Contact Support",
    icon: "mail-outline" as const,
    url: LEGAL_LINKS.supportMailto,
  },
];

export default function UserAgreement() {
  const { method, providerName, providerEmail, next, resumeStep } = useLocalSearchParams();
  const [accepted, setAccepted] = useState(false);
  const [showError, setShowError] = useState(false);
  const [savingAgreement, setSavingAgreement] = useState(false);
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

  const handleAgree = async () => {
    if (!accepted) {
      setShowError(true);
      runShake();
      return;
    }

    if (savingAgreement) return;

    const provider = providerFromMethod(method);
    const requiresUser = next === 'tabs' || provider === 'google' || provider === 'apple';
    setSavingAgreement(true);

    try {
      const { data: authData, error: userError } = await supabase.auth.getUser();
      const userId = authData.user?.id ?? null;

      if (requiresUser && (userError || !userId)) {
        throw toOnboardingError(
          { failure: 'terms_save', provider, source: 'terms.get_user' },
          userError ?? new Error('Missing authenticated user')
        );
      }

      await acceptTermsLocally(userId);

      if (next === "signup") {
        router.replace("/(auth)/SignUp" as never);
        return;
      }

      if (next === "login") {
        router.replace("/(auth)/login" as never);
        return;
      }

      if (next === "tabs") {
        if (!userId || !(await persistTermsAcceptanceForUser(userId))) {
          throw new OnboardingFlowError({
            failure: 'terms_save',
            provider,
            source: 'terms.users.persist',
          });
        }

        router.replace("/(tabs)" as never);
        return;
      }

      if (next === 'onboarding') {
        router.replace({
          pathname: "/(auth)/SignupFlow" as never,
          params: {
            ...(method ? { method: String(method) } : {}),
            ...(providerName ? { providerName: String(providerName) } : {}),
            ...(providerEmail ? { providerEmail: String(providerEmail) } : {}),
            ...(resumeStep ? { resumeStep: String(resumeStep) } : {}),
          },
        });
        return;
      }

      router.replace({
        pathname: "/(auth)/SignupFlow" as never,
        params: {
          ...(method ? { method: String(method) } : {}),
          ...(providerName ? { providerName: String(providerName) } : {}),
          ...(providerEmail ? { providerEmail: String(providerEmail) } : {}),
          ...(resumeStep ? { resumeStep: String(resumeStep) } : {}),
        },
      });
    } catch (error) {
      const termsError = toOnboardingError(
        { failure: 'terms_save', provider, source: 'terms.accept' },
        error
      );
      const copy = onboardingErrorCopy(termsError);
      logOnboardingError(termsError);
      Alert.alert(copy.title, copy.message, [{ text: 'Try Again' }]);
      setSavingAgreement(false);
    }
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
            <Text style={styles.updateText}>Last updated: {LEGAL_LAST_UPDATED}</Text>
          </View>

          <Text style={styles.title}>Terms of Use</Text>
        </View>

        <View style={styles.legalActionGrid}>
          {legalActions.map((action) => (
            <Pressable
              key={action.label}
              onPress={() => Linking.openURL(action.url)}
              style={({ pressed }) => [
                styles.legalActionButton,
                pressed && styles.legalActionButtonPressed,
              ]}
            >
              <Ionicons name={action.icon} size={18} color={COLORS.secondary} />
              <Text style={styles.legalActionText}>{action.label}</Text>
            </Pressable>
          ))}
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
              <Text style={styles.sectionTitle}>Terms of Use</Text>
            </View>
            <Text style={styles.bodyText}>
              These Terms of Use govern access to Sportiner, including account
              creation, player profiles, games, messaging, and community features.
              You must be at least 16 years old to create an account or use
              Sportiner. By continuing, you agree to follow these terms and all
              safety rules.
            </Text>
          </View>

          <View style={styles.agePolicySection}>
            <View style={styles.sectionHeader}>
              <Ionicons name="person-outline" size={22} color={COLORS.primary} />
              <Text style={styles.sectionTitle}>Age Requirement</Text>
            </View>
            <Text style={styles.agePolicyBody}>
              You must be at least 16 years old to use Sportiner. Sportiner includes
              player profiles, photos, chat, location-based game discovery, and
              in-person tennis meetups, so accounts for users under 16 are not allowed.
            </Text>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="lock-closed-outline" size={22} color={COLORS.primary} />
              <Text style={styles.sectionTitle}>Privacy Policy</Text>
            </View>
            <Text style={styles.bodyText}>
              Our Privacy Policy explains how Sportiner collects, uses, stores,
              and protects account, profile, location, booking, messaging, and
              safety-related information. You can review it before creating an
              account using the Privacy Policy button above. Sportiner is not
              intended for users under 16, and we do not knowingly collect
              personal information from users under 16.
            </Text>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="shield-checkmark-outline" size={22} color={COLORS.primary} />
              <Text style={styles.sectionTitle}>Zero Tolerance Policy</Text>
            </View>
            <Text style={styles.bodyText}>
              Sportiner does not tolerate objectionable content, harassment,
              threats, hate, sexual content, spam, or abusive users. Accounts
              that violate these rules may be restricted or removed.
            </Text>
            <Text style={styles.bodyText}>
              Users may not post, share, upload, send, or promote content that
              is offensive, hateful, threatening, harassing, sexually explicit,
              discriminatory, violent, spam, unsafe, or otherwise inappropriate.
              Users also may not harass, threaten, bully, impersonate, abuse,
              target, or intimidate other players.
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
            <Text style={styles.bodyText}>
              For safer in-person play, use public courts when possible, tell
              someone where you are going, and do not meet or continue a meetup
              if you feel unsafe.
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
              to protect the community. Report and block controls are available
              throughout the app for user profiles, messages, and game-related
              interactions.
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

          <View style={styles.supportSection}>
            <Text style={styles.footerText}>
              Questions or safety concerns? Contact support@sportiner.com.
            </Text>
            <Pressable onPress={() => Linking.openURL(LEGAL_LINKS.supportMailto)}>
              <Text style={styles.supportEmail}>{LEGAL_LINKS.supportEmail}</Text>
            </Pressable>
          </View>
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
            I have read and agree to the Terms of Use, Privacy Policy, and Community Guidelines.
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
  legalActionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 24,
  },
  legalActionButton: {
    minHeight: 44,
    flexBasis: "47%",
    flexGrow: 1,
    borderWidth: 2,
    borderColor: COLORS.secondary,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    shadowColor: COLORS.secondary,
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  legalActionButtonPressed: {
    transform: [{ translateX: 1 }, { translateY: 1 }],
    shadowOffset: { width: 1, height: 1 },
  },
  legalActionText: {
    flex: 1,
    color: COLORS.secondary,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "900",
    textTransform: "uppercase",
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
  agePolicySection: {
    backgroundColor: COLORS.surfaceContainerLow,
    borderWidth: 2,
    borderColor: COLORS.secondary,
    borderRadius: 16,
    padding: 16,
    marginBottom: 30,
  },
  agePolicyBody: {
    color: COLORS.secondary,
    fontSize: 14,
    lineHeight: 22,
    fontWeight: "800",
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
  supportSection: {
    marginTop: 8,
  },
  supportEmail: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 4,
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
