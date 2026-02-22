from typing import Dict, List, Optional
from pydantic import BaseModel, Field

class Photo(BaseModel):
    url: Optional[str] = None
    file_path: Optional[str] = None
    hash: Optional[str] = None
    exif: Optional[Dict] = None
    captured_at: Optional[str] = None  # ISO-8601

class MEPP(BaseModel):
    version: str = "1.0"
    case_id: Optional[str] = None
    created_at: Optional[str] = None
    reporter: Dict = Field(default_factory=dict)
    issue: Dict = Field(default_factory=dict)
    evidence: Dict = Field(default_factory=dict)
    location: Dict = Field(default_factory=dict)
    credibility: Dict = Field(default_factory=dict)
    routing: Dict = Field(default_factory=dict)
    sla: Dict = Field(default_factory=dict)
    provenance: Dict = Field(default_factory=dict)

class DedupeReq(BaseModel):
    mepp: MEPP

class DedupeRes(BaseModel):
    duplicate_of: Optional[str] = None
    similarity: float = Field(..., ge=0.0, le=1.0)
    distance_km: Optional[float] = None

class ScoreReq(BaseModel):
    mepp: MEPP

class ScoreRes(BaseModel):
    score: float = Field(..., ge=0.0, le=1.0)
    hint: str

class RouteReq(BaseModel):
    mepp: MEPP

class RouteRes(BaseModel):
    dest: str
    confidence: float = Field(..., ge=0.0, le=1.0)
    basis: List[str]

class StatusRes(BaseModel):
    ticket_id: str
    status: str
    updated_at: str
