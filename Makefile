# NOTE: The `dev*` targets below are a LEGACY local loop (Next.js + ADK + ngrok)
# kept for backend-only debugging. They are NOT the supported test path for this
# project: local Firebase admin keys are not configured, so QA/verification runs
# against Vercel production + Cloud Run instead (see .cursor/rules/vercel-only-testing).
.PHONY: install dev dev-web dev-backend dev-tunnel help

# Default target
help:
	@echo "Buddy Live Monorepo Tasks:"
	@echo "  make install      Install dependencies for both frontend and backend"
	@echo "  (Supported QA path is Vercel prod + Cloud Run, NOT local — the dev"
	@echo "   targets below are legacy and need keys/ngrok that aren't configured.)"
	@echo "  make dev          [legacy] Start web app, backend, and ngrok tunnel in parallel"
	@echo "  make dev-web      [legacy] Start only the Next.js web app"
	@echo "  make dev-backend  [legacy] Start only the Python ADK backend"
	@echo "  make dev-tunnel   [legacy] Start the ngrok tunnel on port 8080"

install:
	@echo "Installing backend dependencies..."
	cd services/buddy-live-adk && $(MAKE) install
	@echo "Installing frontend dependencies..."
	cd apps/buddy-live && npm install

dev-web:
	cd apps/buddy-live && npm run dev

dev-backend:
	cd services/buddy-live-adk && $(MAKE) run

dev-tunnel:
	@echo "Starting ngrok tunnel for ElevenLabs integration..."
	@echo "Make sure ngrok is installed and authenticated: https://ngrok.com"
	ngrok http 8080

dev:
	@echo "Starting all dev services concurrently..."
	@echo "Web app:     http://localhost:3000"
	@echo "ADK Backend: http://localhost:8080"
	@if command -v npx >/dev/null 2>&1; then \
		npx concurrently --names "web,adk,ngrok" --prefix-colors "blue,green,magenta" \
			"$(MAKE) dev-web" \
			"$(MAKE) dev-backend" \
			"$(MAKE) dev-tunnel"; \
	else \
		$(MAKE) -j 3 dev-web dev-backend dev-tunnel; \
	fi
