import os
import time
import uuid
import logging
import json
import re
from datetime import datetime, timezone
from typing import Optional

from fastapi import FastAPI, Request, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

from . import schemas, services

# --- Configuration ---
LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO").upper()
API_KEY = os.environ.get("API_KEY")
CORS_ALLOW_ORIGINS = os.environ.get("CORS_ALLOW_ORIGINS", "*").split(",")

# --- Logging Setup ---
logging.basicConfig(level=LOG_LEVEL)
logger = logging.getLogger("sidecar")

# --- App Setup ---
app = FastAPI(
    title="Sidecar API",
    version="1.0.0",
    description="Helper service for CivicResolve orchestration."
)

@app.on_event("startup")
async def startup_event():
    logger.info(f"Starting Sidecar. CORS_ALLOW_ORIGINS={CORS_ALLOW_ORIGINS}")
    if API_KEY:
        masked_key = API_KEY[:4] + "*" * (len(API_KEY) - 4) if len(API_KEY) > 4 else "****"
        logger.info(f"API_KEY is set: {masked_key}")
    else:
        logger.warning("API_KEY is not set.")

# --- Middleware ---
# Note: Middleware is added LIFO. The last added middleware is the first to execute.
# We want: CORS -> Logging -> Path Normalization -> Auth -> App
# So we add in order: Auth, then Normalization, then Logging, then CORS.

@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    # Fix B: Allow OPTIONS (CORS preflight) without API key
    if request.method == "OPTIONS":
        return await call_next(request)

    # Skip auth for health and version
    # Normalize path to ignore trailing slash if needed, but standardizing on strict for now
    path = request.url.path.rstrip("/")
    if path in ["/healthz", "/version"] or request.url.path in ["/healthz", "/version"]:
        return await call_next(request)
    
    if API_KEY:
        x_api_key = request.headers.get("X-API-Key")
        if x_api_key != API_KEY:
            return JSONResponse(
                status_code=status.HTTP_403_FORBIDDEN,
                content={"detail": "Invalid or missing API Key"}
            )
            
    return await call_next(request)

@app.middleware("http")
async def normalize_path_middleware(request: Request, call_next):
    # Fix A: Normalize double slashes
    if "//" in request.url.path:
        request.scope["path"] = re.sub('/+', '/', request.url.path)
    return await call_next(request)

@app.middleware("http")
async def structured_logging_middleware(request: Request, call_next):
    trace_id = str(uuid.uuid4())
    request.state.trace_id = trace_id
    
    start_time = time.time()
    
    try:
        response = await call_next(request)
        process_time_ms = round((time.time() - start_time) * 1000, 2)
        
        log_entry = {
            "trace_id": trace_id,
            "method": request.method,
            "path": request.url.path,
            "status": response.status_code,
            "latency_ms": process_time_ms
        }
        logger.info(json.dumps(log_entry))
        return response
        
    except Exception as e:
        process_time_ms = round((time.time() - start_time) * 1000, 2)
        log_entry = {
            "trace_id": trace_id,
            "method": request.method,
            "path": request.url.path,
            "status": 500,
            "latency_ms": process_time_ms,
            "error": str(e)
        }
        logger.error(json.dumps(log_entry))
        return JSONResponse(
            status_code=500,
            content={"error": "Internal Server Error", "trace_id": trace_id}
        )

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOW_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Exception Handlers ---

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": exc.errors(), "body": str(exc.body)},
    )

# --- Endpoints ---

@app.get("/healthz")
async def healthz():
    return {"status": "ok"}

@app.get("/version")
async def version():
    return {
        "version": "1.0.0",
        "build_time": datetime.now(timezone.utc).isoformat()
    }

@app.post("/dedupe", response_model=schemas.DedupeRes)
async def dedupe(req: schemas.DedupeReq):
    return services.dedupe_mepp(req.mepp)

@app.post("/score", response_model=schemas.ScoreRes)
async def score(req: schemas.ScoreReq):
    return services.score_credibility(req.mepp)

@app.post("/route", response_model=schemas.RouteRes)
async def route(req: schemas.RouteReq):
    return services.route_mepp(req.mepp)

@app.get("/simulate_ulb_status", response_model=schemas.StatusRes)
async def simulate_ulb_status(ticket_id: str):
    return services.simulate_status(ticket_id)
