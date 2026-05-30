#!/usr/bin/env python3
"""Seed a returning-player demo row in Firestore session_summaries.

Usage:
    python3 infra/scripts/seed_demo_memory.py UXNBjXXvmXhVt29u7o1ZVGKZW5n1
    python3 infra/scripts/seed_demo_memory.py UXNBjXXvmXhVt29u7o1ZVGKZW5n1 --name Marcus

Requires Application Default Credentials with Firestore write access on puck-buddy.
"""
from __future__ import annotations

import argparse
import sys

import firebase_admin
from firebase_admin import credentials, firestore


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed session_summaries for demo")
    parser.add_argument("user_id", help="Firebase anonymous uid from live_sessions.user_id")
    parser.add_argument("--name", default="Marcus", help="Player first name (default: Marcus)")
    parser.add_argument("--drill", default="wristshot")
    parser.add_argument("--metric", default="weight_transfer")
    args = parser.parse_args()

    if not firebase_admin._apps:
        firebase_admin.initialize_app(options={"projectId": "puck-buddy"})

    doc_id = f"demo-prior-{args.name.lower()}-{args.user_id[:8]}"
    db = firestore.client()
    db.collection("session_summaries").document(doc_id).set(
        {
            "session_id": doc_id,
            "created_at": "2026-05-27T18:00:00Z",
            "user_id": args.user_id,
            "player_name": args.name,
            "player_name_normalized": args.name.strip().lower(),
            "drill": args.drill,
            "rep_count": 2,
            "weakest_metric": args.metric,
        },
        merge=True,
    )
    print(f"Seeded session_summaries/{doc_id} for user_id={args.user_id}")
    print(f"Demo: same browser → say 'I'm {args.name}' → welcome-back line")


if __name__ == "__main__":
    main()
