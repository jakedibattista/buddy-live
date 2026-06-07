# Buddy Live — architecture diagram (submission)

## System overview

```mermaid
flowchart TB
  subgraph Browser["Browser (Vercel /coach)"]
    UI[Next.js UI]
    CAM[Webcam + MediaRecorder]
    ELUI[ElevenLabs React SDK]
  end

  subgraph ElevenLabs["ElevenLabs Cloud"]
    VOICE[Agent: ASR + TTS + WebRTC]
  end

  subgraph GCP["Google Cloud Run"]
    ADK[buddy-live-adk<br/>FastAPI + ADK 2.0]
    ROOT[buddy_live_coach]
    DRILL[drill_coach]
    IQ[iq_coach]
    ADK --> ROOT
    ROOT --> DRILL
    ROOT --> IQ
  end

  subgraph Firebase["Firebase (puck-buddy)"]
    FS[(Firestore live_sessions)]
    GCS[(Storage rep clips)]
  end

  subgraph Analysis["Existing stack"]
    MFP[modelforpuckbuddy<br/>analyze-video]
  end

  ELUI <-->|WebRTC voice| VOICE
  VOICE -->|POST /chat/completions SSE| ADK
  ROOT -->|Gemini Flash| GEMINI[Gemini API]

  CAM -->|rep clip| UI
  UI -->|/api/clips| FS
  UI -->|signed upload| GCS

  DRILL -->|commands + reps| FS
  DRILL -->|analyze_rep| MFP
  MFP -->|results| FS
  UI -->|Firestore listeners| FS
```

## One turn (voice → brain → voice)

```mermaid
sequenceDiagram
  participant P as Player
  participant EL as ElevenLabs
  participant ADK as ADK Cloud Run
  participant G as Gemini Flash
  participant FS as Firestore

  P->>EL: speech (WebRTC)
  EL->>EL: ASR + turn end
  EL->>ADK: POST /chat/completions (user text + session id)
  ADK->>G: Runner + tools
  G-->>ADK: tool call e.g. start_rep_capture
  ADK->>FS: write command / rep doc
  ADK-->>EL: SSE text chunks
  EL->>P: TTS audio
```

## Track 2 optimization loop

```mermaid
flowchart LR
  SIM[User + Environment<br/>Simulation] --> EVAL[adk eval<br/>hallucinations_v1]
  EVAL --> OPT[GEPA Optimizer<br/>optional]
  LIVE[Live Vercel session] --> TRACE[Cloud Trace<br/>buddy_live.turn]
  TRACE --> FIX[Prompt + phase_guard fixes]
  FIX --> SIM
```

## Hosting map

| Component | Where |
| --- | --- |
| Web app + API routes | Vercel |
| ADK agent | Cloud Run `buddy-live-adk` |
| Voice | ElevenLabs |
| Data + clips | Firebase |
| Shot scoring | `api.buddysports.app` |
| Drill grounding | Vertex AI Search |
