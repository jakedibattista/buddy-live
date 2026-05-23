import type { RepDoc, TranscriptEntry } from "@/lib/types";

/**
 * Scripted demo session. Played back by /coach/demo so the hackathon video isn't
 * dependent on live network conditions. Each event has a relative `tMs` offset
 * from "play" so we can recreate the pacing of a real 10-minute session in 90s.
 */
export interface ScriptedEvent {
  tMs: number;
  kind: "say" | "user" | "drill" | "rep_create" | "rep_update";
  payload: Record<string, unknown>;
}

export const DEMO_SCRIPT: ScriptedEvent[] = [
  { tMs: 500, kind: "say", payload: { text: "Hey, I'm Coach Buddy. What's your name?" } },
  { tMs: 4000, kind: "user", payload: { text: "Hey Coach, I'm Jake." } },
  {
    tMs: 5500,
    kind: "say",
    payload: { text: "Awesome, Jake. Step into frame and get in your shooting stance." },
  },
  { tMs: 11000, kind: "say", payload: { text: "Stance looks great. Let's do three wristshots." } },

  // Wristshot 1
  { tMs: 13000, kind: "drill", payload: { drillId: "wristshot", hint: "Wristshot 1 — go on your time." } },
  {
    tMs: 13500,
    kind: "rep_create",
    payload: {
      rep_id: "demo-w1",
      drill_id: "wristshot",
      status: "capturing",
      created_at: new Date(Date.now()).toISOString(),
    },
  },
  { tMs: 18000, kind: "rep_update", payload: { rep_id: "demo-w1", status: "analyzing" } },
  { tMs: 18500, kind: "say", payload: { text: "Got it. Processing that one — next one." } },

  // Wristshot 2
  { tMs: 20000, kind: "drill", payload: { drillId: "wristshot", hint: "Wristshot 2." } },
  {
    tMs: 20500,
    kind: "rep_create",
    payload: {
      rep_id: "demo-w2",
      drill_id: "wristshot",
      status: "capturing",
      created_at: new Date(Date.now()).toISOString(),
    },
  },
  { tMs: 25000, kind: "rep_update", payload: { rep_id: "demo-w2", status: "analyzing" } },

  // Wristshot 1 result lands while still on wristshot 2
  {
    tMs: 27000,
    kind: "rep_update",
    payload: {
      rep_id: "demo-w1",
      status: "completed",
      results: {
        structured_shots: [
          {
            metrics: {
              front_knee_bend: 6.0,
              weight_transfer: 8.0,
              back_leg_push: 7.0,
              bottom_hand: 7.5,
              top_hand: 6.5,
              puck_starting_position: 8.0,
              stick_bend: 5.5,
              stance: 7.0,
            },
          },
        ],
        coach_summary: "Solid base. Knees a touch high — get lower to load the stick more.",
      },
    },
  },
  {
    tMs: 28000,
    kind: "say",
    payload: { text: "First wristshot back: front knee was a 6 — bend it deeper. Loved the weight transfer." },
  },

  // Wristshot 3
  { tMs: 31000, kind: "drill", payload: { drillId: "wristshot", hint: "Last wristshot — go." } },
  {
    tMs: 31500,
    kind: "rep_create",
    payload: {
      rep_id: "demo-w3",
      drill_id: "wristshot",
      status: "capturing",
      created_at: new Date(Date.now()).toISOString(),
    },
  },
  { tMs: 36000, kind: "rep_update", payload: { rep_id: "demo-w3", status: "analyzing" } },

  // Snapshot phase
  { tMs: 38000, kind: "say", payload: { text: "Nice. Let's switch to snapshots — one shot, lightning quick release." } },
  { tMs: 40000, kind: "drill", payload: { drillId: "snapshot", hint: "Snapshot 1." } },
  {
    tMs: 40500,
    kind: "rep_create",
    payload: {
      rep_id: "demo-s1",
      drill_id: "snapshot",
      status: "capturing",
      created_at: new Date(Date.now()).toISOString(),
    },
  },
  { tMs: 44000, kind: "rep_update", payload: { rep_id: "demo-s1", status: "analyzing" } },

  {
    tMs: 46000,
    kind: "rep_update",
    payload: {
      rep_id: "demo-w2",
      status: "completed",
      results: {
        structured_shots: [
          {
            metrics: {
              front_knee_bend: 6.5,
              weight_transfer: 8.5,
              back_leg_push: 7.5,
              bottom_hand: 8.0,
              top_hand: 7.0,
              puck_starting_position: 7.5,
              stick_bend: 6.5,
              stance: 7.5,
            },
          },
        ],
        coach_summary: "Much better knee bend. Top hand snap could pop more on release.",
      },
    },
  },
  {
    tMs: 47000,
    kind: "say",
    payload: { text: "Second wristshot: knee bend climbed to 6.5. Top hand needs more snap." },
  },

  {
    tMs: 50000,
    kind: "rep_update",
    payload: {
      rep_id: "demo-w3",
      status: "completed",
      results: {
        structured_shots: [
          {
            metrics: {
              front_knee_bend: 7.5,
              weight_transfer: 8.5,
              back_leg_push: 8.0,
              bottom_hand: 8.0,
              top_hand: 7.5,
              puck_starting_position: 8.0,
              stick_bend: 7.0,
              stance: 8.0,
            },
          },
        ],
        coach_summary: "There it is. Knee under 7.5, full kinetic chain. That's your shot.",
      },
    },
  },
  { tMs: 51500, kind: "say", payload: { text: "Third one is the one — 7.5 on the knee. Lock that feeling in." } },

  {
    tMs: 55000,
    kind: "rep_update",
    payload: {
      rep_id: "demo-s1",
      status: "completed",
      results: {
        structured_shots: [
          {
            metrics: {
              front_knee_bend: 7.0,
              weight_transfer: 7.5,
              back_leg_push: 7.5,
              bottom_hand: 8.5,
              top_hand: 8.0,
              puck_starting_position: 9.0,
              stick_bend: 8.0,
              stance: 7.5,
            },
          },
        ],
        coach_summary: "Snapshot release is quick. Puck position perfect. Drive your weight more next time.",
      },
    },
  },

  // Skating
  { tMs: 58000, kind: "say", payload: { text: "Final piece: show me your skating stride." } },
  { tMs: 60000, kind: "drill", payload: { drillId: "skating", hint: "Skate full strides toward the camera." } },
  {
    tMs: 60500,
    kind: "rep_create",
    payload: {
      rep_id: "demo-sk1",
      drill_id: "skating",
      status: "capturing",
      created_at: new Date(Date.now()).toISOString(),
    },
  },
  { tMs: 70000, kind: "rep_update", payload: { rep_id: "demo-sk1", status: "analyzing" } },
  {
    tMs: 74000,
    kind: "rep_update",
    payload: {
      rep_id: "demo-sk1",
      status: "completed",
      results: {
        scores: {
          lateral_push: 7.0,
          glide_phase: 6.5,
          quiet_upper_body: 8.0,
          foot_stays_under: 6.0,
          stride_count: 7.0,
        },
        coach_summary: "Push width is good. Front foot drifts wide — keep it under your hip.",
      },
    },
  },

  // Recap
  {
    tMs: 76000,
    kind: "say",
    payload: {
      text: "Great session, Jake. Biggest jump area: knee bend on wristshots. 50 wristshots a day this week.",
    },
  },
];

export const DEMO_TRANSCRIPT_SEED: TranscriptEntry[] = [];

export function emptyDemoReps(): Record<string, RepDoc> {
  return {};
}
