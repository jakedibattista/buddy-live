# Infra

## One-time setup

```bash
# 1. Pick a GCP project (reuse the existing modelforpuckbuddy project so Firestore is shared)
gcloud config set project puck-buddy

# 2. Enable services
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com

# 3. Create an Artifact Registry repo for the ADK image
gcloud artifacts repositories create buddy-live \
  --repository-format=docker \
  --location=us-central1

# 4. Deploy Firestore + Storage rules (MERGED — do not deploy infra/firestore.rules alone)
#    Copy merged rules into modelforpuckbuddy first — see docs/FIRESTORE_RULES.md
cp infra/firestore.rules.merged /path/to/modelforpuckbuddy/firebase/firestore.rules
cp infra/storage.rules.merged   /path/to/modelforpuckbuddy/firebase/storage.rules
firebase deploy --only firestore:rules,storage:rules --project puck-buddy
```

## Deploy the ADK service

```bash
gcloud builds submit \
  --config infra/cloudbuild.yaml \
  --substitutions=_RUNTIME_SERVICE_ACCOUNT=buddy-live-adk@puck-buddy.iam.gserviceaccount.com
```

After the first deploy, set env vars / secrets:

```bash
gcloud run services update buddy-live-adk \
  --region=us-central1 \
  --update-env-vars=GEMINI_MODEL=gemini-flash-latest,MODELFORPUCKBUDDY_API_URL=https://api.buddysports.app,CORS_ALLOW_ORIGINS=https://buddy-live.vercel.app \
  --update-secrets=GOOGLE_API_KEY=gemini-api-key:latest
```

Verify it:

```bash
SERVICE_URL=$(gcloud run services describe buddy-live-adk --region=us-central1 --format='value(status.url)')
curl -s $SERVICE_URL/health
```

## Wire it to ElevenLabs

1. In the ElevenLabs dashboard, create a new Agent.
2. Pick a voice (we use `Brian`), enable "speculative turn" for low latency.
3. LLM = **Custom LLM**. URL = `<SERVICE_URL>/chat/completions`. No API key needed.
4. Copy the Agent ID into `NEXT_PUBLIC_ELEVENLABS_AGENT_ID` in `apps/buddy-live/.env.local`
   (and the Vercel project env).

## Deploy the web app

```bash
cd apps/buddy-live
vercel deploy --prod
```

Set these env vars in the Vercel project:

- `NEXT_PUBLIC_FIREBASE_*` (the safe-to-expose Firebase web config)
- `NEXT_PUBLIC_ELEVENLABS_AGENT_ID`
- `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY`
  (private key with literal `\n` for newlines)
- `ELEVENLABS_API_KEY` (only needed if you make the agent private)
