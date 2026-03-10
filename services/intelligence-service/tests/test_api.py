import os
from fastapi.testclient import TestClient
from main import app

# Ensure we have a clean test env and no missing dependencies crash the imports
os.environ["SLA_STATUS_SERVICE_URL"] = "http://localhost:9999" # invalid port to trigger fallback

client = TestClient(app)

def test_healthz():
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

def test_version():
    response = client.get("/version")
    assert response.status_code == 200
    data = response.json()
    assert "version" in data
    assert "build_time" in data

def test_dedupe_deterministic_match():
    payload = {
        "mepp": {
            "version": "1.0",
            "issue": {"summary": "overflowing garbage bin at main street market", "category": "roads", "details": ""},
            "location": {"lat": 11.1085, "lon": 77.3411, "address_text": "main st", "ward": "1"},
            "evidence": {},
            "provenance": {"channel": "web", "raw_id": "123"}
        }
    }
    response = client.post("/dedupe", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["duplicate_of"] == "INC-001"
    assert data["similarity"] > 0.65

def test_dedupe_no_match():
    payload = {
        "mepp": {
            "version": "1.0",
            "issue": {"summary": "completely unrelated issue here", "category": "roads", "details": ""},
            "location": {"lat": 40.7128, "lon": -74.0060, "address_text": "NY", "ward": "1"},
            "evidence": {},
            "provenance": {"channel": "web", "raw_id": "123"}
        }
    }
    response = client.post("/dedupe", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["duplicate_of"] is None

def test_cluster():
    payload = {
        "mepp": {
            "version": "1.0",
            "issue": {"summary": "broken streetlight on avenue", "category": "electrical", "details": ""},
            "location": {"lat": 11.1, "lon": 77.3, "address_text": "ave", "ward": "2"},
            "evidence": {},
            "provenance": {"channel": "web", "raw_id": "123"}
        }
    }
    response = client.post("/cluster", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "cluster_id" in data
    assert "is_new" in data
    assert "members" in data
    assert data["members"] >= 1

def test_score():
    payload = {
        "mepp": {
            "version": "1.0",
            "issue": {"summary": "test issue", "category": "roads", "details": ""},
            "location": {"lat": 11.1, "lon": 77.3, "address_text": "main st", "ward": "1"},
            "evidence": {"photos": ["url1", "url2"]},
            "provenance": {"channel": "web", "raw_id": "123"}
        }
    }
    response = client.post("/score", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "score" in data
    assert data["score"] > 0.0

def test_route_deterministic():
    payload = {
        "mepp": {
            "version": "1.0",
            "issue": {"summary": "lots of garbage", "category": "sanitation/garbage", "details": ""},
            "location": {"lat": 11.1, "lon": 77.3, "address_text": "st", "ward": "14"},
            "evidence": {},
            "provenance": {"channel": "web", "raw_id": "123"}
        }
    }
    response = client.post("/route", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["dest"] == "ULB_TIRUPPUR_SANITATION"
    assert data["confidence"] == 0.90
    assert "rule: sanitation+ward14" in data["basis"]

def test_pack():
    payload = {
        "mepp": {
            "version": "1.0",
            "issue": {"summary": "test issue", "category": "roads", "details": "pothole"},
            "location": {"lat": 11.1, "lon": 77.3, "address_text": "main st", "ward": "1"},
            "evidence": {},
            "provenance": {"channel": "web", "raw_id": "123"}
        },
        "gating": {"status": "action", "final_confidence": 0.9},
        "routing": {"dest": "ULB_ROADS", "confidence": 0.8},
        "cluster": {"cluster_id": "CL-123", "is_new": True, "members": 1, "text_similarity": 1.0, "geo_cell": "nogeo"}
    }
    response = client.post("/pack", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "pack_id" in data
    assert "json_url" in data
    assert "pdf_url" in data

def test_simulate_ulb_status_fallback():
    # Will fail to reach localhost:9999 and fall back to dummy data
    response = client.get("/simulate_ulb_status?ticket_id=TKT-456")
    assert response.status_code == 200
    data = response.json()
    assert data["ticket_id"] == "TKT-456"
    assert data["status"] == "FILED"
    assert "updated_at" in data
