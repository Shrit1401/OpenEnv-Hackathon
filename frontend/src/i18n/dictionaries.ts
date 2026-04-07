import type { AppLanguage } from '@/store/simulation'

type Dictionary = {
  ui: {
    title: string
    subtitle: string
    case: string
    phase: string
    language: string
    pressure: string
    runStatus: string
    online: string
    offline: string
    idle: string
    running: string
    reset: string
    step: string
    autoplay: string
    pause: string
    revealVerdict: string
    transcript: string
    reasoning: string
    events: string
    noEvents: string
    lastAction: string
    witnessStand: string
    defenseTable: string
    prosecutionTable: string
    juryBox: string
    judgeBench: string
    finalVerdict: string
    score: string
  }
  phases: Record<string, string>
  actions: Record<string, string>
  mood: Record<string, string>
  verdict: {
    established: string
    secured: string
    hung: string
    guilty: string
    notGuilty: string
  }
  transcriptTemplates: {
    defenseCalls: string
    jurorAttention: string
    pressureShift: string
    actionApplied: string
  }
}

export const dictionaries: Record<AppLanguage, Dictionary> = {
  en: {
    ui: {
      title: 'Courtroom Simulation Console',
      subtitle: 'A restrained legal-tech dashboard for jury dynamics and defense decisions.',
      case: 'Case',
      phase: 'Phase',
      language: 'Language',
      pressure: 'Conviction Pressure',
      runStatus: 'Run Status',
      online: 'Online',
      offline: 'Offline',
      idle: 'Idle',
      running: 'Running',
      reset: 'Reset',
      step: 'Step',
      autoplay: 'Autoplay',
      pause: 'Pause',
      revealVerdict: 'Reveal Verdict',
      transcript: 'Live Transcript',
      reasoning: 'Agent Reasoning',
      events: 'Event Log',
      noEvents: 'No courtroom events yet.',
      lastAction: 'Last Action',
      witnessStand: 'Witness Stand',
      defenseTable: 'Defense Table',
      prosecutionTable: 'Prosecution Table',
      juryBox: 'Jury Box',
      judgeBench: 'Judge Bench',
      finalVerdict: 'Final Verdict',
      score: 'Task Score',
    },
    phases: {
      voir_dire: 'Voir Dire',
      witness_exam: 'Witness Examination',
      cross_examination: 'Cross Examination',
      closing: 'Closing Argument',
      verdict: 'Verdict',
    },
    actions: {
      probe_bias: 'Probe Bias',
      challenge_juror: 'Challenge Juror',
      accept_panel: 'Accept Panel',
      call_witness: 'Call Witness',
      request_recess: 'Request Recess',
      gentle_cross: 'Gentle Cross',
      aggressive_cross: 'Aggressive Cross',
      impeach_witness: 'Impeach Witness',
      closing_emotional: 'Emotional Closing',
      closing_reasonable_doubt: 'Reasonable Doubt Closing',
      closing_procedural: 'Procedural Closing',
    },
    mood: {
      hostile: 'Hostile',
      neutral: 'Neutral',
      receptive: 'Receptive',
      disengaged: 'Disengaged',
    },
    verdict: {
      established: 'Reasonable Doubt Established',
      secured: 'Conviction Secured',
      hung: 'Hung Jury',
      guilty: 'Guilty',
      notGuilty: 'Not Guilty',
    },
    transcriptTemplates: {
      defenseCalls: 'Defense calls {witness}.',
      jurorAttention: 'Juror {id} appears more attentive.',
      pressureShift: 'Conviction pressure moved to {value}%.',
      actionApplied: 'Defense executes: {action}.',
    },
  },
  hi: {
    ui: {
      title: 'कोर्टरूम सिमुलेशन कंसोल',
      subtitle: 'जूरी की प्रतिक्रिया और रक्षा पक्ष के निर्णयों के लिए एक संतुलित लीगल-टेक डैशबोर्ड।',
      case: 'मुकदमा',
      phase: 'चरण',
      language: 'भाषा',
      pressure: 'दोषसिद्धि दबाव',
      runStatus: 'स्थिति',
      online: 'ऑनलाइन',
      offline: 'ऑफलाइन',
      idle: 'रुका हुआ',
      running: 'चल रहा है',
      reset: 'रीसेट',
      step: 'स्टेप',
      autoplay: 'ऑटो रन',
      pause: 'रोकें',
      revealVerdict: 'फैसला दिखाएं',
      transcript: 'लाइव ट्रांसक्रिप्ट',
      reasoning: 'एजेंट तर्क',
      events: 'इवेंट लॉग',
      noEvents: 'अभी कोई कोर्ट इवेंट नहीं।',
      lastAction: 'पिछला एक्शन',
      witnessStand: 'गवाह मंच',
      defenseTable: 'रक्षा पक्ष टेबल',
      prosecutionTable: 'अभियोजन टेबल',
      juryBox: 'जूरी बॉक्स',
      judgeBench: 'न्यायाधीश मंच',
      finalVerdict: 'अंतिम निर्णय',
      score: 'टास्क स्कोर',
    },
    phases: {
      voir_dire: 'जूरी चयन',
      witness_exam: 'गवाह परीक्षण',
      cross_examination: 'जिरह',
      closing: 'अंतिम बहस',
      verdict: 'निर्णय',
    },
    actions: {
      probe_bias: 'पक्षपात जाँचें',
      challenge_juror: 'जूरर हटाएं',
      accept_panel: 'पैनल स्वीकारें',
      call_witness: 'गवाह बुलाएं',
      request_recess: 'विराम मांगें',
      gentle_cross: 'सॉफ्ट जिरह',
      aggressive_cross: 'कठोर जिरह',
      impeach_witness: 'गवाह पर प्रश्न',
      closing_emotional: 'भावनात्मक समापन',
      closing_reasonable_doubt: 'उचित संदेह समापन',
      closing_procedural: 'प्रक्रियात्मक समापन',
    },
    mood: {
      hostile: 'विरोधी',
      neutral: 'तटस्थ',
      receptive: 'सकारात्मक',
      disengaged: 'उदासीन',
    },
    verdict: {
      established: 'उचित संदेह स्थापित',
      secured: 'दोषसिद्धि सुनिश्चित',
      hung: 'अटका हुआ जूरी',
      guilty: 'दोषी',
      notGuilty: 'निर्दोष',
    },
    transcriptTemplates: {
      defenseCalls: 'रक्षा पक्ष {witness} को बुलाता है।',
      jurorAttention: 'जूरर {id} अधिक ध्यान दे रहा है।',
      pressureShift: 'दोषसिद्धि दबाव {value}% पर आया।',
      actionApplied: 'रक्षा पक्ष ने किया: {action}।',
    },
  },
  kn: {
    ui: {
      title: 'ನ್ಯಾಯಾಲಯ ಸಿಮ್ಯುಲೇಶನ್ ಕನ್ಸೋಲ್',
      subtitle: 'ಜೂರಿ ಪ್ರತಿಕ್ರಿಯೆ ಮತ್ತು ರಕ್ಷಣಾ ತಂತ್ರಗಳಿಗೆ ಸಮತೋಲನಿತ ಲೀಗಲ್-ಟೆಕ್ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್.',
      case: 'ಕೇಸ್',
      phase: 'ಹಂತ',
      language: 'ಭಾಷೆ',
      pressure: 'ದೋಷದ ಒತ್ತಡ',
      runStatus: 'ಸ್ಥಿತಿ',
      online: 'ಆನ್ಲೈನ್',
      offline: 'ಆಫ್ಲೈನ್',
      idle: 'ನಿಲ್ಲಿಸಲಾಗಿದೆ',
      running: 'ನಡೀತಿದೆ',
      reset: 'ಮರುಹೊಂದಿಸಿ',
      step: 'ಹಂತ',
      autoplay: 'ಸ್ವಯಂಚಾಲಿತ',
      pause: 'ನಿಲ್ಲಿಸಿ',
      revealVerdict: 'ತೀರ್ಪು ತೋರಿಸಿ',
      transcript: 'ಲೈವ್ ಟ್ರಾನ್ಸ್ಕ್ರಿಪ್ಟ್',
      reasoning: 'ಏಜೆಂಟ್ ತರ್ಕ',
      events: 'ಈವೆಂಟ್ ಲಾಗ್',
      noEvents: 'ಇನ್ನೂ ನ್ಯಾಯಾಲಯ ಘಟನೆಗಳಿಲ್ಲ.',
      lastAction: 'ಕೊನೆಯ ಕ್ರಿಯೆ',
      witnessStand: 'ಸಾಕ್ಷಿ ಸ್ಥಾನ',
      defenseTable: 'ರಕ್ಷಣಾ ಮೇಜು',
      prosecutionTable: 'ಅಭಿಯೋಗ ಮೇಜು',
      juryBox: 'ಜೂರಿ ಬಾಕ್ಸ್',
      judgeBench: 'ನ್ಯಾಯಾಧೀಶ ವೇದಿ',
      finalVerdict: 'ಅಂತಿಮ ತೀರ್ಪು',
      score: 'ಟಾಸ್ಕ್ ಸ್ಕೋರ್',
    },
    phases: {
      voir_dire: 'ಜೂರಿ ಆಯ್ಕೆ',
      witness_exam: 'ಸಾಕ್ಷಿ ಪರೀಕ್ಷೆ',
      cross_examination: 'ಪ್ರತಿಪ್ರಶ್ನೆ',
      closing: 'ಅಂತಿಮ ವಾದ',
      verdict: 'ತೀರ್ಪು',
    },
    actions: {
      probe_bias: 'ಪಕ್ಷಪಾತ ಪರೀಕ್ಷೆ',
      challenge_juror: 'ಜೂರರ್ ತೆಗೆದುಹಾಕಿ',
      accept_panel: 'ಪ್ಯಾನಲ್ ಒಪ್ಪಿಕೆ',
      call_witness: 'ಸಾಕ್ಷಿ ಕರೆ',
      request_recess: 'ವಿರಾಮ ಕೇಳಿ',
      gentle_cross: 'ಸೌಮ್ಯ ಪ್ರತಿಪ್ರಶ್ನೆ',
      aggressive_cross: 'ತೀವ್ರ ಪ್ರತಿಪ್ರಶ್ನೆ',
      impeach_witness: 'ಸಾಕ್ಷಿಯನ್ನು ಪ್ರಶ್ನಿಸಿ',
      closing_emotional: 'ಭಾವನಾತ್ಮಕ ಅಂತ್ಯ',
      closing_reasonable_doubt: 'ಸಂದೇಹ ಆಧಾರಿತ ಅಂತ್ಯ',
      closing_procedural: 'ಪ್ರಕ್ರಿಯಾತ್ಮಕ ಅಂತ್ಯ',
    },
    mood: {
      hostile: 'ವಿರೋಧಿ',
      neutral: 'ತಟಸ್ಥ',
      receptive: 'ಸ್ವೀಕಾರಾರ್ಹ',
      disengaged: 'ಅಲಕ್ಷ್ಯ',
    },
    verdict: {
      established: 'ಸಮಂಜಸ ಸಂದೇಹ ಸ್ಥಾಪನೆ',
      secured: 'ದೋಷಾರೋಪಣೆ ದೃಢ',
      hung: 'ತೂಗು ಜೂರಿ',
      guilty: 'ದೋಷಿ',
      notGuilty: 'ದೋಷಿಯಲ್ಲ',
    },
    transcriptTemplates: {
      defenseCalls: 'ರಕ್ಷಣಾ ಪಕ್ಷ {witness} ಅವರನ್ನು ಕರೆಸಿತು.',
      jurorAttention: 'ಜೂರರ್ {id} ಹೆಚ್ಚು ಗಮನ ಹರಿಸುತ್ತಿದ್ದಾರೆ.',
      pressureShift: 'ದೋಷದ ಒತ್ತಡ {value}%ಕ್ಕೆ ಬಂತು.',
      actionApplied: 'ರಕ್ಷಣಾ ಕ್ರಮ: {action}.',
    },
  },
  te: {
    ui: {
      title: 'కోర్ట్‌రూమ్ సిమ్యులేషన్ కన్సోల్',
      subtitle: 'జ్యూరీ ప్రతిస్పందనలు మరియు రక్షణ నిర్ణయాల కోసం మినిమల్ లీగల్-టెక్ డ్యాష్‌బోర్డ్.',
      case: 'కేసు',
      phase: 'దశ',
      language: 'భాష',
      pressure: 'దోష నిర్ధారణ ఒత్తిడి',
      runStatus: 'స్థితి',
      online: 'ఆన్లైన్',
      offline: 'ఆఫ్లైన్',
      idle: 'నిష్క్రియ',
      running: 'నడుస్తోంది',
      reset: 'రీసెట్',
      step: 'స్టెప్',
      autoplay: 'ఆటోప్లే',
      pause: 'విరమించు',
      revealVerdict: 'తీర్పు చూపు',
      transcript: 'లైవ్ ట్రాన్స్క్రిప్ట్',
      reasoning: 'ఏజెంట్ విశ్లేషణ',
      events: 'ఈవెంట్ లాగ్',
      noEvents: 'ఇంకా కోర్ట్ ఈవెంట్లు లేవు.',
      lastAction: 'చివరి చర్య',
      witnessStand: 'సాక్షి స్థానం',
      defenseTable: 'రక్షణ పట్టిక',
      prosecutionTable: 'అభియోగ పట్టిక',
      juryBox: 'జ్యూరీ బాక్స్',
      judgeBench: 'న్యాయమూర్తి బెంచ్',
      finalVerdict: 'తుది తీర్పు',
      score: 'టాస్క్ స్కోర్',
    },
    phases: {
      voir_dire: 'జ్యూరీ ఎంపిక',
      witness_exam: 'సాక్షి విచారణ',
      cross_examination: 'ప్రతిప్రశ్న',
      closing: 'ముగింపు వాదన',
      verdict: 'తీర్పు',
    },
    actions: {
      probe_bias: 'పక్షపాతం పరిశీలన',
      challenge_juror: 'జ్యూరర్ ను తొలగించు',
      accept_panel: 'ప్యానెల్ అంగీకారం',
      call_witness: 'సాక్షిని పిలువు',
      request_recess: 'విరామం కోరండి',
      gentle_cross: 'సున్నితమైన ప్రతిప్రశ్న',
      aggressive_cross: 'తీవ్ర ప్రతిప్రశ్న',
      impeach_witness: 'సాక్షి నమ్మకం దెబ్బతీయు',
      closing_emotional: 'భావోద్వేగ ముగింపు',
      closing_reasonable_doubt: 'సందేహ ఆధార ముగింపు',
      closing_procedural: 'ప్రక్రియా ముగింపు',
    },
    mood: {
      hostile: 'విరోధం',
      neutral: 'తటస్థం',
      receptive: 'సానుకూలం',
      disengaged: 'అలసట',
    },
    verdict: {
      established: 'సందేహం స్థాపించబడింది',
      secured: 'దోష నిర్ధారణ సాధ్యమైంది',
      hung: 'హంగ్ జ్యూరీ',
      guilty: 'దోషి',
      notGuilty: 'దోషి కాదు',
    },
    transcriptTemplates: {
      defenseCalls: 'రక్షణ పక్షం {witness} ను పిలిచింది.',
      jurorAttention: 'జ్యూరర్ {id} మరింత శ్రద్ధ చూపుతున్నాడు.',
      pressureShift: 'దోష ఒత్తిడి {value}%కి మారింది.',
      actionApplied: 'రక్షణ చర్య: {action}.',
    },
  },
}
