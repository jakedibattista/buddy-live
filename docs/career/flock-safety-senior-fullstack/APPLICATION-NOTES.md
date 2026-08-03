# Application notes — Flock Safety Senior Fullstack (Cloud Video)

Honest positioning for Jake DiBattista. No invented titles, years, or stack depth.

## Role match (what maps cleanly)

| Job asks for | Your evidence (true) |
| --- | --- |
| React, TypeScript, Node.js | Buddy Live, coaches dashboard, marketing site (Next.js/TS); Puck Buddy (RN/Expo/TS); Node API routes |
| Frontend-primary fullstack | You own UI + APIs + deploy; not backend-only |
| Live / interactive video UX | Webcam MediaRecorder, WebRTC voice, scorecard dashboards, clip upload pipelines |
| UI performance under real constraints | Signed-URL uploads past 4.5 MB limits; Android 4K→~20 MB compression; WebRTC reconnect/keepalive |
| API design, client–server | Upload-url → PUT → finalize; Firestore session commands; Cloud Run SSE |
| Cloud + containers (AWS/Docker/K8s) | Docker on Cloud Run (GCP); AWS Cloud Practitioner + AI Practitioner certs—not deep AWS prod fleets |
| Fast-paced shipping | Founder shipping mobile + web + infra; hackathon grand prize → Next ’25 keynote demo |

## What not to stretch (keep truthful in interviews)

1. **Title:** Your title is Founder & Lead Engineer / CTO—not “Senior Software Engineer at X for N years.” Frame seniority via ownership and shipped systems.
2. **Video domain:** You built interactive capture + analysis UIs, not a multi-camera low-latency VMS like Flock’s. The JD says they will teach video domain if frontend depth is there—lean on that.
3. **AWS/Kubernetes:** Certs + container familiarity yes; do not claim production K8s or large AWS video fleets. Say: “Production containers on Cloud Run/Docker; AWS foundations via certification; ready to work in Flock’s cloud stack.”
4. **Sam’s Club:** LinkedIn: Design Researcher who engineered the GenAI support iteration rolled out to 1% of members. Do not re-title that role as Staff SWE. About-page “600K+ users” ≈ 1% of Sam’s membership—prefer LinkedIn’s “1% of members” wording unless you independently confirm the headcount.
5. **Scale:** 1,000+ downloads / ~20 DAU is real traction for a young consumer app—not enterprise traffic. Emphasize **reliability under live sessions** and **architecture choices**, not fake QPS.
6. **MBA line:** LinkedIn education lists M.A. Design Leadership (MICA). The program partners with Johns Hopkins Carey; your post references an MBA. Resume uses “M.A., Design Leadership — MICA, with Johns Hopkins Carey Business School.” If you completed the dual MBA, you can add “M.B.A., Johns Hopkins Carey” explicitly; if not, leave as written.

## Resume files

- Printable HTML → PDF: `Jake-DiBattista-Resume-Flock-Safety.html`
- Plain text / ATS paste: `Jake-DiBattista-Resume-Flock-Safety.md`
- Cover letter: `COVER-LETTER.md`

## Apply checklist

1. Export HTML → PDF (Letter, no headers/footers).
2. Paste cover letter into Ashby (shorten if character-limited).
3. Link GitHub + Buddy Live demo if the form allows portfolio URLs.
4. Optional phone: add your number in the HTML contact line before exporting (not stored here).
5. Ashby posting: https://jobs.ashbyhq.com/Flock%20Safety/00618574-90ae-4065-989d-ae878243d399

## Interview story bank (facts only)

- **413 → signed PUT:** Video bytes stopped going through Vercel; browser uploads to Storage; finalize with JSON.
- **WebRTC over websocket:** Silence was killing sessions; migrated to WebRTC + keepalive pulse + reconnect with session resume.
- **Cloud Run instance pinning:** In-memory ADK session + multi-instance scale caused cold re-greets; pinned for continuity and documented the durable fix path.
- **Android compression:** Preserve MediaPipe motion detail while cutting upload size from hundreds of MB to ~20 MB.
- **Keynote:** MLB Pitcher Scorecard — CV preprocess + Gemini — grand prize, Next 2025 developer keynote.
