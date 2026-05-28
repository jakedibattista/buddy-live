"""Eval-only agent module for `adk eval`.

`adk eval` imports ``root_agent`` from the agent-module path it's pointed at.
This package exposes that symbol; the agent itself is built in
:mod:`evals.agent_module.agent` so it stays small and only touches the
production ``app`` package via imports (no monkey-patching).
"""
from evals.agent_module.agent import root_agent

__all__ = ["root_agent"]
