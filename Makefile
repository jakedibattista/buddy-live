.PHONY: install dev dev-web dev-backend dev-tunnel gen-types help

# Default target
help:
	@echo "Buddy Live Monorepo Tasks:"
	@echo "  make install      Install dependencies for both frontend and backend"
	@echo "  make dev          Start web app, backend, and ngrok tunnel in parallel"
	@echo "  make dev-web      Start only the Next.js web app"
	@echo "  make dev-backend  Start only the Python ADK backend"
	@echo "  make dev-tunnel   Start the ngrok tunnel on port 8080"
	@echo "  make gen-types    Generate TypeScript types statically from FastAPI OpenAPI schema"

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

gen-types:
	@echo "Generating OpenAPI schema from FastAPI backend..."
	@cd services/buddy-live-adk && .venv/bin/python -c "import json; from app.main import app; print(json.dumps(app.openapi()))" > ../../openapi.json
	@echo "Generating TypeScript types..."
	@npx openapi-typescript openapi.json --output apps/buddy-live/src/lib/schema.d.ts
	@rm openapi.json
	@echo "✓ TypeScript types generated successfully at apps/buddy-live/src/lib/schema.d.ts"

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
