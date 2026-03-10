import math
import datetime
import os
import collections
import sqlite3
import json
import hashlib
import time
from typing import Dict, List, Optional, Tuple, Any, Set

from .schemas import MEPP, DedupeRes, ScoreRes, RouteRes, StatusRes, ClusterRes, PackRes, PackReq

# --- Globals / Config ---
CLUSTER_DB = os.environ.get("CLUSTER_DB", "cluster.db")
CLUSTER_JACCARD_MIN = float(os.environ.get("CLUSTER_JACCARD_MIN", "0.45"))
PACK_DIR = os.environ.get("PACK_DIR", "./packs")
PACK_MAX_EVIDENCE = int(os.environ.get("PACK_MAX_EVIDENCE", "5"))

def init_db():
    conn = sqlite3.connect(CLUSTER_DB)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS clusters (
            cluster_id TEXT PRIMARY KEY,
            ward TEXT,
            geocell TEXT,
            centroid TEXT,
            members INT,
            created_at TEXT,
            updated_at TEXT
        )
    ''')
    c.execute('''
        CREATE TABLE IF NOT EXISTS cluster_members (
            cluster_id TEXT,
            case_id TEXT,
            summary TEXT,
            lat REAL,
            lon REAL,
            ts TEXT
        )
    ''')
    conn.commit()
    conn.close()

init_db()

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

# simulate_status has been moved to sla-status-service.

def get_geocell(lat: Any, lon: Any) -> str:
    if lat is None or lon is None:
        return "nogeo"
    try:
        lat_f = float(lat)
        lon_f = float(lon)
        return f"{math.floor(lat_f * 3000)}:{math.floor(lon_f * 3000)}"
    except (ValueError, TypeError):
        return "nogeo"

def tokenize_summary(text: str) -> Set[str]:
    if not text:
        return set()
    return set(w for w in text.lower().split() if len(w) > 2)

def cluster_mepp(mepp: MEPP) -> ClusterRes:
    lat = mepp.location.get("lat")
    lon = mepp.location.get("lon")
    ward = str(mepp.location.get("ward", ""))
    
    geocell = get_geocell(lat, lon)
    summary = str(mepp.issue.get("summary", ""))
    tokens = tokenize_summary(summary)
    
    conn = sqlite3.connect(CLUSTER_DB, timeout=10.0)
    c = conn.cursor()
    
    c.execute('SELECT cluster_id, centroid, members FROM clusters WHERE ward = ? OR geocell = ?', (ward, geocell))
    rows = c.fetchall()
    
    best_sim = 0.0
    best_cluster_id = None
    best_centroid = set()
    best_members = 0
    
    for row_cid, row_centroid_str, row_members in rows:
        row_centroid = set(json.loads(row_centroid_str))
        sim = jaccard_similarity(tokens, row_centroid)
        if sim > best_sim:
            best_sim = sim
            best_cluster_id = row_cid
            best_centroid = row_centroid
            best_members = row_members
            
    is_new = False
    now_str = datetime.datetime.now(datetime.timezone.utc).isoformat()
    
    if best_sim >= CLUSTER_JACCARD_MIN and best_cluster_id:
        cluster_id = best_cluster_id
        new_centroid = best_centroid.union(tokens)
        new_members = best_members + 1
        
        # Retry logic for concurrency
        for _ in range(3):
            try:
                c.execute('UPDATE clusters SET centroid = ?, members = ?, updated_at = ? WHERE cluster_id = ?', 
                          (json.dumps(list(new_centroid)), new_members, now_str, cluster_id))
                break
            except sqlite3.OperationalError:
                time.sleep(0.1)
    else:
        is_new = True
        cluster_id = "CL-" + hashlib.sha1(os.urandom(32)).hexdigest()[:8]
        new_members = 1
        for _ in range(3):
            try:
                c.execute('INSERT INTO clusters (cluster_id, ward, geocell, centroid, members, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
                          (cluster_id, ward, geocell, json.dumps(list(tokens)), new_members, now_str, now_str))
                break
            except sqlite3.OperationalError:
                time.sleep(0.1)
        
    for _ in range(3):
        try:
            c.execute('INSERT INTO cluster_members (cluster_id, case_id, summary, lat, lon, ts) VALUES (?, ?, ?, ?, ?, ?)',
                      (cluster_id, mepp.case_id, summary, lat, lon, now_str))
            conn.commit()
            break
        except sqlite3.OperationalError:
            time.sleep(0.1)
            
    conn.close()
    
    return ClusterRes(
        cluster_id=cluster_id,
        is_new=is_new,
        members=new_members,
        geo_cell=geocell,
        text_similarity=best_sim if not is_new else 1.0
    )

def build_pack(req: PackReq) -> PackRes:
    from reportlab.pdfgen import canvas
    
    os.makedirs(PACK_DIR, exist_ok=True)
    
    pack_id = "PK-" + hashlib.sha1(os.urandom(32)).hexdigest()[:10]
    now_str = datetime.datetime.now(datetime.timezone.utc).isoformat()
    
    payload = {
        "pack_id": pack_id,
        "created_at": now_str,
        "mepp": req.mepp.model_dump(),
        "gating": req.gating,
        "routing": req.routing,
        "cluster": req.cluster.model_dump()
    }
    
    json_path = os.path.join(PACK_DIR, f"{pack_id}.json")
    json_bytes = json.dumps(payload, indent=2).encode('utf-8')
    with open(json_path, 'wb') as f:
        f.write(json_bytes)
        
    sha256_hash = hashlib.sha256(json_bytes).hexdigest()
    
    pdf_path = os.path.join(PACK_DIR, f"{pack_id}.pdf")
    c = canvas.Canvas(pdf_path)
    
    case_id = req.mepp.case_id or req.mepp.provenance.get("raw_id", "Unknown")
    summary = req.mepp.issue.get("summary", "")
    category = req.mepp.issue.get("category", "")
    dest = req.routing.get("dest", "")
    conf = req.routing.get("confidence", 0.0)
    status = req.gating.get("status", "")
    f_conf = req.gating.get("final_confidence", 0.0)
    
    photos = req.mepp.evidence.get("photos", [])
    if not isinstance(photos, list):
        photos = []
    photos = photos[:PACK_MAX_EVIDENCE]
    
    lines = [
        f"Pack ID: {pack_id}",
        f"Case ID: {case_id}",
        f"Cluster ID: {req.cluster.cluster_id}",
        f"Issue Summary: {summary}",
        f"Issue Category: {category}",
        f"Routing Dest: {dest} (Confidence: {conf})",
        f"Gating Status: {status} (Final Conf: {f_conf})",
        f"Evidence URLs (Top {PACK_MAX_EVIDENCE}):"
    ]
    lines.extend([f" - {p}" for p in photos])
    
    y = 800
    for line in lines:
        c.drawString(50, y, str(line))
        y -= 20
        
    c.save()
    
    abs_json = os.path.abspath(json_path)
    abs_pdf = os.path.abspath(pdf_path)
    
    return PackRes(
        pack_id=pack_id,
        json_url=f"file://{abs_json}",
        pdf_url=f"file://{abs_pdf}",
        sha256=f"sha256:{sha256_hash}"
    )
