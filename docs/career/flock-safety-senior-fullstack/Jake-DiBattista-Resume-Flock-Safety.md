# Jake DiBattista

**Fullstack Engineer · React / TypeScript · Real-time & Video Product UIs**

St. Petersburg, FL · Open to Remote (USA)  
jake.a.dibattista@gmail.com · [linkedin.com/in/jakedibattista](https://www.linkedin.com/in/jakedibattista/) · [github.com/jakedibattista](https://github.com/jakedibattista) · [buddysports.app](https://buddysports.app)

---

## Summary

Fullstack engineer and product founder who ships production React/TypeScript web apps with live media, realtime clients, and clean APIs. Recent work centers on interactive video capture UIs, WebRTC voice sessions, signed-URL video uploads, and performant client–server flows on containerized cloud backends—built end-to-end as Founder & Lead Engineer of Buddy Sports Tech.

---

## Core Skills

| Area | Tools / strengths |
| --- | --- |
| **Frontend** | React, TypeScript, Next.js (App Router), React Native / Expo, Tailwind CSS, responsive UI |
| **Realtime / Video** | WebRTC sessions, MediaRecorder webcam capture, Firestore listeners, video upload pipelines |
| **APIs & Backend** | Node.js route handlers, Python/FastAPI services, REST design, Firebase Auth/Storage |
| **Cloud & Ops** | GCP (Cloud Run, Firebase), Docker, Vercel; AWS Certified Cloud Practitioner & AI Practitioner |
| **Product delivery** | Cross-functional ownership from UX research → architecture → ship → production hardening |

---

## Experience

### Founder & Lead Engineer — Buddy Sports Tech  
**Sep 2025 – Present**

Architected and shipped Puck Buddy (iOS/Android), Buddy Live (web), coaches dashboard, and marketing site.

- Built **Buddy Live** in React/TypeScript (Next.js): live coaching UI with webcam capture (MediaRecorder), ElevenLabs **WebRTC** voice, Firestore realtime session state, auto-reconnect (up to 5 attempts), and scorecard dashboards.
- Designed client–server video APIs: browser mints short-lived **signed PUT URLs** and uploads clips directly to cloud storage, bypassing serverless body limits that previously caused 413 failures on multi-MB video.
- Shipped containerized Python services on **Google Cloud Run (Docker)** with SSE streaming to the web client; hardened production reliability (reconnect context, instance pinning for in-memory session continuity, Sentry/Cloud Trace).
- Led frontend for the **Puck Buddy** React Native (Expo) app and **Next.js coaches dashboard** (TypeScript, Firebase Auth session cookies, charts/stats)—same Firestore backend across mobile + web.
- Optimized video UX under device constraints: Android client-side compression to ~720p H.264 (~20 MB from multi-hundred-MB 4K clips) before upload, preserving motion detail for analysis.
- Grew Puck Buddy to **1,000+ downloads** with a sustained baseline of ~20 daily active users (Jan 2026), owning product, engineering, and release cycles.

### Design Researcher — Sam’s Club (Walmart)  
**Feb 2022 – Jun 2025**

- Partnered with product and engineering on in-club and online experiences; facilitated design-thinking workshops that shaped product roadmaps.
- Engineered the latest iteration of Sam’s Club’s **generative AI customer support** experience, rolled out to 1% of members.
- Designed an in-club tablet experience for navigation/product discovery; identified Scan & Go churn indicators used by the business in FY2024.

### CEO & Front-End Lead — Youni  
**Nov 2021 – Jan 2023**

- Led a team of 9 (engineering, design, marketing) building a React (Remix) web app integrating ChatGPT and blockchain APIs; deployed at 5 universities.
- Owned front-end design/engineering and company operations; Department of Labor XPU showcase finalist (presented in Washington, DC).

### Earlier roles — UX Research & Product (Softrams, SuperDVille, drchrono, SimpleVisit)  
**2016 – 2022**

- Led UX research and product specialist work across healthcare SaaS and education products—stakeholder discovery, accessible design, demos, and launch support that still shapes how I build operator-facing UIs.

---

## Selected Projects

- **Buddy Live** — Real-time voice + video coaching web app (React/TS, WebRTC, Cloud Run). Demo: [buddy-live-indol.vercel.app/coach](https://buddy-live-indol.vercel.app/coach) · [github.com/jakedibattista/buddy-live](https://github.com/jakedibattista/buddy-live)
- **Puck Buddy** — AI hockey video analysis on iOS/Android (React Native/Expo, TypeScript, Firebase, Cloud Run)
- **Scout** — Next.js lacrosse scouting MVP with signed-URL video upload to GCS and Gemini analysis agents

---

## Education

**B.S., Computer Science** — University of Maryland, Baltimore County (UMBC), 2011–2015  

**M.A., Design Leadership** — Maryland Institute College of Art (MICA), with Johns Hopkins Carey Business School, 2020–2022

---

## Awards & Certifications

- **Grand Prize** — Google Cloud × MLB Hackathon (Pitcher Mechanics Scorecard); demoed live at Google Cloud Next 2025 Developer Keynote
- AWS Certified Cloud Practitioner (Dec 2024) · AWS Certified AI Practitioner (Feb 2025)
