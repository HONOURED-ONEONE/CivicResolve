import math
import datetime
import os
import collections
from typing import Dict, List, Optional, Tuple, Any, Set

from .schemas import MEPP, DedupeRes, ScoreRes, RouteRes, StatusRes

# --- Globals / Config ---
CANONICAL_INCIDENTS = [
    {
        "id": "INC-001",
        "summary": "overflowing garbage bin at main street market",
        "lat": 11.1085,
        "lon": 77.3411,
    },
    {
        "id": "INC-002",
        "summary": "broken streetlight near gandhi statue",
        "lat": 11.1090,
        "lon": 77.3415,
    },
    {
        "id": "INC-003",
        "summary": "large pothole causing traffic jam",
        "lat": 11.1050,
        "lon": 77.3390,
    }
]

# TICKET_STATE[ticket_id] = {"status": str, "updated_at": datetime.datetime}
TICKET_STATE: collections.OrderedDict = collections.OrderedDict()

def _get_env_float(key: str, default: float) -> float:
    try:
        return float(os.environ.get(key, str(default)))
    except ValueError:
        return default

def _get_env_int(key: str, default: int) -> int:
    try:
        return int(os.environ.get(key, str(default)))
    except ValueError:
        return default

# --- Helper Functions ---

def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0  # Earth radius in km
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def tokenize(text: str) -> Set[str]:
    if not text:
        return set()
    return set(text.lower().split())

def jaccard_similarity(set1: Set[str], set2: Set[str]) -> float:
    intersection = len(set1.intersection(set2))
    union = len(set1.union(set2))
    return intersection / union if union > 0 else 0.0

# --- Service Functions ---

def dedupe_mepp(mepp: MEPP) -> DedupeRes:
    threshold = _get_env_float("DEDUPE_THRESHOLD", 0.65)
    
    input_summary = str(mepp.issue.get("summary", ""))
    input_tokens = tokenize(input_summary)
    
    lat = mepp.location.get("lat")
    lon = mepp.location.get("lon")
    has_geo = (lat is not None and lon is not None)

    best_sim = 0.0
    best_match_id = None
    best_dist = None

    for inc in CANONICAL_INCIDENTS:
        canon_tokens = tokenize(inc["summary"])
        text_sim = jaccard_similarity(input_tokens, canon_tokens)
        
        dist_bonus = 0.0
        dist_km = None
        
        if has_geo:
            try:
                dist_km = haversine(float(lat), float(lon), inc["lat"], inc["lon"])
                if dist_km < 0.30:  # 300 meters
                    dist_bonus = 1.0
            except (ValueError, TypeError):
                pass
        
        # Combined similarity: 0.7 * text + 0.3 * distance_bonus
        # Max score without geo is 0.7 * 1.0 + 0 = 0.7
        combined_sim = (0.7 * text_sim) + (0.3 * dist_bonus)
        
        if combined_sim > best_sim:
            best_sim = combined_sim
            best_match_id = inc["id"]
            best_dist = dist_km

    duplicate_of = best_match_id if best_sim >= threshold else None
    
    return DedupeRes(
        duplicate_of=duplicate_of,
        similarity=round(best_sim, 4),
        distance_km=best_dist
    )

def score_credibility(mepp: MEPP) -> ScoreRes:
    # 1. Evidence Completeness
    photos = mepp.evidence.get("photos", [])
    if isinstance(photos, list):
        count = len(photos)
    else:
        count = 0
        
    evidence_score = 0.0
    if count >= 1:
        evidence_score += 0.25
    if count >= 2:
        evidence_score += 0.25
    evidence_final = min(0.5 + evidence_score, 1.0)

    # 2. Geo Consistency
    loc = mepp.location
    has_lat = loc.get("lat") is not None
    has_lon = loc.get("lon") is not None
    has_addr = bool(loc.get("address_text"))
    
    if has_lat and has_lon and has_addr:
        geo_score = 1.0
    elif has_lat and has_lon:
        geo_score = 0.6
    else:
        geo_score = 0.2

    # 3. Duplication Risk
    dedupe_result = dedupe_mepp(mepp)
    dup_risk = dedupe_result.similarity

    # 4. Community Signal
    community_signal = 0.0

    # 5. Reporter Reputation
    contact = mepp.reporter.get("contact")
    reporter_rep = 0.6 if contact else 0.5

    final_score = (
        (0.35 * evidence_final) +
        (0.20 * geo_score) +
        (0.15 * (1.0 - dup_risk)) +
        (0.20 * community_signal) +
        (0.10 * reporter_rep)
    )
    final_score = min(max(final_score, 0.0), 1.0)

    hints = []
    if count < 2:
        hints.append("Add a second photo from a different angle.")
    if not has_addr:
        hints.append("Include a nearby landmark or street name.")
    
    hint = " ".join(hints) if hints else "Looks good."

    return ScoreRes(score=round(final_score, 2), hint=hint)

def route_mepp(mepp: MEPP) -> RouteRes:
    category = str(mepp.issue.get("category", ""))
    summary = str(mepp.issue.get("summary", "")).lower()
    ward = str(mepp.location.get("ward", ""))
    
    dest = None
    confidence = 0.0
    basis = []

    # Rule 1
    if category in ["sanitation/garbage", "sanitation/drainage"] and ward == "14":
        dest = "ULB_TIRUPPUR_SANITATION"
        confidence = 0.90
        basis.append("rule: sanitation+ward14")
    # Rule 2
    elif any(kw in summary for kw in ["streetlight", "lamp", "bulb"]):
        dest = "ULB_ELECTRICAL"
        confidence = 0.75
        basis.append("rule: streetlight keywords")
    
    # Fallback
    if not dest:
        basis.append("fallback: keyword heuristic")
        confidence = 0.40
        if any(w in summary for w in ["water", "pipe", "leak"]):
            dest = "ULB_WATER"
        elif any(w in summary for w in ["road", "pothole", "tar"]):
            dest = "ULB_ROADS"
        elif any(w in summary for w in ["garbage", "trash", "waste"]):
             dest = "ULB_TIRUPPUR_SANITATION"
        else:
            dest = "ULB_GENERIC"
            
    return RouteRes(dest=dest, confidence=confidence, basis=basis)

def simulate_status(ticket_id: str) -> StatusRes:
    max_tickets = _get_env_int("MAX_TICKETS_IN_MEMORY", 500)
    sim_minutes = _get_env_float("SIM_PROGRESS_MINUTES", 5.0)
    
    now = datetime.datetime.now(datetime.timezone.utc)
    sequence = ["FILED", "IN_PROGRESS", "ACTION_TAKEN", "RESOLVED", "CLOSED"]
    
    if ticket_id not in TICKET_STATE:
        if len(TICKET_STATE) >= max_tickets:
            TICKET_STATE.popitem(last=False)
        TICKET_STATE[ticket_id] = {
            "status": "FILED",
            "updated_at": now
        }
    
    entry = TICKET_STATE[ticket_id]
    current_status = entry["status"]
    last_update = entry["updated_at"]
    
    diff_minutes = (now - last_update).total_seconds() / 60.0
    
    if diff_minutes >= sim_minutes:
        try:
            idx = sequence.index(current_status)
            if idx < len(sequence) - 1:
                entry["status"] = sequence[idx + 1]
                entry["updated_at"] = now
                TICKET_STATE.move_to_end(ticket_id)
        except ValueError:
            pass

    return StatusRes(
        ticket_id=ticket_id,
        status=entry["status"],
        updated_at=entry["updated_at"].isoformat().replace("+00:00", "Z")
    )
