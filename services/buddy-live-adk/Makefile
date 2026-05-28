.PHONY: install run test deploy clean eval-setup eval eval-failures optimize

PORT ?= 8080
SERVICE ?= buddy-live-adk
REGION ?= us-central1

EVAL_SET ?= coaching_scenarios
EVAL_DIR ?= evals

install:
	python3 -m venv .venv
	.venv/bin/pip install --upgrade pip
	.venv/bin/pip install -r requirements.txt

install-dev:
	python3 -m venv .venv
	.venv/bin/pip install --upgrade pip
	.venv/bin/pip install -r requirements-dev.txt

run:
	.venv/bin/uvicorn app.main:app --reload --port $(PORT)

test:
	.venv/bin/python -c "from app.main import app; print('import OK')"
	.venv/bin/python -c "from app.agent import get_agent; a = get_agent(); print('agent OK:', a.name, len(a.tools), 'tools')"
	.venv/bin/pytest -q tests/

deploy:
	gcloud builds submit --config ../../infra/cloudbuild.yaml --substitutions=_CONTEXT_DIR=.

EVAL_SET_FILE := $(EVAL_DIR)/agent_module/$(EVAL_SET).evalset.json

eval-setup:
	@if [ ! -f $(EVAL_SET_FILE) ]; then \
		.venv/bin/adk eval_set create $(EVAL_DIR)/agent_module $(EVAL_SET); \
		.venv/bin/adk eval_set add_eval_case $(EVAL_DIR)/agent_module $(EVAL_SET) \
			--scenarios_file $(EVAL_DIR)/conversation_scenarios.json \
			--session_input_file $(EVAL_DIR)/session_input.json; \
	fi

eval: eval-setup
	.venv/bin/adk eval \
		$(EVAL_DIR)/agent_module \
		--config_file_path $(EVAL_DIR)/eval_config.json \
		$(EVAL_SET_FILE) \
		--print_detailed_results

eval-failures: eval-setup
	BUDDY_EVAL_FAILURES=1 .venv/bin/adk eval \
		$(EVAL_DIR)/agent_module \
		--config_file_path $(EVAL_DIR)/eval_config.json \
		$(EVAL_SET_FILE) \
		--print_detailed_results

optimize: eval-setup install-dev
	.venv/bin/adk optimize \
		$(EVAL_DIR)/agent_module \
		--sampler_config_file_path $(EVAL_DIR)/optimize_sampler_config.json \
		--optimizer_config_file_path $(EVAL_DIR)/optimize_config.json \
		--print_detailed_results

clean:
	rm -rf .venv __pycache__ */__pycache__
