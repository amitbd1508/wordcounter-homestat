"""
VoxPi Personal AI Speech Intelligence System - Raspberry Pi FastAPI Daemon
Production Python + FastAPI + SQLite + Silero VAD + faster-whisper + Speaker Diarization Worker
"""
import asyncio
import json
import os
import sqlite3
from datetime import datetime, timezone
from typing import Dict, List, Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(
    title="VoxPi Personal AI Speech Intelligence Daemon",
    version="2.4.0",
    description="Self-hosted Raspberry Pi ARM64 speech capture, Silero VAD, faster-whisper STT, acoustic speaker separation, and contextual filler word intelligence."
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_PATH = os.environ.get("VOXPI_DB_PATH", "../../data/speech_intelligence.db")


class IngestSegmentRequest(BaseModel):
    text: str
    durationSeconds: int = 12
    sessionTitle: Optional[str] = "Raspberry Pi USB Mic Capture"
    pitchHz: Optional[int] = 132
    spectralCentroidHz: Optional[int] = 1650


def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    return conn


@app.get("/api/system/health")
async def get_system_health():
    conn = get_db_connection()
    row = conn.execute("SELECT * FROM system_health WHERE id = 1").fetchone()
    conn.close()
    return {"health": dict(row) if row else {"status": "healthy"}}
