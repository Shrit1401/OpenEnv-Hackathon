import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSimulationStore } from "@/store/simulation";
import { tAction, template } from "@/i18n/translate";
import type { AppLanguage } from "@/store/simulation";

// ─── Constants ────────────────────────────────────────────────────────────────

const CASES: Record<string, string> = {
  reasonable_doubt: "State v. Mercer",
  poisoned_panel: "State v. Aldridge",
  the_impossible_case: "State v. Harmon",
};

const PHASES = [
  "voir_dire",
  "witness_exam",
  "cross_examination",
  "closing",
  "verdict",
] as const;
const PHASE_LABELS: Record<string, string> = {
  voir_dire: "Voir Dire",
  witness_exam: "Opening",
  cross_examination: "Testimony",
  closing: "Closing",
  verdict: "Verdict",
};

const MOOD_LABEL: Record<string, string> = {
  receptive: "Leaning Not Guilty",
  hostile: "Guilty",
  neutral: "On the Fence",
  disengaged: "Undecided",
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

const SPEAKER_CYCLE = ["Judge", "Defense", "Prosecution", "Juror #4", "Judge"];
const SPEAKER_COLOR: Record<string, string> = {
  Judge: "#eab308",
  Defense: "#60a5fa",
  Prosecution: "#f87171",
  "Juror #4": "#a78bfa",
};

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

  // ── Effects ──────────────────────────────────────────────────────────────

  useEffect(() => {
    void checkHealth();
  }, [checkHealth]);

  useEffect(() => {
    if (!observation) return;
    const action = tAction(
      language,
      observation.valid_actions[0] ?? "probe_bias",
    );
    pushTranscript({
      id: `${observation.step_index}-${Date.now()}`,
      step: observation.step_index,
      text:
        observation.last_event ||
        template(language, "actionApplied", { action }),
      tone: "neutral",
    });
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

  // ── Derived ───────────────────────────────────────────────────────────────

  const revealedVotes = useMemo(() => {
    if (!observation) return [];
    return observation.juror_moods.map((mood, i) =>
      i > verdictRevealIndex
        ? ""
        : mood === "hostile"
          ? "Guilty"
          : "Not Guilty",
    );
  }, [observation, verdictRevealIndex]);

  const verdictLabel = useMemo(() => {
    if (!observation) return "";
    if (observation.conviction_pressure < 0.4)
      return "Reasonable Doubt Established";
    if (observation.conviction_pressure > 0.65) return "Conviction Secured";
    return "Hung Jury";
  }, [observation]);

  const pressure = observation?.conviction_pressure ?? 0;
  const pct = Math.round(pressure * 100);
  const pressureTag =
    pressure < 0.4
      ? "NOT GUILTY"
      : pressure > 0.65
        ? "LEANING GUILTY"
        : "ON THE FENCE";
  const pressureTagBg =
    pressure < 0.4 ? "#15803d" : pressure > 0.65 ? "#dc2626" : "#a16207";

  const phase = observation?.phase ?? "voir_dire";
  const phaseIdx = PHASES.indexOf(phase as (typeof PHASES)[number]);
  const phaseLabel = PHASE_LABELS[phase] ?? phase.replace("_", " ");

  const formattedTranscript = useMemo(
    () =>
      transcript.slice(0, 20).map((entry, i) => {
        const base = new Date(Date.now() - (transcript.length - i) * 75_000);
        const hh = String(base.getHours() % 12 || 12).padStart(2, "0");
        const mm = String(base.getMinutes()).padStart(2, "0");
        const ss = String(base.getSeconds()).padStart(2, "0");
        const ap = base.getHours() >= 12 ? "PM" : "AM";
        return {
          ...entry,
          speaker: SPEAKER_CYCLE[i % SPEAKER_CYCLE.length],
          time: `${hh}:${mm}:${ss} ${ap}`,
        };
      }),
    [transcript],
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
          height: 58,
          flexShrink: 0,
          zIndex: 30,
          display: "flex",
          alignItems: "center",
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
              Courtroom Simulation
            </div>
            <div
              style={{
                fontSize: 10,
                color: "rgba(255,255,255,0.32)",
                marginTop: 1,
              }}
            >
              {caseName} • {observation ? "Session Active" : "Ready"}
            </div>
          </div>
        </div>

        {/* Phase pill — absolute center */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(0,0,0,0.6)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 99,
            padding: "5px 24px",
            textAlign: "center",
            pointerEvents: "none",
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
            PHASE:{" "}
            <span style={{ color: "#fff", fontWeight: 700 }}>
              {phaseLabel.toUpperCase()}
            </span>
          </div>
          <div
            style={{
              fontSize: 9,
              color: "rgba(255,255,255,0.25)",
              marginTop: 1,
            }}
          >
            Jury Selection &amp; Opening Statements
          </div>
        </div>

        {/* Right controls */}
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <select
            value={selectedTask}
            onChange={(e) =>
              setTask(
                e.target.value,
                CASES[e.target.value] ?? CASES.reasonable_doubt,
              )
            }
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 6,
              color: "rgba(255,255,255,0.65)",
              padding: "4px 9px",
              fontSize: 11,
              outline: "none",
              cursor: "pointer",
            }}
          >
            <option value="reasonable_doubt">State v. Mercer</option>
            <option value="poisoned_panel">State v. Aldridge</option>
            <option value="the_impossible_case">State v. Harmon</option>
          </select>

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
              API {health === "healthy" ? "Online" : "Offline"}
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
          {/* Static hosted background image */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: "url(https://i.postimg.cc/5N98bjVq/bg.png)",
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
              background: "rgba(0,0,0,0.52)",
              backdropFilter: "blur(8px)",
              border: "1px solid rgba(255,255,255,0.09)",
              borderRadius: 99,
              padding: "5px 13px",
              fontSize: 11,
              color: "rgba(255,255,255,0.78)",
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
            Courtroom is Live
          </div>

          {/* ── Defense card ── */}
          <div
            style={{
              position: "absolute",
              left: 14,
              top: "35%",
              zIndex: 10,
              background: "rgba(0,0,0,0.55)",
              backdropFilter: "blur(10px)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 10,
              padding: "10px 13px",
              minWidth: 142,
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
                Defense
              </span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>
              Adv. Arjun Mehta
            </div>
            <div
              style={{
                fontSize: 10,
                color: "rgba(255,255,255,0.35)",
                marginTop: 2,
              }}
            >
              For the Accused
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
              background: "rgba(0,0,0,0.55)",
              backdropFilter: "blur(10px)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 10,
              padding: "10px 13px",
              minWidth: 142,
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
                Prosecution
              </span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>
              Adv. Priya Singh
            </div>
            <div
              style={{
                fontSize: 10,
                color: "rgba(255,255,255,0.35)",
                marginTop: 2,
              }}
            >
              For the State
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
              background: "rgba(0,0,0,0.65)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(255,255,255,0.09)",
              borderRadius: 14,
              padding: "14px 26px",
              minWidth: 300,
              textAlign: "center",
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
              Conviction Pressure <span style={{ opacity: 0.4 }}>ⓘ</span>
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
              <span>Not Guilty</span>
              <span>Beyond Reasonable Doubt</span>
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
                      {MOOD_LABEL[mood] ?? mood}
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
                      {MOOD_LABEL[mood] ?? mood}
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
                Courtroom Audio
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
                  LIVE
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
                        {PHASE_LABELS[p]}
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
                ⏱ Session Time
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
                Reset simulation to begin
              </div>
            )}
            <AnimatePresence initial={false}>
              {formattedTranscript.map((entry) => {
                const sc =
                  SPEAKER_COLOR[entry.speaker] ?? "rgba(255,255,255,0.32)";
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
                      background: "rgba(255,255,255,0.022)",
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
              Auto-Transcribing in {LANG_NAMES[language]}
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
              Quick Actions
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
                {isAutoplay ? "⏸ Pause" : "▶ Play"}
              </button>
              <button
                onClick={() => setVerdictOpen(true)}
                style={{
                  flex: 1,
                  padding: "9px 0",
                  background: "rgba(234,179,8,0.14)",
                  border: "1.5px solid rgba(234,179,8,0.38)",
                  borderRadius: 7,
                  color: "#eab308",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                }}
              >
                ⚖️ Reveal Verdict
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
                ↺ Reset
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
                ⏭ Step
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
                ⚖️ Final Verdict
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
                    "Score",
                    `${Math.round((observation?.task_score ?? 0) * 100)}%`,
                  ],
                  ["Pressure", `${pct}%`],
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
                  const guilty = vote === "Guilty";
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
