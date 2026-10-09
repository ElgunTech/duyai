"""Prompt format shared by training and prediction, so both see exactly the same input."""

import json
from datetime import datetime
from zoneinfo import ZoneInfo

SYSTEM_PROMPT = (
    "You extract structured information from a phone call transcript in Azerbaijani "
    "(often mixed with Russian, English or Turkish words). 'Me' is the caller, 'Friend' the "
    "other party. Answer with one JSON object only, with keys: "
    "intent (hotel_booking, restaurant_booking, appointment, meeting, purchase, delivery, "
    "customer_support, travel, personal, scam_attempt, other), "
    "entities [{type, label, value}] with times as HH:mm, "
    "commitments [{owner: me|other, task, due, due_iso}], "
    "actions [{type: calendar|reminder|note|map|email, title, start}]. "
    "Resolve relative dates to local ISO 8601 using the call date. Only facts said in the call."
)


def call_moment(call_started_at: str, time_zone: str) -> str:
    """'Friday 09 October 2026 10:00 (Asia/Baku)'"""
    moment = datetime.fromisoformat(call_started_at.replace("Z", "+00:00"))
    local = moment.astimezone(ZoneInfo(time_zone))
    return f"{local:%A %d %B %Y %H:%M} ({time_zone})"


def user_message(example: dict) -> str:
    lines = "\n".join(f"{t['speaker']}: {t['text']}" for t in example["transcript"])
    when = call_moment(example["call_started_at"], example.get("time_zone", "Asia/Baku"))
    return f"Call date: {when}\n\nTranscript:\n{lines}"


def build_messages(example: dict, with_answer: bool) -> list:
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_message(example)},
    ]
    if with_answer:
        messages.append(
            {"role": "assistant", "content": json.dumps(example["label"], ensure_ascii=False)}
        )
    return messages


def parse_json(text: str) -> dict:
    """First top-level JSON object in the model output; an empty result if none parses."""
    start = text.find("{")
    depth = 0
    for i in range(start, len(text)) if start >= 0 else []:
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(text[start : i + 1])
                except json.JSONDecodeError:
                    break
    return {"intent": "other", "entities": [], "commitments": [], "actions": []}
