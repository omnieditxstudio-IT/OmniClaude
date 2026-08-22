from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from enum import Enum
import httpx
import asyncio
import time
import logging
from datetime import datetime, timedelta
from collections import defaultdict
import os

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Model Translation Gateway - Python Router", version="1.0.0")

# In-memory storage (replace with Redis in production)
endpoint_health: Dict[str, Dict] = {}
endpoint_metrics: Dict[str, List] = defaultdict(list)
rate_limits: Dict[str, List] = defaultdict(list)

class ProviderType(str, Enum):
    OPENROUTER = "openrouter"
    VERTEX = "vertex"
    OLLAMA = "ollama"
    CUSTOM = "custom"
    ANTHROPIC = "anthropic"

class RouteStrategy(str, Enum):
    ROUND_ROBIN = "round_robin"
    LEAST_LATENCY = "least_latency"
    LEAST_ERRORS = "least_errors"
    COST_OPTIMIZED = "cost_optimized"
    PRIORITY = "priority"

class HealthStatus(str, Enum):
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"

class EndpointConfig(BaseModel):
    id: str
    provider: ProviderType
    base_url: str
    api_key: str
    priority: int = 0
    weight: int = 1
    max_concurrent: int = 100
    timeout: int = 60000
    models: List[str] = []
    cost_per_1k_input: float = 0.0
    cost_per_1k_output: float = 0.0

class RouteRequest(BaseModel):
    claude_model: str
    user_id: str
    preferred_providers: List[ProviderType] = []
    strategy: RouteStrategy = RouteStrategy.LEAST_LATENCY
    fallback_enabled: bool = True
    cost_optimize: bool = False
    latency_optimize: bool = True
    max_tokens: Optional[int] = None
    temperature: Optional[float] = None

class RouteResponse(BaseModel):
    endpoint_id: str
    provider_model: str
    reasoning: str
    estimated_latency_ms: float
    estimated_cost: float

class HealthCheckResult(BaseModel):
    endpoint_id: str
    status: HealthStatus
    latency_ms: float
    error: Optional[str] = None
    checked_at: datetime

class MetricsRequest(BaseModel):
    endpoint_id: str
    latency_ms: float
    status_code: int
    tokens_in: int
    tokens_out: int
    error: Optional[str] = None

# Load endpoint configurations from environment or config service
ENDPOINTS: Dict[str, EndpointConfig] = {}

def load_endpoints():
    """Load endpoints from config service or environment"""
    # In production, fetch from the main API server
    pass

@app.on_event("startup")
async def startup():
    load_endpoints()
    # Start background health checks
    asyncio.create_task(periodic_health_checks())

async def periodic_health_checks():
    while True:
        await check_all_endpoints()
        await asyncio.sleep(60)  # Check every minute

async def check_all_endpoints():
    for endpoint_id, config in ENDPOINTS.items():
        await check_endpoint_health(endpoint_id, config)

async def check_endpoint_health(endpoint_id: str, config: EndpointConfig):
    start = time.time()
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            if config.provider == ProviderType.OLLAMA:
                url = f"{config.base_url.replace('/v1', '')}/api/tags"
            else:
                url = f"{config.base_url}/models"
            
            headers = {"Authorization": f"Bearer {config.api_key}"} if config.api_key else {}
            response = await client.get(url, headers=headers)
            
            latency = (time.time() - start) * 1000
            
            if response.status_code == 200:
                status = HealthStatus.HEALTHY
                error = None
            elif response.status_code >= 500:
                status = HealthStatus.DEGRADED
                error = f"HTTP {response.status_code}"
            else:
                status = HealthStatus.UNHEALTHY
                error = f"HTTP {response.status_code}"
                
    except httpx.TimeoutException:
        latency = (time.time() - start) * 1000
        status = HealthStatus.UNHEALTHY
        error = "Timeout"
    except Exception as e:
        latency = (time.time() - start) * 1000
        status = HealthStatus.UNHEALTHY
        error = str(e)
    
    endpoint_health[endpoint_id] = {
        "status": status,
        "latency_ms": latency,
        "error": error,
        "checked_at": datetime.utcnow(),
    }
    
    # Store metrics
    endpoint_metrics[endpoint_id].append({
        "timestamp": datetime.utcnow(),
        "latency_ms": latency,
        "status": status.value,
    })
    
    # Keep only last 1000 metrics
    if len(endpoint_metrics[endpoint_id]) > 1000:
        endpoint_metrics[endpoint_id] = endpoint_metrics[endpoint_id][-1000:]
    
    logger.info(f"Health check {endpoint_id}: {status.value} ({latency:.0f}ms)")

def select_endpoint(
    request: RouteRequest,
    available_endpoints: List[EndpointConfig]
) -> Optional[EndpointConfig]:
    """Select best endpoint based on strategy"""
    if not available_endpoints:
        return None
    
    # Filter by health
    healthy_endpoints = [
        e for e in available_endpoints
        if endpoint_health.get(e.id, {}).get("status") != HealthStatus.UNHEALTHY
    ]
    
    if not healthy_endpoints and request.fallback_enabled:
        healthy_endpoints = available_endpoints
    
    if not healthy_endpoints:
        return None
    
    if request.strategy == RouteStrategy.ROUND_ROBIN:
        # Simple round-robin (would need state in production)
        return healthy_endpoints[0]
    
    elif request.strategy == RouteStrategy.LEAST_LATENCY:
        return min(healthy_endpoints, key=lambda e: endpoint_health.get(e.id, {}).get("latency_ms", float('inf')))
    
    elif request.strategy == RouteStrategy.LEAST_ERRORS:
        return min(healthy_endpoints, key=lambda e: endpoint_health.get(e.id, {}).get("error", "") != "")
    
    elif request.strategy == RouteStrategy.COST_OPTIMIZED:
        return min(healthy_endpoints, key=lambda e: e.cost_per_1k_input + e.cost_per_1k_output)
    
    elif request.strategy == RouteStrategy.PRIORITY:
        return max(healthy_endpoints, key=lambda e: e.priority)
    
    return healthy_endpoints[0]

@app.post("/route", response_model=RouteResponse)
async def route_request(request: RouteRequest):
    """Route a request to the best endpoint"""
    # Get available endpoints for the requested model
    available = [
        e for e in ENDPOINTS.values()
        if not request.preferred_providers or e.provider in request.preferred_providers
    ]
    
    if not available:
        raise HTTPException(status_code=404, detail="No available endpoints for requested model")
    
    selected = select_endpoint(request, available)
    
    if not selected:
        raise HTTPException(status_code=503, detail="No healthy endpoints available")
    
    health = endpoint_health.get(selected.id, {})
    latency = health.get("latency_ms", 0)
    cost = (selected.cost_per_1k_input + selected.cost_per_1k_output) * (request.max_tokens or 1000) / 1000
    
    return RouteResponse(
        endpoint_id=selected.id,
        provider_model=selected.models[0] if selected.models else "unknown",
        reasoning=f"Selected via {request.strategy.value} strategy",
        estimated_latency_ms=latency,
        estimated_cost=cost,
    )

@app.post("/metrics")
async def record_metrics(metrics: MetricsRequest):
    """Record request metrics for an endpoint"""
    endpoint_metrics[metrics.endpoint_id].append({
        "timestamp": datetime.utcnow(),
        "latency_ms": metrics.latency_ms,
        "status_code": metrics.status_code,
        "tokens_in": metrics.tokens_in,
        "tokens_out": metrics.tokens_out,
        "error": metrics.error,
    })
    
    # Update health based on recent errors
    recent = endpoint_metrics[metrics.endpoint_id][-100:]
    error_count = sum(1 for m in recent if m.get("status_code", 200) >= 400)
    error_rate = error_count / len(recent) if recent else 0
    
    if error_rate > 0.5:
        endpoint_health[metrics.endpoint_id]["status"] = HealthStatus.UNHEALTHY
    elif error_rate > 0.1:
        endpoint_health[metrics.endpoint_id]["status"] = HealthStatus.DEGRADED
    else:
        endpoint_health[metrics.endpoint_id]["status"] = HealthStatus.HEALTHY
    
    return {"status": "recorded"}

@app.get("/health/{endpoint_id}", response_model=HealthCheckResult)
async def get_endpoint_health(endpoint_id: str):
    """Get health status of an endpoint"""
    if endpoint_id not in ENDPOINTS:
        raise HTTPException(status_code=404, detail="Endpoint not found")
    
    health = endpoint_health.get(endpoint_id, {
        "status": HealthStatus.UNHEALTHY,
        "latency_ms": 0,
        "error": "Not checked yet",
        "checked_at": datetime.utcnow(),
    })
    
    return HealthCheckResult(endpoint_id=endpoint_id, **health)

@app.get("/health")
async def get_all_health():
    """Get health status of all endpoints"""
    return {
        endpoint_id: HealthCheckResult(endpoint_id=endpoint_id, **health)
        for endpoint_id, health in endpoint_health.items()
    }

@app.get("/metrics/{endpoint_id}")
async def get_endpoint_metrics(endpoint_id: str, limit: int = 100):
    """Get metrics for an endpoint"""
    if endpoint_id not in ENDPOINTS:
        raise HTTPException(status_code=404, detail="Endpoint not found")
    
    metrics = endpoint_metrics.get(endpoint_id, [])[-limit:]
    return {"endpoint_id": endpoint_id, "metrics": metrics}

@app.get("/stats")
async def get_stats():
    """Get overall statistics"""
    total_endpoints = len(ENDPOINTS)
    healthy = sum(1 for h in endpoint_health.values() if h.get("status") == HealthStatus.HEALTHY)
    degraded = sum(1 for h in endpoint_health.values() if h.get("status") == HealthStatus.DEGRADED)
    unhealthy = sum(1 for h in endpoint_health.values() if h.get("status") == HealthStatus.UNHEALTHY)
    
    return {
        "total_endpoints": total_endpoints,
        "healthy": healthy,
        "degraded": degraded,
        "unhealthy": unhealthy,
        "timestamp": datetime.utcnow(),
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)