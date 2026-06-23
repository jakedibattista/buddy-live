import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import { sessionDocPath } from "@/lib/paths";
import type { VoiceResumeContext } from "@/lib/hiddenAgentMessages";
import type { LiveSessionDoc, RepDoc } from "@/lib/types";

const LEAD_IN_MS = 3000;

function warmupTimerActiveFromDoc(session: LiveSessionDoc): {
  active: boolean;
  label: string | null;
} {
  const startedRaw = session.warmup_timer_started_at;
  const seconds = session.last_warmup_timer_seconds;
  const label = session.last_warmup_timer_label ?? null;
  if (!startedRaw || typeof seconds !== "number") {
    return { active: false, label: null };
  }
  const startedMs = new Date(startedRaw).getTime();
  if (Number.isNaN(startedMs)) {
    return { active: false, label: null };
  }
  const endMs = startedMs + LEAD_IN_MS + seconds * 1000;
  const active = Date.now() < endMs;
  return { active, label: active ? label : null };
}

/**
 * Read live session + reps from Firestore immediately before a voice reconnect
 * note is sent. The onSnapshot listener can lag Admin SDK writes; a one-shot
 * getDoc/getDocs avoids stale reconnect context (session live-h27pjmlwskuq).
 */
export async function fetchVoiceResumeContext(
  sessionId: string,
  overlay?: Pick<VoiceResumeContext, "warmupTimerActive" | "warmupTimerLabel">,
): Promise<VoiceResumeContext> {
  const db = getDb();
  if (!db) {
    return {
      repCount: 0,
      setupFramingPassed: false,
      warmupTimerActive: overlay?.warmupTimerActive ?? false,
      warmupTimerLabel: overlay?.warmupTimerLabel ?? null,
    };
  }

  const sessionSnap = await getDoc(doc(db, sessionDocPath(sessionId)));
  const session = sessionSnap.exists() ? (sessionSnap.data() as LiveSessionDoc) : null;

  const repsSnap = await getDocs(collection(db, `${sessionDocPath(sessionId)}/reps`));
  const reps: RepDoc[] = [];
  repsSnap.forEach((d) => {
    const data = d.data() as RepDoc;
    reps.push({ ...data, rep_id: data.rep_id ?? d.id });
  });
  reps.sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));

  const currentPhase = session?.currentPhase;
  const resultsReady = Boolean(session?.results_ready_at);
  const lastRepId = reps.length > 0 ? reps[reps.length - 1].rep_id : null;
  const awaitingReview =
    resultsReady && currentPhase !== "recap" && currentPhase !== "ended";

  const fromDoc = session ? warmupTimerActiveFromDoc(session) : { active: false, label: null };
  const warmupTimerActive = overlay?.warmupTimerActive ?? fromDoc.active;
  const warmupTimerLabel = overlay?.warmupTimerActive
    ? overlay.warmupTimerLabel ?? null
    : fromDoc.label;

  return {
    playerName: session?.player_name ?? null,
    focusDrill: session?.focus_drill ?? null,
    currentPhase,
    repCount: reps.length,
    setupFramingPassed: session?.setup_framing_passed === true,
    lastRepId,
    awaitingReview,
    warmupTimerActive,
    warmupTimerLabel,
  };
}
