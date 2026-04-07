import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSimulationStore } from "@/store/simulation";
import { dictionary, tAction, tMood, tPhase } from "@/i18n/translate";
import type { AppLanguage, TranscriptEntry } from "@/store/simulation";
import type { JuryObservation } from "@/lib/api";

// ─── Constants ────────────────────────────────────────────────────────────────

const CASES: Record<string, string> = {
  reasonable_doubt: "State v. Callahan",
  poisoned_panel: "State v. Whitmore",
  the_impossible_case: "State v. Blackwood",
};
const TASK_META: Record<
  string,
  { level: string; title: string; objective: string; accent: string }
> = {
  reasonable_doubt: {
    level: "Level 1 · Easy",
    title: "Reasonable Doubt",
    objective: "Lower average conviction below 35%.",
    accent: "#22c55e",
  },
  poisoned_panel: {
    level: "Level 2 · Medium",
    title: "Poisoned Panel",
    objective: "Break the hostile cluster before it spreads.",
    accent: "#f59e0b",
  },
  the_impossible_case: {
    level: "Level 3 · Hard",
    title: "The Impossible Case",
    objective: "Force a split jury with multiple holdouts.",
    accent: "#ef4444",
  },
};
const TASK_META_I18N: Record<AppLanguage, Record<string, { level: string; title: string; objective: string }>> = {
  en: {
    reasonable_doubt: { level: "Level 1 · Easy", title: "Reasonable Doubt", objective: "Lower average conviction below 35%." },
    poisoned_panel: { level: "Level 2 · Medium", title: "Poisoned Panel", objective: "Break the hostile cluster before it spreads." },
    the_impossible_case: { level: "Level 3 · Hard", title: "The Impossible Case", objective: "Force a split jury with multiple holdouts." },
  },
  hi: {
    reasonable_doubt: { level: "लेवल 1 · आसान", title: "उचित संदेह", objective: "औसत दोषसिद्धि 35% से नीचे लाएं।" },
    poisoned_panel: { level: "लेवल 2 · मध्यम", title: "विषाक्त पैनल", objective: "शत्रुतापूर्ण समूह को टूटने पर मजबूर करें।" },
    the_impossible_case: { level: "लेवल 3 · कठिन", title: "असंभव केस", objective: "जूरी में स्पष्ट विभाजन बनाएं।" },
  },
  kn: {
    reasonable_doubt: { level: "ಹಂತ 1 · ಸುಲಭ", title: "ಸಮಂಜಸ ಸಂದೇಹ", objective: "ಸರಾಸರಿ ದೋಷದ ಒತ್ತಡವನ್ನು 35% ಕ್ಕಿಂತ ಕಡಿಮೆ ಮಾಡಿ." },
    poisoned_panel: { level: "ಹಂತ 2 · ಮಧ್ಯಮ", title: "ವಿಷಪೂರಿತ ಪ್ಯಾನಲ್", objective: "ವಿರೋಧಿ ಗುಂಪನ್ನು ಮುರಿಯಿರಿ." },
    the_impossible_case: { level: "ಹಂತ 3 · ಕಠಿಣ", title: "ಅಸಾಧ್ಯ ಕೇಸ್", objective: "ಜೂರಿಯಲ್ಲಿ ಸ್ಪಷ್ಟ ವಿಭಜನೆ ತರಿರಿ." },
  },
  te: {
    reasonable_doubt: { level: "లెవల్ 1 · సులభం", title: "సందేహ స్థాయి", objective: "సగటు దోష ఒత్తిడిని 35% కంటే తక్కువ చేయండి." },
    poisoned_panel: { level: "లెవల్ 2 · మధ్యస్థం", title: "విషపూరిత ప్యానెల్", objective: "విరోధక క్లస్టర్‌ను చెదరగొట్టండి." },
    the_impossible_case: { level: "లెవల్ 3 · కష్టం", title: "అసాధ్య కేసు", objective: "జ్యూరీలో స్పష్టమైన విభజన సృష్టించండి." },
  },
};
const HACKATHON_TAG = "Built for Scaler Hackathon · Nuera Rangers";

const PHASES = [
  "voir_dire",
  "witness_exam",
  "cross_examination",
  "closing",
  "verdict",
] as const;
const PHASE_DESCRIPTIONS: Record<AppLanguage, Record<string, string>> = {
  en: {
    voir_dire: "Jury selection and bias probing",
    witness_exam: "Defense presents witnesses and evidence",
    cross_examination: "Pressure-test prosecution testimony",
    closing: "Final persuasion and reasonable doubt framing",
    verdict: "Jury deliberation and final outcome",
  },
  hi: {
    voir_dire: "जूरी चयन और पक्षपात जांच",
    witness_exam: "रक्षा पक्ष गवाह और साक्ष्य पेश करता है",
    cross_examination: "अभियोजन गवाही की जिरह",
    closing: "अंतिम बहस और उचित संदेह पर जोर",
    verdict: "जूरी विचार-विमर्श और अंतिम निर्णय",
  },
  kn: {
    voir_dire: "ಜೂರಿ ಆಯ್ಕೆ ಮತ್ತು ಪಕ್ಷಪಾತ ಪರಿಶೀಲನೆ",
    witness_exam: "ರಕ್ಷಣಾ ಪಕ್ಷ ಸಾಕ್ಷಿ ಮತ್ತು ಸಾಕ್ಷ್ಯ ಮಂಡಿಸುತ್ತದೆ",
    cross_examination: "ಅಭಿಯೋಗ ಸಾಕ್ಷ್ಯಕ್ಕೆ ಪ್ರತಿಪ್ರಶ್ನೆ",
    closing: "ಅಂತಿಮ ವಾದ ಮತ್ತು ಸಮಂಜಸ ಸಂದೇಹ ಒತ್ತಿಹೇಳಿಕೆ",
    verdict: "ಜೂರಿ ಚರ್ಚೆ ಮತ್ತು ಅಂತಿಮ ತೀರ್ಪು",
  },
  te: {
    voir_dire: "జ్యూరీ ఎంపిక మరియు పక్షపాతం పరిశీలన",
    witness_exam: "రక్షణ పక్షం సాక్షులు, ఆధారాలు సమర్పిస్తుంది",
    cross_examination: "అభియోగ సాక్ష్యాలపై ప్రతిప్రశ్న",
    closing: "తుది వాదన మరియు సందేహ అంశం",
    verdict: "జ్యూరీ చర్చ మరియు తుది తీర్పు",
  },
};

const UI_TEXT: Record<
  AppLanguage,
  {
    sessionActive: string;
    ready: string;
    phaseLabel: string;
    courtroomProceeding: string;
    courtroomLive: string;
    welcomeTitle: string;
    onboardingBody: string;
    active: string;
    defense: string;
    prosecution: string;
    forAccused: string;
    forState: string;
    convictionPressure: string;
    pressureNotGuilty: string;
    pressureGuilty: string;
    pressureFence: string;
    juryUnit: string;
    courtroomAudio: string;
    live: string;
    autoTranscribing: string;
    quickActions: string;
    play: string;
    revealVerdict: string;
    reset: string;
    step: string;
    finalVerdict: string;
    noSimulationData: string;
    score: string;
    pressure: string;
    resetToBegin: string;
  }
> = {
  en: {
    sessionActive: "Session Active",
    ready: "Ready",
    phaseLabel: "Phase",
    courtroomProceeding: "Courtroom proceeding",
    courtroomLive: "Courtroom is Live",
    welcomeTitle: "WELCOME TO JURY CONSULTANT",
    onboardingBody:
      "This app simulates courtroom strategy. You are the defense consultant: choose actions that reduce conviction pressure and improve the final verdict. Select a level above, then use Reset, Play, or Step.",
    active: "Active",
    defense: "Defense",
    prosecution: "Prosecution",
    forAccused: "For the Accused",
    forState: "For the State",
    convictionPressure: "Conviction Pressure",
    pressureNotGuilty: "NOT GUILTY",
    pressureGuilty: "LEANING GUILTY",
    pressureFence: "ON THE FENCE",
    juryUnit: "Jury Unit",
    courtroomAudio: "Courtroom Audio",
    live: "LIVE",
    autoTranscribing: "Auto-Transcribing in",
    quickActions: "Quick Actions",
    play: "Play",
    revealVerdict: "Reveal Verdict",
    reset: "Reset",
    step: "Step",
    finalVerdict: "Final Verdict",
    noSimulationData: "No simulation data yet",
    score: "Score",
    pressure: "Pressure",
    resetToBegin: "Reset simulation to begin",
  },
  hi: {
    sessionActive: "सेशन चालू",
    ready: "तैयार",
    phaseLabel: "चरण",
    courtroomProceeding: "कोर्ट कार्यवाही",
    courtroomLive: "कोर्टरूम लाइव है",
    welcomeTitle: "जूरी कंसल्टेंट में स्वागत है",
    onboardingBody:
      "यह ऐप कोर्टरूम रणनीति दिखाता है। आप रक्षा सलाहकार हैं: ऐसे एक्शन चुनें जो दोषसिद्धि दबाव घटाएं और अंतिम निर्णय बेहतर करें। ऊपर लेवल चुनें, फिर Reset, Play या Step इस्तेमाल करें।",
    active: "सक्रिय",
    defense: "रक्षा पक्ष",
    prosecution: "अभियोजन",
    forAccused: "आरोपी पक्ष हेतु",
    forState: "राज्य की ओर से",
    convictionPressure: "दोषसिद्धि दबाव",
    pressureNotGuilty: "निर्दोष की ओर",
    pressureGuilty: "दोषी की ओर",
    pressureFence: "अनिर्णीत",
    juryUnit: "जूरी यूनिट",
    courtroomAudio: "कोर्ट ऑडियो",
    live: "लाइव",
    autoTranscribing: "ऑटो-ट्रांसक्राइब",
    quickActions: "त्वरित एक्शन",
    play: "चलाएं",
    revealVerdict: "निर्णय दिखाएं",
    reset: "रीसेट",
    step: "स्टेप",
    finalVerdict: "अंतिम निर्णय",
    noSimulationData: "अभी सिमुलेशन डेटा नहीं",
    score: "स्कोर",
    pressure: "दबाव",
    resetToBegin: "शुरू करने के लिए रीसेट करें",
  },
  kn: {
    sessionActive: "ಸೆಷನ್ ಸಕ್ರಿಯ",
    ready: "ಸಿದ್ಧ",
    phaseLabel: "ಹಂತ",
    courtroomProceeding: "ನ್ಯಾಯಾಲಯ ಪ್ರಕ್ರಿಯೆ",
    courtroomLive: "ಕೋರ್ಟ್ ಲೈವ್",
    welcomeTitle: "ಜೂರಿ ಕನ್‌ಸಲ್ಟೆಂಟ್‌ಗೆ ಸ್ವಾಗತ",
    onboardingBody:
      "ಈ ಆಪ್ ನ್ಯಾಯಾಲಯ ತಂತ್ರವನ್ನು ತೋರಿಸುತ್ತದೆ. ನೀವು ರಕ್ಷಣಾ ಸಲಹೆಗಾರರು: ದೋಷದ ಒತ್ತಡ ಕಡಿಮೆ ಮಾಡುವ ಕ್ರಮಗಳನ್ನು ಆಯ್ಕೆಮಾಡಿ ಮತ್ತು ಅಂತಿಮ ತೀರ್ಪನ್ನು ಉತ್ತಮಗೊಳಿಸಿ. ಮೇಲೆ ಲೆವೆಲ್ ಆಯ್ಕೆ ಮಾಡಿ, ನಂತರ Reset, Play ಅಥವಾ Step ಬಳಸಿ.",
    active: "ಸಕ್ರಿಯ",
    defense: "ರಕ್ಷಣಾ ಪಕ್ಷ",
    prosecution: "ಅಭಿಯೋಗ",
    forAccused: "ಆರೋಪಿತ ಪರ",
    forState: "ರಾಜ್ಯದ ಪರ",
    convictionPressure: "ದೋಷದ ಒತ್ತಡ",
    pressureNotGuilty: "ದೋಷಿಯಲ್ಲ ದಿಕ್ಕು",
    pressureGuilty: "ದೋಷಿ ದಿಕ್ಕು",
    pressureFence: "ಅನಿಶ್ಚಿತ",
    juryUnit: "ಜೂರಿ ಘಟಕ",
    courtroomAudio: "ಕೋರ್ಟ್ ಆಡಿಯೋ",
    live: "ಲೈವ್",
    autoTranscribing: "ಸ್ವಯಂ ಲಿಪ್ಯಂತರ",
    quickActions: "ತ್ವರಿತ ಕ್ರಿಯೆಗಳು",
    play: "ಚಾಲನೆ",
    revealVerdict: "ತೀರ್ಪು ತೋರಿಸಿ",
    reset: "ಮರುಹೊಂದಿಸಿ",
    step: "ಹಂತ",
    finalVerdict: "ಅಂತಿಮ ತೀರ್ಪು",
    noSimulationData: "ಇನ್ನೂ ಸಿಮ್ಯುಲೇಶನ್ ಡೇಟಾ ಇಲ್ಲ",
    score: "ಸ್ಕೋರ್",
    pressure: "ಒತ್ತಡ",
    resetToBegin: "ಆರಂಭಿಸಲು ಮರುಹೊಂದಿಸಿ",
  },
  te: {
    sessionActive: "సెషన్ సక్రియం",
    ready: "సిద్ధం",
    phaseLabel: "దశ",
    courtroomProceeding: "కోర్టు ప్రక్రియ",
    courtroomLive: "కోర్ట్ లైవ్‌లో ఉంది",
    welcomeTitle: "జ్యూరీ కన్సల్టెంట్‌కు స్వాగతం",
    onboardingBody:
      "ఈ యాప్ కోర్ట్‌రూమ్ వ్యూహాన్ని చూపిస్తుంది. మీరు రక్షణ సలహాదారు: దోష ఒత్తిడిని తగ్గించే చర్యలు ఎంచుకుని తుది తీర్పును మెరుగుపరచండి. పై లెవల్ ఎంచుకుని Reset, Play లేదా Step వాడండి.",
    active: "సక్రియం",
    defense: "రక్షణ పక్షం",
    prosecution: "అభియోగం",
    forAccused: "ఆరోపిత తరఫున",
    forState: "రాష్ట్ర తరఫున",
    convictionPressure: "దోష ఒత్తిడి",
    pressureNotGuilty: "దోషి కాదు వైపు",
    pressureGuilty: "దోషి వైపు",
    pressureFence: "అనిశ్చిత",
    juryUnit: "జ్యూరీ యూనిట్",
    courtroomAudio: "కోర్ట్ ఆడియో",
    live: "లైవ్",
    autoTranscribing: "ఆటో ట్రాన్స్‌క్రైబ్",
    quickActions: "త్వరిత చర్యలు",
    play: "ప్లే",
    revealVerdict: "తీర్పు చూపు",
    reset: "రీసెట్",
    step: "స్టెప్",
    finalVerdict: "తుది తీర్పు",
    noSimulationData: "ఇంకా సిమ్యులేషన్ డేటా లేదు",
    score: "స్కోర్",
    pressure: "ఒత్తిడి",
    resetToBegin: "ప్రారంభానికి రీసెట్ చేయండి",
  },
};

const MOOD_BG: Record<string, string> = {
  receptive: "#15803d",
  hostile: "#dc2626",
  neutral: "#a16207",
  disengaged: "#374151",
};

const LANG_NAMES: Record<AppLanguage, string> = {
  en: "English",
  hi: "Hindi",
  kn: "Kannada",
  te: "Telugu",
};
const LANG_ICONS: Record<AppLanguage, string> = {
  en: "🌐",
  hi: "🇮🇳",
  kn: "ಕ",
  te: "తె",
};

// Juror rows matching image layout: 5 back, 7 front
const ROW_BACK = [0, 1, 2, 3, 4];
const ROW_FRONT = [5, 6, 7, 8, 9, 10, 11];

const LOG_SPEAKER: Record<AppLanguage, string> = {
  en: "Court Log",
  hi: "कोर्ट लॉग",
  kn: "ಕೋರ್ಟ್ ಲಾಗ್",
  te: "కోర్ట్ లాగ్",
};
const LOG_SPEAKER_COLOR = "#eab308";

function countMood(moods: string[], mood: string): number {
  return moods.filter((m) => m === mood).length;
}

function pressureTrendText(language: AppLanguage, delta: number): string {
  if (language === "hi") {
    if (delta < 0) return `दबाव ${Math.abs(delta)} अंक सुधरा`;
    if (delta > 0) return `दबाव ${delta} अंक बढ़ा`;
    return "दबाव स्थिर रहा";
  }
  if (language === "kn") {
    if (delta < 0) return `ಒತ್ತಡ ${Math.abs(delta)} ಅಂಕ ಸುಧಾರಿಸಿದೆ`;
    if (delta > 0) return `ಒತ್ತಡ ${delta} ಅಂಕ ಹೆಚ್ಚಾಯಿತು`;
    return "ಒತ್ತಡ ಸ್ಥಿರವಾಗಿದೆ";
  }
  if (language === "te") {
    if (delta < 0) return `ఒత్తిడి ${Math.abs(delta)} పాయింట్లు తగ్గింది`;
    if (delta > 0) return `ఒత్తిడి ${delta} పాయింట్లు పెరిగింది`;
    return "ఒత్తిడి స్థిరంగా ఉంది";
  }
  if (delta < 0) return `Pressure improved by ${Math.abs(delta)} points`;
  if (delta > 0) return `Pressure worsened by ${delta} points`;
  return "Pressure stayed flat";
}

function inferActionFromEvent(lastEvent: string): string {
  const msg = lastEvent.toLowerCase();
  if (msg.includes("bias probe")) return "probe_bias";
  if (msg.includes("challenged and replaced")) return "challenge_juror";
  if (msg.includes("accepts the jury panel")) return "accept_panel";
  if (msg.includes("takes the stand")) return "call_witness";
  if (msg.includes("gentle cross-examination")) return "gentle_cross";
  if (msg.includes("aggressive cross-examination")) return "aggressive_cross";
  if (msg.includes("credibility damaged")) return "impeach_witness";
  if (msg.includes("recess called")) return "request_recess";
  if (msg.includes("closing argument delivered")) {
    if (msg.includes("emotional")) return "closing_emotional";
    if (msg.includes("procedural")) return "closing_procedural";
    return "closing_reasonable_doubt";
  }
  return "probe_bias";
}

function buildTranscriptEntry(
  language: AppLanguage,
  current: JuryObservation,
  previous: JuryObservation | null,
): TranscriptEntry {
  const action = tAction(language, inferActionFromEvent(current.last_event));
  const pressureNow = Math.round(current.conviction_pressure * 100);
  const pressurePrev = previous
    ? Math.round(previous.conviction_pressure * 100)
    : pressureNow;
  const pressureDelta = pressureNow - pressurePrev;

  const hostileNow = countMood(current.juror_moods, "hostile");
  const hostilePrev = previous ? countMood(previous.juror_moods, "hostile") : hostileNow;
  const receptiveNow = countMood(current.juror_moods, "receptive");
  const receptivePrev = previous ? countMood(previous.juror_moods, "receptive") : receptiveNow;

  const hostileDelta = hostileNow - hostilePrev;
  const receptiveDelta = receptiveNow - receptivePrev;

  const trend = pressureTrendText(language, pressureDelta);
  const moodShift = `hostile ${hostileNow} (${hostileDelta >= 0 ? "+" : ""}${hostileDelta}), receptive ${receptiveNow} (${receptiveDelta >= 0 ? "+" : ""}${receptiveDelta})`;
  const phaseLine = `Phase ${current.phase.replace("_", " ")} · score ${Math.round(current.task_score * 100)}%`;
  const text = `${action}: ${current.last_event} ${trend} (${pressureNow}%). Mood shift: ${moodShift}. ${phaseLine}.`;

  const tone: TranscriptEntry["tone"] =
    pressureDelta < 0 || receptiveDelta > 0
      ? "positive"
      : pressureDelta > 0 || hostileDelta > 0
        ? "warning"
        : "neutral";

  return {
    id: `${current.step_index}-${Date.now()}`,
    step: current.step_index,
    text,
    createdAt: Date.now(),
    tone,
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

function useSessionTimer(running: boolean) {
  const [s, setS] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setS((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [running]);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const store = useSimulationStore();
  const {
    caseName,
    selectedTask,
    language,
    health,
    isRunning,
    isAutoplay,
    isVerdictOpen,
    verdictRevealIndex,
    observation,
    transcript,
    lastError,
    checkHealth,
    setLanguage,
    setTask,
    reset,
    step,
    pushTranscript,
    setAutoplay,
    setVerdictOpen,
    setVerdictRevealIndex,
  } = store;

  const sessionTime = useSessionTimer(isAutoplay || isRunning);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const previousObservationRef = useRef<JuryObservation | null>(null);
  const lastTranscriptKeyRef = useRef<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(
    () => window.localStorage.getItem("jury_onboarding_dismissed") !== "1",
  );

  // ── Effects ──────────────────────────────────────────────────────────────

  useEffect(() => {
    void checkHealth();
  }, [checkHealth]);

  useEffect(() => {
    if (!observation) return;
    const key = `${observation.step_index}:${observation.last_event}`;
    if (lastTranscriptKeyRef.current === key) return;
    const entry = buildTranscriptEntry(
      language,
      observation,
      previousObservationRef.current,
    );
    pushTranscript(entry);
    previousObservationRef.current = observation;
    lastTranscriptKeyRef.current = key;
  }, [language, observation, pushTranscript]);

  useEffect(() => {
    if (!isAutoplay || !observation || observation.done) return;
    const t = window.setTimeout(() => {
      void step();
    }, 1200);
    return () => window.clearTimeout(t);
  }, [isAutoplay, observation, step]);

  useEffect(() => {
    if (!isVerdictOpen || !observation) return;
    let idx = -1;
    const t = window.setInterval(() => {
      idx += 1;
      setVerdictRevealIndex(idx);
      if (idx >= 11) window.clearInterval(t);
    }, 170);
    return () => window.clearInterval(t);
  }, [isVerdictOpen, observation, setVerdictRevealIndex]);

  useEffect(() => {
    if (!showOnboarding) {
      window.localStorage.setItem("jury_onboarding_dismissed", "1");
    }
  }, [showOnboarding]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const dict = dictionary(language);
  const uiText = UI_TEXT[language];

  const revealedVotes = useMemo(() => {
    if (!observation) return [];
    return observation.juror_moods.map((mood, i) =>
      i > verdictRevealIndex
        ? ""
        : mood === "hostile"
          ? dict.verdict.guilty
          : dict.verdict.notGuilty,
    );
  }, [dict.verdict.guilty, dict.verdict.notGuilty, observation, verdictRevealIndex]);

  const verdictLabel = useMemo(() => {
    if (!observation) return uiText.noSimulationData;
    if (observation.conviction_pressure < 0.4) return dict.verdict.established;
    if (observation.conviction_pressure > 0.65) return dict.verdict.secured;
    return dict.verdict.hung;
  }, [dict.verdict.established, dict.verdict.hung, dict.verdict.secured, observation, uiText.noSimulationData]);

  const pressure = observation?.conviction_pressure ?? 0;
  const pct = Math.round(pressure * 100);
  const pressureTag =
    pressure < 0.4
      ? uiText.pressureNotGuilty
      : pressure > 0.65
        ? uiText.pressureGuilty
        : uiText.pressureFence;
  const pressureTagBg =
    pressure < 0.4 ? "#15803d" : pressure > 0.65 ? "#dc2626" : "#a16207";

  const phase = observation?.phase ?? "voir_dire";
  const phaseIdx = PHASES.indexOf(phase as (typeof PHASES)[number]);
  const phaseLabel = tPhase(language, phase);
  const activeTaskTheme = TASK_META[selectedTask] ?? TASK_META.reasonable_doubt;
  const activeTaskMeta =
    TASK_META_I18N[language][selectedTask] ?? TASK_META_I18N[language].reasonable_doubt;

  const formattedTranscript = useMemo(
    () =>
      transcript.slice(0, 20).map((entry) => {
        const base = new Date(entry.createdAt);
        const hh = String(base.getHours() % 12 || 12).padStart(2, "0");
        const mm = String(base.getMinutes()).padStart(2, "0");
        const ss = String(base.getSeconds()).padStart(2, "0");
        const ap = base.getHours() >= 12 ? "PM" : "AM";
        return {
          ...entry,
          speaker: LOG_SPEAKER[language],
          time: `${hh}:${mm}:${ss} ${ap}`,
        };
      }),
    [language, transcript],
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "#080808",
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
      }}
    >
      {/* ╔═══════════════════════════════════╗
          ║           TOP BAR                 ║
          ╚═══════════════════════════════════╝ */}
      <header
        style={{
          minHeight: 64,
          flexShrink: 0,
          zIndex: 30,
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          padding: "0 20px",
          background: "rgba(5,5,5,0.97)",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          position: "relative",
        }}
      >
        {/* Logo + title */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              background: "rgba(234,179,8,0.1)",
              border: "1.5px solid rgba(234,179,8,0.32)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 16,
            }}
          >
            ⚖️
          </div>
          <div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "#fff",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              {dict.ui.title}
            </div>
            <div
              style={{
                fontSize: 10,
                color: "rgba(255,255,255,0.32)",
                marginTop: 1,
              }}
            >
              {caseName} • {observation ? uiText.sessionActive : uiText.ready}
            </div>
            <div
              style={{
                fontSize: 9,
                color: "rgba(234,179,8,0.78)",
                marginTop: 1,
                letterSpacing: "0.04em",
              }}
            >
              {HACKATHON_TAG}
            </div>
          </div>
        </div>

        {/* Phase pill */}
        <div
          style={{
            marginLeft: 8,
            background: "rgba(8,8,8,0.78)",
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 99,
            padding: "7px 16px",
            textAlign: "center",
            boxShadow: "0 8px 28px rgba(0,0,0,0.35)",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: "rgba(255,255,255,0.42)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            {uiText.phaseLabel}:{" "}
            <span style={{ color: "#fff", fontWeight: 700 }}>
              {phaseLabel.toUpperCase()}
            </span>
          </div>
          <div
            style={{
              fontSize: 10,
              color: "rgba(255,255,255,0.42)",
              marginTop: 2,
            }}
          >
            {PHASE_DESCRIPTIONS[language][phase] ?? uiText.courtroomProceeding}
          </div>
        </div>

        {/* Right controls */}
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexWrap: "wrap",
            justifyContent: "flex-end",
            rowGap: 6,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "rgba(0,0,0,0.45)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 10,
              padding: "4px",
            }}
          >
            {(["reasonable_doubt", "poisoned_panel", "the_impossible_case"] as const).map(
              (taskId) => {
                const meta = TASK_META[taskId];
                const localizedMeta = TASK_META_I18N[language][taskId];
                const active = selectedTask === taskId;
                return (
                  <button
                    key={taskId}
                    onClick={() => setTask(taskId, CASES[taskId])}
                    style={{
                      border: active
                        ? `1px solid ${meta.accent}`
                        : "1px solid rgba(255,255,255,0.08)",
                      background: active
                        ? "rgba(255,255,255,0.09)"
                        : "rgba(255,255,255,0.03)",
                      color: active ? "#fff" : "rgba(255,255,255,0.55)",
                      borderRadius: 8,
                      padding: "6px 9px",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-start",
                      minWidth: 108,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        color: active ? meta.accent : "rgba(255,255,255,0.45)",
                      }}
                    >
                      {localizedMeta.level}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700 }}>
                      {localizedMeta.title}
                    </span>
                  </button>
                );
              },
            )}
          </div>

          {(["en", "hi", "kn", "te"] as AppLanguage[]).map((lang) => {
            const on = language === lang;
            return (
              <button
                key={lang}
                onClick={() => setLanguage(lang)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  background: on
                    ? "rgba(234,179,8,0.12)"
                    : "rgba(255,255,255,0.04)",
                  border: on
                    ? "1.5px solid rgba(234,179,8,0.42)"
                    : "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 99,
                  padding: "4px 11px",
                  color: on ? "#eab308" : "rgba(255,255,255,0.48)",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                <span style={{ fontSize: 11 }}>{LANG_ICONS[lang]}</span>
                {LANG_NAMES[lang]}
              </button>
            );
          })}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 11,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                display: "inline-block",
                background: health === "healthy" ? "#22c55e" : "#ef4444",
                boxShadow: health === "healthy" ? "0 0 5px #22c55e" : "none",
              }}
            />
            <span
              style={{
                color: health === "healthy" ? "#22c55e" : "#ef4444",
                fontWeight: 600,
              }}
            >
              API {health === "healthy" ? dict.ui.online : dict.ui.offline}
            </span>
          </div>
        </div>
      </header>

      {/* ╔═══════════════════════════════════╗
          ║              BODY                 ║
          ╚═══════════════════════════════════╝ */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* ─── COURTROOM STAGE ─────────────────────────────── */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          {/* BG image — no blur, just gentle dim */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: "url(/bg.png)",
              backgroundSize: "cover",
              backgroundPosition: "center top",
              filter: "brightness(0.75)",
            }}
          />

          {/* Vignette: bottom dark fade for bottom rail legibility */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              background:
                "linear-gradient(to bottom, transparent 65%, rgba(0,0,0,0.45) 100%)",
            }}
          />

          {/* ── Courtroom is Live badge ── */}
          <div
            style={{
              position: "absolute",
              top: 14,
              right: 14,
              zIndex: 10,
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "linear-gradient(135deg, rgba(0,0,0,0.62), rgba(0,0,0,0.46))",
              backdropFilter: "blur(8px)",
              border: "1px solid rgba(255,255,255,0.13)",
              borderRadius: 99,
              padding: "6px 13px",
              fontSize: 11,
              color: "rgba(255,255,255,0.78)",
              boxShadow: "0 6px 18px rgba(0,0,0,0.3)",
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#22c55e",
                boxShadow: "0 0 6px #22c55e",
                display: "inline-block",
              }}
            />
            {uiText.courtroomLive}
          </div>

          {showOnboarding && (
            <div
              style={{
                position: "absolute",
                left: 14,
                top: 74,
                zIndex: 12,
                width: 400,
                maxWidth: "calc(100% - 28px)",
                background:
                  "linear-gradient(160deg, rgba(17,17,17,0.94), rgba(11,11,11,0.86))",
                border: "1px solid rgba(234,179,8,0.34)",
                borderRadius: 14,
                padding: "13px 15px",
                backdropFilter: "blur(8px)",
                boxShadow: "0 10px 30px rgba(0,0,0,0.38)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    color: "#fbbf24",
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: "0.06em",
                  }}
                >
                  {uiText.welcomeTitle}
                </div>
                <button
                  onClick={() => setShowOnboarding(false)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "rgba(255,255,255,0.65)",
                    cursor: "pointer",
                    fontSize: 14,
                  }}
                >
                  ✕
                </button>
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "rgba(255,255,255,0.78)",
                  marginTop: 6,
                  lineHeight: 1.5,
                }}
              >
                {uiText.onboardingBody}
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: activeTaskTheme.accent }}>
                {uiText.active}: {activeTaskMeta.level} · {activeTaskMeta.objective}
              </div>
            </div>
          )}

          {/* ── Defense card ── */}
          <div
            style={{
              position: "absolute",
              left: 14,
              top: "35%",
              zIndex: 10,
              background:
                "linear-gradient(165deg, rgba(9,9,9,0.78), rgba(7,7,7,0.56))",
              backdropFilter: "blur(10px)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12,
              padding: "11px 14px",
              minWidth: 142,
              boxShadow: "0 8px 24px rgba(0,0,0,0.34)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                marginBottom: 6,
              }}
            >
              <span style={{ fontSize: 11, opacity: 0.65 }}>🛡️</span>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: "rgba(255,255,255,0.35)",
                  letterSpacing: "0.13em",
                  textTransform: "uppercase",
                }}
              >
                {uiText.defense}
              </span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>
              Adv. Ethan Caldwell
            </div>
            <div
              style={{
                fontSize: 10,
                color: "rgba(255,255,255,0.35)",
                marginTop: 2,
              }}
            >
              {uiText.forAccused}
            </div>
            {observation && (
              <div
                style={{
                  marginTop: 8,
                  fontSize: 10,
                  fontWeight: 600,
                  color: "#eab308",
                  background: "rgba(234,179,8,0.1)",
                  border: "1px solid rgba(234,179,8,0.25)",
                  borderRadius: 4,
                  padding: "3px 8px",
                  display: "inline-block",
                }}
              >
                {tAction(
                  language,
                  observation.valid_actions[0] ?? "probe_bias",
                )}
              </div>
            )}
          </div>

          {/* ── Prosecution card ── */}
          <div
            style={{
              position: "absolute",
              right: 14,
              top: "35%",
              zIndex: 10,
              background:
                "linear-gradient(165deg, rgba(9,9,9,0.78), rgba(7,7,7,0.56))",
              backdropFilter: "blur(10px)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12,
              padding: "11px 14px",
              minWidth: 142,
              boxShadow: "0 8px 24px rgba(0,0,0,0.34)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                marginBottom: 6,
              }}
            >
              <span style={{ fontSize: 11, opacity: 0.65 }}>⚖️</span>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: "rgba(255,255,255,0.35)",
                  letterSpacing: "0.13em",
                  textTransform: "uppercase",
                }}
              >
                {uiText.prosecution}
              </span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>
              Adv. Victoria Hayes
            </div>
            <div
              style={{
                fontSize: 10,
                color: "rgba(255,255,255,0.35)",
                marginTop: 2,
              }}
            >
              {uiText.forState}
            </div>
          </div>

          {/* ── Conviction Pressure widget ── */}
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "26%",
              transform: "translateX(-50%)",
              zIndex: 10,
              background:
                "linear-gradient(160deg, rgba(8,8,8,0.82), rgba(7,7,7,0.65))",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(255,255,255,0.13)",
              borderRadius: 16,
              padding: "15px 26px",
              minWidth: 300,
              textAlign: "center",
              boxShadow: "0 12px 32px rgba(0,0,0,0.42)",
            }}
          >
            <div
              style={{
                fontSize: 10,
                color: "rgba(255,255,255,0.38)",
                letterSpacing: "0.13em",
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              {uiText.convictionPressure} <span style={{ opacity: 0.4 }}>ⓘ</span>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                marginBottom: 12,
              }}
            >
              <span
                style={{
                  fontSize: 42,
                  fontWeight: 800,
                  color: "#fff",
                  lineHeight: 1,
                  letterSpacing: "-0.02em",
                }}
              >
                {pct}%
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: "0.06em",
                  color: "#fff",
                  background: pressureTagBg,
                  borderRadius: 5,
                  padding: "5px 11px",
                }}
              >
                {pressureTag}
              </span>
            </div>
            {/* Gradient slider */}
            <div
              style={{
                position: "relative",
                height: 8,
                borderRadius: 99,
                overflow: "visible",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "linear-gradient(to right, #22c55e, #84cc16, #eab308, #f97316, #ef4444)",
                  borderRadius: 99,
                }}
              />
              <motion.div
                animate={{ left: `${pct}%` }}
                transition={{ type: "spring", stiffness: 120, damping: 22 }}
                style={{
                  position: "absolute",
                  top: "50%",
                  transform: "translate(-50%,-50%)",
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: "#fff",
                  border: "2px solid rgba(0,0,0,0.3)",
                  boxShadow: "0 1px 8px rgba(0,0,0,0.5)",
                  zIndex: 1,
                }}
              />
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: 5,
                fontSize: 9,
                color: "rgba(255,255,255,0.26)",
              }}
            >
              <span>{dict.verdict.notGuilty}</span>
              <span>{dict.verdict.secured}</span>
            </div>
          </div>

          {/* ── Jury pills — overlaid on actual jury area in the image ──
              bg.png: jury sits at ~57–80% height. With 58px topbar and 72px bottom rail,
              the jury area center is roughly at 60–75% of the stage height.
              We pin from bottom using percentage to stay on the jurors. */}
          {observation && (
            <>
              {/* Back row pills — above back-row jurors' heads */}
              <div
                style={{
                  position: "absolute",
                  bottom: "36%",
                  left: "50%",
                  transform: "translateX(-50%)",
                  zIndex: 10,
                  display: "flex",
                  gap: 43,
                  justifyContent: "center",
                }}
              >
                {ROW_BACK.map((i) => {
                  const mood = observation.juror_moods[i] ?? "neutral";
                  return (
                    <motion.span
                      key={i}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.035 }}
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: "#fff",
                        background: MOOD_BG[mood] ?? "#374151",
                        borderRadius: 99,
                        padding: "4px 14px",
                        boxShadow: "0 2px 10px rgba(0,0,0,0.55)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {tMood(language, mood)}
                    </motion.span>
                  );
                })}
              </div>

              {/* Front row pills — above front-row jurors' heads */}
              <div
                style={{
                  position: "absolute",
                  bottom: "26%",
                  left: "50%",
                  transform: "translateX(-50%)",
                  zIndex: 10,
                  display: "flex",
                  gap: 16,
                  justifyContent: "center",
                }}
              >
                {ROW_FRONT.map((i) => {
                  const mood = observation.juror_moods[i] ?? "neutral";
                  return (
                    <motion.span
                      key={i}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.035 }}
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: "#fff",
                        background: MOOD_BG[mood] ?? "#374151",
                        borderRadius: 99,
                        padding: "4px 14px",
                        boxShadow: "0 2px 10px rgba(0,0,0,0.55)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {tMood(language, mood)}
                    </motion.span>
                  );
                })}
              </div>
            </>
          )}

          {/* ── Bottom rail: Volume · Timeline · Session Time ── */}
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 10,
              height: 72,
              background: "rgba(0,0,0,0.84)",
              backdropFilter: "blur(14px)",
              borderTop: "1px solid rgba(255,255,255,0.07)",
              display: "flex",
              alignItems: "center",
              padding: "0 22px",
              gap: 22,
            }}
          >
            {/* Volume */}
            <div style={{ flexShrink: 0 }}>
              <div
                style={{
                  fontSize: 9,
                  color: "rgba(255,255,255,0.28)",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  marginBottom: 5,
                }}
              >
                Volume
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ fontSize: 11, opacity: 0.45 }}>🔈</span>
                <div
                  style={{
                    width: 50,
                    height: 3,
                    background: "rgba(255,255,255,0.1)",
                    borderRadius: 2,
                  }}
                >
                  <div
                    style={{
                      width: "40%",
                      height: "100%",
                      background: "#eab308",
                      borderRadius: 2,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Courtroom Audio */}
            <div style={{ flexShrink: 0 }}>
              <div
                style={{
                  fontSize: 9,
                  color: "rgba(255,255,255,0.28)",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  marginBottom: 5,
                }}
              >
                {uiText.courtroomAudio}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    background: "#22c55e",
                    display: "inline-block",
                  }}
                />
                <span
                  style={{ fontSize: 10, color: "#22c55e", fontWeight: 700 }}
                >
                  {uiText.live}
                </span>
              </div>
            </div>

            {/* Phase timeline */}
            <div style={{ flex: 1, position: "relative", paddingBottom: 2 }}>
              {/* track */}
              <div
                style={{
                  position: "absolute",
                  top: 6,
                  left: 0,
                  right: 0,
                  height: 2,
                  background: "rgba(255,255,255,0.09)",
                  borderRadius: 99,
                }}
              />
              <div
                style={{
                  position: "absolute",
                  top: 6,
                  left: 0,
                  height: 2,
                  background: "#eab308",
                  borderRadius: 99,
                  transition: "width 0.5s ease",
                  width:
                    phaseIdx >= 0
                      ? `${(phaseIdx / (PHASES.length - 1)) * 100}%`
                      : "0%",
                }}
              />
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  position: "relative",
                  zIndex: 1,
                }}
              >
                {PHASES.map((p, i) => {
                  const active = p === phase;
                  const past = phaseIdx > i;
                  return (
                    <div
                      key={p}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 7,
                      }}
                    >
                      <div
                        style={{
                          width: active ? 13 : 7,
                          height: active ? 13 : 7,
                          borderRadius: "50%",
                          background:
                            active || past
                              ? "#eab308"
                              : "rgba(255,255,255,0.16)",
                          boxShadow: active
                            ? "0 0 10px rgba(234,179,8,0.75)"
                            : "none",
                          border: active
                            ? "2px solid rgba(234,179,8,0.3)"
                            : "none",
                          transition: "all 0.3s",
                          marginTop: active ? -3 : 0,
                        }}
                      />
                      <span
                        style={{
                          fontSize: 10,
                          whiteSpace: "nowrap",
                          color: active
                            ? "#eab308"
                            : past
                              ? "rgba(255,255,255,0.36)"
                              : "rgba(255,255,255,0.2)",
                          fontWeight: active ? 700 : 400,
                        }}
                      >
                        {tPhase(language, p)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Session time */}
            <div style={{ flexShrink: 0, textAlign: "right" }}>
              <div
                style={{
                  fontSize: 9,
                  color: "rgba(255,255,255,0.28)",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  marginBottom: 3,
                }}
              >
                ⏱ {dict.ui.runStatus}
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: "#eab308",
                  fontVariantNumeric: "tabular-nums",
                  letterSpacing: "0.02em",
                }}
              >
                {sessionTime}
              </div>
            </div>
          </div>
        </div>

        {/* ╔═══════════════════════════════════╗
            ║         RIGHT SIDEBAR             ║
            ╚═══════════════════════════════════╝ */}
        <div
          style={{
            width: 256,
            flexShrink: 0,
            zIndex: 20,
            background: "rgba(6,6,6,0.98)",
            borderLeft: "1px solid rgba(255,255,255,0.07)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "12px 14px 9px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#22c55e",
                  boxShadow: "0 0 5px #22c55e",
                  display: "inline-block",
                }}
              />
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#fff",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}
              >
                Live Transcript
              </span>
            </div>
          </div>

          {/* Feed */}
          <div
            ref={transcriptRef}
            style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}
          >
            {lastError && (
              <div
                style={{
                  margin: "6px 10px",
                  padding: "7px 10px",
                  background: "rgba(239,68,68,0.1)",
                  border: "1px solid rgba(239,68,68,0.22)",
                  borderRadius: 6,
                  fontSize: 11,
                  color: "#fca5a5",
                }}
              >
                {lastError}
              </div>
            )}
            {formattedTranscript.length === 0 && (
              <div
                style={{
                  padding: "20px 14px",
                  fontSize: 11,
                  color: "rgba(255,255,255,0.18)",
                  textAlign: "center",
                }}
              >
                {uiText.resetToBegin}
              </div>
            )}
            <AnimatePresence initial={false}>
              {formattedTranscript.map((entry) => {
                const sc = LOG_SPEAKER_COLOR;
                const toneBg =
                  entry.tone === "positive"
                    ? "rgba(34,197,94,0.08)"
                    : entry.tone === "warning"
                      ? "rgba(239,68,68,0.08)"
                      : "rgba(255,255,255,0.022)";
                return (
                  <motion.div
                    key={entry.id}
                    initial={{ opacity: 0, x: 6 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.14 }}
                    style={{
                      margin: "0 10px 5px",
                      padding: "7px 10px",
                      borderLeft: `3px solid ${sc}`,
                      background: toneBg,
                      borderRadius: "0 6px 6px 0",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 9,
                        color: "rgba(255,255,255,0.26)",
                        marginBottom: 2,
                      }}
                    >
                      {entry.time}&nbsp;
                      <span
                        style={{ color: sc, fontWeight: 700, fontSize: 10 }}
                      >
                        {entry.speaker}:
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "rgba(255,255,255,0.72)",
                        lineHeight: 1.5,
                      }}
                    >
                      {entry.text.length > 70
                        ? entry.text.slice(0, 67) + "…"
                        : entry.text}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          {/* Auto-transcribing */}
          <div
            style={{
              padding: "6px 14px",
              borderTop: "1px solid rgba(255,255,255,0.05)",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                fontSize: 10,
                color: "rgba(255,255,255,0.26)",
              }}
            >
              <span
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: "50%",
                  background: "#eab308",
                  display: "inline-block",
                }}
              />
              {uiText.autoTranscribing} {LANG_NAMES[language]}
            </div>
          </div>

          {/* Quick Actions */}
          <div
            style={{
              padding: "11px 12px",
              borderTop: "1px solid rgba(255,255,255,0.06)",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                fontSize: 9,
                color: "rgba(255,255,255,0.26)",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              {uiText.quickActions}
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <button
                onClick={() => setAutoplay(!isAutoplay)}
                disabled={isRunning && !isAutoplay}
                style={{
                  flex: 1,
                  padding: "9px 0",
                  background: isAutoplay
                    ? "rgba(234,179,8,0.08)"
                    : "rgba(255,255,255,0.05)",
                  border: isAutoplay
                    ? "1px solid rgba(234,179,8,0.3)"
                    : "1px solid rgba(255,255,255,0.09)",
                  borderRadius: 7,
                  color: isAutoplay ? "#eab308" : "rgba(255,255,255,0.6)",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                }}
              >
                {isAutoplay ? `⏸ ${dict.ui.pause}` : `▶ ${uiText.play}`}
              </button>
              <button
                onClick={() => {
                  if (!observation) return;
                  setVerdictOpen(true);
                }}
                disabled={!observation}
                style={{
                  flex: 1,
                  padding: "9px 0",
                  background: !observation
                    ? "rgba(255,255,255,0.04)"
                    : "rgba(234,179,8,0.14)",
                  border: !observation
                    ? "1px solid rgba(255,255,255,0.08)"
                    : "1.5px solid rgba(234,179,8,0.38)",
                  borderRadius: 7,
                  color: !observation ? "rgba(255,255,255,0.35)" : "#eab308",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: !observation ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                }}
              >
                ⚖️ {uiText.revealVerdict}
              </button>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => void reset()}
                disabled={isRunning}
                style={{
                  flex: 1,
                  padding: "7px 0",
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 7,
                  color: "rgba(255,255,255,0.4)",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                ↺ {uiText.reset}
              </button>
              <button
                onClick={() => void step()}
                disabled={isRunning || !observation}
                style={{
                  flex: 1,
                  padding: "7px 0",
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 7,
                  color: "rgba(255,255,255,0.4)",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                ⏭ {uiText.step}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ╔═══════════════════════════════════╗
          ║          VERDICT MODAL            ║
          ╚═══════════════════════════════════╝ */}
      <AnimatePresence>
        {isVerdictOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 50,
              background: "rgba(0,0,0,0.85)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 20,
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              style={{
                background: "#0d0d0d",
                border: "1px solid rgba(234,179,8,0.16)",
                borderRadius: 16,
                padding: 28,
                width: "100%",
                maxWidth: 500,
              }}
            >
              <div
                style={{
                  fontSize: 19,
                  fontWeight: 800,
                  color: "#fff",
                  marginBottom: 4,
                }}
              >
                ⚖️ {uiText.finalVerdict}
              </div>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: pressureTagBg,
                  marginBottom: 20,
                }}
              >
                {verdictLabel}
              </div>
              {!observation && (
                <div
                  style={{
                    fontSize: 12,
                    color: "rgba(255,255,255,0.6)",
                    marginBottom: 14,
                  }}
                >
                  {uiText.resetToBegin}
                </div>
              )}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                  marginBottom: 18,
                }}
              >
                {[
                  [
                    uiText.score,
                    `${Math.round((observation?.task_score ?? 0) * 100)}%`,
                  ],
                  [uiText.pressure, `${pct}%`],
                ].map(([label, val]) => (
                  <div
                    key={label}
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 8,
                      padding: "9px 12px",
                      fontSize: 12,
                      color: "#fff",
                    }}
                  >
                    {label}: <strong>{val}</strong>
                  </div>
                ))}
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3,1fr)",
                  gap: 6,
                  marginBottom: 22,
                }}
              >
                {(observation?.juror_moods ?? []).map((_, i) => {
                  const vote = revealedVotes[i];
                  const guilty = vote === dict.verdict.guilty;
                  return (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, scale: 0.85 }}
                      animate={{ opacity: vote ? 1 : 0.2, scale: 1 }}
                      style={{
                        background: vote
                          ? guilty
                            ? "rgba(239,68,68,0.1)"
                            : "rgba(34,197,94,0.1)"
                          : "rgba(255,255,255,0.03)",
                        border: `1px solid ${vote ? (guilty ? "rgba(239,68,68,0.28)" : "rgba(34,197,94,0.28)") : "rgba(255,255,255,0.06)"}`,
                        borderRadius: 7,
                        padding: "7px 10px",
                        fontSize: 11,
                        color: vote
                          ? guilty
                            ? "#fca5a5"
                            : "#86efac"
                          : "rgba(255,255,255,0.2)",
                        textAlign: "center",
                      }}
                    >
                      Juror {i + 1}: {vote || "…"}
                    </motion.div>
                  );
                })}
              </div>
              <button
                onClick={() => setVerdictOpen(false)}
                style={{
                  width: "100%",
                  padding: "10px 0",
                  background: "rgba(234,179,8,0.11)",
                  border: "1.5px solid rgba(234,179,8,0.32)",
                  borderRadius: 8,
                  color: "#eab308",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
