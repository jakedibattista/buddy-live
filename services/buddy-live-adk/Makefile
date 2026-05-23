.PHONY: install run test deploy clean

PORT ?= 8080
SERVICE ?= buddy-live-adk
REGION ?= us-central1

install:
	python3 -m venv .venv
	.venv/bin/pip install --upgrade pip
	.venv/bin/pip install -r requirements.txt

run:
	.venv/bin/uvicorn app.main:app --reload --port $(PORT)

test:
	.venv/bin/python -c "from app.main import app; print('import OK')"
	.venv/bin/python -c "from app.agent import get_agent; a = get_agent(); print('agent OK:', a.name, len(a.tools), 'tools')"

deploy:
	gcloud builds submit --config ../../infra/cloudbuild.yaml --substitutions=_CONTEXT_DIR=.

clean:
	rm -rf .venv __pycache__ */__pycache__
