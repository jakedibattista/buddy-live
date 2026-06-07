"""Pydantic request/response models for the ElevenLabs Custom LLM contract."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="allow")
    role: str
    content: str | None = None


class ElevenLabsExtraBody(BaseModel):
    model_config = ConfigDict(extra="allow")
    arbitrary_identifier: str | None = None


class ChatCompletionRequest(BaseModel):
    model_config = ConfigDict(extra="allow")
    model: str | None = None
    messages: list[ChatMessage] = Field(default_factory=list)
    stream: bool | None = True
    user_id: str | None = None
    elevenlabs_extra_body: ElevenLabsExtraBody | None = None

    def session_identifier(self) -> str:
        if self.elevenlabs_extra_body and self.elevenlabs_extra_body.arbitrary_identifier:
            return self.elevenlabs_extra_body.arbitrary_identifier
        if self.user_id:
            return self.user_id
        return "anonymous"

    def latest_user_text(self) -> str:
        for msg in reversed(self.messages):
            if msg.role == "user" and msg.content:
                return msg.content
        return ""


class HealthResponse(BaseModel):
    ok: bool = True
    service: str = "buddy-live-adk"
