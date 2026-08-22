from fastapi import FastAPI, HTTPException, BackgroundTasks, Depends, Header
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any, Set
from enum import Enum
import httpx
import asyncio
import time
import logging
import os
import json
from datetime import datetime, timedelta
from collections import defaultdict
import redis.asyncio as redis
from contextlib import asynccontextmanager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Redis connection
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
redis_client: Optional[redis.Redis] = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global redis_client
    redis_client = redis.from_url(REDIS_URL, decode_responses=True)
    await load_endpoints_from_redis()
    asyncio.create_task(periodic_health_checks())
    asyncio.create_task(periodic_metrics_aggregation())
    yield
    await redis_client.close()

app = FastAPI(
    title="Model Translation Gateway - Python Router",
    version="2.0.0",
    lifespan=lifespan
)

# Redis keys
ENDPOINTS_KEY = "gateway:endpoints"
HEALTH_KEY = "gateway:health:"
METRICS_KEY = "gateway:metrics:"
RATE_LIMIT_KEY = "gateway:ratelimit:"
CIRCUIT_BREAKER_KEY = "gateway:circuit:"

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
    WEIGHTED = "weighted"
    ADAPTIVE = "adaptive"  # ML-based selection

class HealthStatus(str, Enum):
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"

class CircuitState(str, Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"

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
    region: Optional[str] = None
    tags: List[str] = []

class RouteRequest(BaseModel):
    claude_model: str
    user_id: str
    organization_id: Optional[str] = None
    preferred_providers: List[ProviderType] = []
    excluded_endpoints: List[str] = []
    strategy: RouteStrategy = RouteStrategy.ADAPTIVE
    fallback_enabled: bool = True
    max_fallbacks: int = 3
    cost_optimize: bool = False
    latency_optimize: bool = True
    require_tools: bool = False
    require_vision: bool = False
    min_context_window: Optional[int] = None
    max_tokens: Optional[int] = None
    temperature: Optional[float] = None
    metadata: Dict[str, Any] = {}

class RouteResponse(BaseModel):
    endpoint_id: str
    provider_model: str
    reasoning: str
    estimated_latency_ms: float
    estimated_cost: float
    fallback_chain: List[Dict[str, Any]] = []

class HealthCheckResult(BaseModel):
    endpoint_id: str
    status: HealthStatus
    latency_ms: float
    error: Optional[str] = None
    checked_at: datetime
    circuit_state: CircuitState = CircuitState.CLOSED

class MetricsRequest(BaseModel):
    endpoint_id: str
    latency_ms: float
    status_code: int
    tokens_in: int
    tokens_out: int
    error: Optional[str] = None
    user_id: Optional[str] = None
    model: Optional[str] = None

class EndpointMetrics(BaseModel):
    endpoint_id: str
    total_requests: int
    successful_requests: int
    failed_requests: int
    avg_latency_ms: float
    p50_latency_ms: float
    p95_latency_ms: float
    p99_latency_ms: float
    total_tokens_in: int
    total_tokens_out: int
    error_rate: float
    cost_estimate: float
    last_updated: datetime

class CircuitBreakerState(BaseModel):
    endpoint_id: str
    state: CircuitState
    failure_count: int
    success_count: int
    last_failure: Optional[datetime]
    last_success: Optional[datetime]
    next_attempt: Optional[datetime]

# Configuration
CIRCUIT_BREAKER_THRESHOLD = 5  # failures before opening
CIRCUIT_BREAKER_TIMEOUT = 30  # seconds before half-open
CIRCUIT_BREAKER_HALF_OPEN_MAX = 3  # successes needed to close

async def load_endpoints_from_redis():
    """Load endpoints from Redis"""
    global ENDPOINTS
    data = await redis_client.get(ENDPOINTS_KEY)
    if data:
        ENDPOINTS = {k: EndpointConfig(**v) for k, v in json.loads(data).items()}
    else:
        ENDPOINTS = {}

async def save_endpoints_to_redis():
    """Save endpoints to Redis"""
    data = {k: v.model_dump() for k, v in ENDPOINTS.items()}
    await redis_client.set(ENDPOINTS_KEY, json.dumps(data))

async def get_circuit_breaker(endpoint_id: str) -> CircuitBreakerState:
    """Get circuit breaker state from Redis"""
    key = f"{CIRCUIT_BREAKER_KEY}{endpoint_id}"
    data = await redis_client.get(key)
    if data:
        return CircuitBreakerState(**json.loads(data))
    return CircuitBreakerState(
        endpoint_id=endpoint_id,
        state=CircuitState.CLOSED,
        failure_count=0,
        success_count=0,
    )

async def update_circuit_breaker(state: CircuitBreakerState):
    """Update circuit breaker state in Redis"""
    key = f"{CIRCUIT_BREAKER_KEY}{state.endpoint_id}"
    await redis_client.set(key, json.dumps(state.model_dump()), ex=3600)

async def check_circuit_breaker(endpoint_id: str) -> bool:
    """Check if circuit breaker allows requests"""
    cb = await get_circuit_breaker(endpoint_id)
    
    if cb.state == CircuitState.CLOSED:
        return True
    
    if cb.state == CircuitState.OPEN:
        if cb.next_attempt and datetime.utcnow() >= cb.next_attempt:
            # Move to half-open
            cb.state = CircuitState.HALF_OPEN
            cb.success_count = 0
            await update_circuit_breaker(cb)
            return True
        return False
    
    # HALF_OPEN - allow limited requests
    return True

async def record_circuit_success(endpoint_id: str):
    """Record successful request for circuit breaker"""
    cb = await get_circuit_breaker(endpoint_id)
    cb.success_count += 1
    cb.last_success = datetime.utcnow()
    
    if cb.state == CircuitState.HALF_OPEN and cb.success_count >= CIRCUIT_BREAKER_HALF_OPEN_MAX:
        cb.state = CircuitState.CLOSED
        cb.failure_count = 0
    
    await update_circuit_breaker(cb)

async def record_circuit_failure(endpoint_id: str):
    """Record failed request for circuit breaker"""
    cb = await get_circuit_breaker(endpoint_id)
    cb.failure_count += 1
    cb.last_failure = datetime.utcnow()
    
    if cb.state == CircuitState.HALF_OPEN:
        cb.state = CircuitState.OPEN
        cb.next_attempt = datetime.utcnow() + timedelta(seconds=CIRCUIT_BREAKER_TIMEOUT)
    elif cb.state == CircuitState.CLOSED and cb.failure_count >= CIRCUIT_BREAKER_THRESHOLD:
        cb.state = CircuitState.OPEN
        cb.next_attempt = datetime.utcnow() + timedelta(seconds=CIRCUIT_BREAKER_TIMEOUT)
    
    await update_circuit_breaker(cb)

# In-memory fallback (when Redis unavailable)
ENDPOINTS: Dict[str, EndpointConfig] = {}
endpoint_health: Dict[str, Dict] = {}
endpoint_metrics: Dict[str, List] = defaultdict(list)

class AdaptiveRouter:
    """ML-based adaptive routing"""
    
    def __init__(self):
        self.model_scores: Dict[str, Dict[str, float]] = defaultdict(lambda: defaultdict(float))
    
    async def score_endpoint(self, endpoint: EndpointConfig, request: RouteRequest) -> float:
        """Score endpoint based on multiple factors"""
        health = endpoint_health.get(endpoint.id, {})
        cb = await get_circuit_breaker(endpoint.id)
        
        # Base score
        score = 1.0
        
        # Health factor
        status = health.get("status", HealthStatus.UNHEALTHY)
        if status == HealthStatus.HEALTHY:
            score *= 1.0
        elif status == HealthStatus.DEGRADED:
            score *= 0.5
        else:
            score *= 0.1
        
        # Circuit breaker factor
        if cb.state == CircuitState.OPEN:
            score *= 0.01
        elif cb.state == CircuitState.HALF_OPEN:
            score *= 0.5
        
        # Latency factor (lower is better)
        latency = health.get("latency_ms", 1000)
        score *= max(0.1, 1.0 - (latency / 10000))
        
        # Error rate factor
        recent_metrics = endpoint_metrics.get(endpoint.id, [])[-100:]
        if recent_metrics:
            error_rate = sum(1 for m in recent_metrics if m.get("status_code", 200) >= 400) / len(recent_metrics)
            score *= max(0.1, 1.0 - error_rate)
        
        # Cost factor
        if request.cost_optimize:
            cost = endpoint.cost_per_1k_input + endpoint.cost_per_1k_output
            if cost > 0:
                score *= max(0.1, 1.0 - (cost / 10))  # Normalize to $10/1k
        
        # Latency factor
        if request.latency_optimize:
            score *= max(0.1, 1.0 - (latency / 5000))
        
        # Priority/weight
        score *= (endpoint.priority + 1) * endpoint.weight
        
        # Context window requirement
        if request.min_context_window:
            # Would need model info
            pass
        
        # Tool/vision requirements
        if request.require_tools or request.require_vision:
            # Would need model capabilities
            pass
        
        # Learn from history
        model_key = f"{request.claude_model}:{endpoint.id}"
        historical_score = self.model_scores[request.user_id].get(model_key, 0.5)
        score = 0.7 * score + 0.3 * historical_score
        
        return score
    
    async def update_score(self, user_id: str, model: str, endpoint_id: str, success: bool, latency: float):
        """Update model scores based on outcome"""
        model_key = f"{model}:{endpoint_id}"
        current = self.model_scores[user_id].get(model_key, 0.5)
        
        if success:
            # Reward: increase score based on latency
            reward = max(0.1, 1.0 - (latency / 10000))
            self.model_scores[user_id][model_key] = min(1.0, current + 0.1 * reward)
        else:
            # Penalty
            self.model_scores[user_id][model_key] = max(0.0, current - 0.2)

adaptive_router = AdaptiveRouter()

# ==================== Health Checks ====================

async def check_all_endpoints():
    for endpoint_id, config in ENDPOINTS.items():
        await check_endpoint_health(endpoint_id, config)

async def check_endpoint_health(endpoint_id: str, config: EndpointConfig):
    if not await check_circuit_breaker(endpoint_id):
        endpoint_health[endpoint_id] = {
            "status": HealthStatus.UNHEALTHY,
            "latency_ms": 0,
            "error": "Circuit breaker open",
            "checked_at": datetime.utcnow(),
        }
        return

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
                await record_circuit_success(endpoint_id)
            elif response.status_code >= 500:
                status = HealthStatus.DEGRADED
                error = f"HTTP {response.status_code}"
                await record_circuit_failure(endpoint_id)
            else:
                status = HealthStatus.UNHEALTHY
                error = f"HTTP {response.status_code}"
                await record_circuit_failure(endpoint_id)
                
    except httpx.TimeoutException:
        latency = (time.time() - start) * 1000
        status = HealthStatus.UNHEALTHY
        error = "Timeout"
        await record_circuit_failure(endpoint_id)
    except Exception as e:
        latency = (time.time() - start) * 1000
        status = HealthStatus.UNHEALTHY
        error = str(e)
        await record_circuit_failure(endpoint_id)
    
    cb = await get_circuit_breaker(endpoint_id)
    
    endpoint_health[endpoint_id] = {
        "status": status,
        "latency_ms": latency,
        "error": error,
        "checked_at": datetime.utcnow(),
        "circuit_state": cb.state,
    }
    
    # Store metrics in Redis
    if redis_client:
        await redis_client.hset(
            f"{HEALTH_KEY}{endpoint_id}",
            mapping={
                "status": status.value,
                "latency_ms": str(latency),
                "error": error or "",
                "checked_at": datetime.utcnow().isoformat(),
                "circuit_state": cb.state.value,
            }
        )
    
    logger.info(f"Health check {endpoint_id}: {status.value} ({latency:.0f}ms) [{cb.state.value}]")

# ==================== Routing ====================

def select_endpoint_adaptive(request: RouteRequest, available_endpoints: List[EndpointConfig]) -> Optional[EndpointConfig]:
    """Select best endpoint using adaptive strategy"""
    if not available_endpoints:
        return None
    
    # Filter by circuit breaker and health
    healthy_endpoints = []
    for e in available_endpoints:
        if e.id in request.excluded_endpoints:
            continue
        cb = asyncio.run(check_circuit_breaker(e.id))  # sync for now
        if cb and endpoint_health.get(e.id, {}).get("status") != HealthStatus.UNHEALTHY:
            healthy_endpoints.append(e)
    
    if not healthy_endpoints and request.fallback_enabled:
        healthy_endpoints = [e for e in available_endpoints if e.id not in request.excluded_endpoints]
    
    if not healthy_endpoints:
        return None
    
    # Score all endpoints
    scored = []
    for e in healthy_endpoints:
        score = asyncio.run(adaptive_router.score_endpoint(e, request))
        scored.append((score, e))
    
    # Sort by score descending
    scored.sort(key=lambda x: x[0], reverse=True)
    
    return scored[0][1] if scored else None

def select_endpoint_strategy(request: RouteRequest, available_endpoints: List[EndpointConfig]) -> Optional[EndpointConfig]:
    """Select endpoint using specified strategy"""
    if not available_endpoints:
        return None
    
    healthy_endpoints = [
        e for e in available_endpoints
        if e.id not in request.excluded_endpoints
        and endpoint_health.get(e.id, {}).get("status") != HealthStatus.UNHEALTHY
    ]
    
    if not healthy_endpoints and request.fallback_enabled:
        healthy_endpoints = [e for e in available_endpoints if e.id not in request.excluded_endpoints]
    
    if not healthy_endpoints:
        return None
    
    if request.strategy == RouteStrategy.ROUND_ROBIN:
        # Use hash of user_id for consistent routing
        idx = hash(request.user_id) % len(healthy_endpoints)
        return healthy_endpoints[idx]
    
    elif request.strategy == RouteStrategy.LEAST_LATENCY:
        return min(healthy_endpoints, key=lambda e: endpoint_health.get(e.id, {}).get("latency_ms", float('inf')))
    
    elif request.strategy == RouteStrategy.LEAST_ERRORS:
        return min(healthy_endpoints, key=lambda e: {
            e: sum(1 for m in endpoint_metrics.get(e.id, [])[-100:] if m.get("status_code", 200) >= 400) / max(1, len(endpoint_metrics.get(e.id, [])[-100:]))
        }[e])
    
    elif request.strategy == RouteStrategy.COST_OPTIMIZED:
        return min(healthy_endpoints, key=lambda e: e.cost_per_1k_input + e.cost_per_1k_output)
    
    elif request.strategy == RouteStrategy.PRIORITY:
        return max(healthy_endpoints, key=lambda e: e.priority)
    
    elif request.strategy == RouteStrategy.WEIGHTED:
        # Weighted random selection
        total_weight = sum(e.weight for e in healthy_endpoints)
        r = random.random() * total_weight
        cumulative = 0
        for e in healthy_endpoints:
            cumulative += e.weight
            if r <= cumulative:
                return e
        return healthy_endpoints[-1]
    
    elif request.strategy == RouteStrategy.ADAPTIVE:
        return select_endpoint_adaptive(request, available_endpoints)
    
    return healthy_endpoints[0]

def build_fallback_chain(request: RouteRequest, primary: EndpointConfig, available: List[EndpointConfig]) -> List[Dict]:
    """Build fallback chain"""
    fallbacks = []
    excluded = set(request.excluded_endpoints)
    excluded.add(primary.id)
    
    for e in available:
        if e.id in excluded:
            continue
        if endpoint_health.get(e.id, {}).get("status") == HealthStatus.UNHEALTHY:
            continue
        if not await check_circuit_breaker(e.id):
            continue
        
        fallbacks.append({
            "endpoint_id": e.id,
            "provider_model": e.models[0] if e.models else "unknown",
            "reason": f"Fallback: {e.provider.value}",
            "estimated_latency_ms": endpoint_health.get(e.id, {}).get("latency_ms", 0),
        })
        
        if len(fallbacks) >= request.max_fallbacks:
            break
    
    return fallbacks

# ==================== API Endpoints ====================

@app.post("/route", response_model=RouteResponse)
async def route_request(request: RouteRequest):
    """Route a request to the best endpoint"""
    # Get available endpoints
    available = [
        e for e in ENDPOINTS.values()
        if (not request.preferred_providers or e.provider in request.preferred_providers)
        and (not request.require_tools or "tools" in e.tags)
        and (not request.require_vision or "vision" in e.tags)
        and (not request.min_context_window or max((m.get("contextWindow", 0) for m in e.models), default=0) >= request.min_context_window)
    ]
    
    if not available:
        raise HTTPException(status_code=404, detail="No available endpoints matching criteria")
    
    # Select primary endpoint
    if request.strategy == RouteStrategy.ADAPTIVE:
        selected = select_endpoint_adaptive(request, available)
    else:
        selected = select_endpoint_strategy(request, available)
    
    if not selected:
        raise HTTPException(status_code=503, detail="No healthy endpoints available")
    
    # Build fallback chain
    fallback_chain = []
    if request.fallback_enabled:
        fallback_chain = build_fallback_chain(request, selected, available)
    
    # Calculate estimates
    health = endpoint_health.get(selected.id, {})
    latency = health.get("latency_ms", 0)
    cost = (selected.cost_per_1k_input + selected.cost_per_1k_output) * (request.max_tokens or 1000) / 1000
    
    return RouteResponse(
        endpoint_id=selected.id,
        provider_model=selected.models[0] if selected.models else "unknown",
        reasoning=f"Selected via {request.strategy.value} strategy",
        estimated_latency_ms=latency,
        estimated_cost=cost,
        fallback_chain=fallback_chain,
    )

@app.post("/endpoints", response_model=EndpointConfig)
async def create_endpoint(config: EndpointConfig):
    """Create or update endpoint configuration"""
    ENDPOINTS[config.id] = config
    await save_endpoints_to_redis()
    return config

@app.get("/endpoints", response_model=List[EndpointConfig])
async def list_endpoints():
    """List all endpoints"""
    return list(ENDPOINTS.values())

@app.get("/endpoints/{endpoint_id}", response_model=EndpointConfig)
async def get_endpoint(endpoint_id: str):
    """Get endpoint configuration"""
    if endpoint_id not in ENDPOINTS:
        raise HTTPException(status_code=404, detail="Endpoint not found")
    return ENDPOINTS[endpoint_id]

@app.delete("/endpoints/{endpoint_id}")
async def delete_endpoint(endpoint_id: str):
    """Delete endpoint"""
    if endpoint_id not in ENDPOINTS:
        raise HTTPException(status_code=404, detail="Endpoint not found")
    del ENDPOINTS[endpoint_id]
    await save_endpoints_to_redis()
    return {"status": "deleted"}

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
        "user_id": metrics.user_id,
        "model": metrics.model,
    })
    
    # Update circuit breaker
    if metrics.status_code >= 400:
        await record_circuit_failure(metrics.endpoint_id)
    else:
        await record_circuit_success(metrics.endpoint_id)
    
    # Update adaptive router
    if metrics.model:
        await adaptive_router.update_score(
            metrics.user_id or "unknown",
            metrics.model,
            metrics.endpoint_id,
            metrics.status_code < 400,
            metrics.latency_ms
        )
    
    # Store in Redis
    if redis_client:
        key = f"{METRICS_KEY}{metrics.endpoint_id}"
        await redis_client.lpush(key, json.dumps({
            "timestamp": datetime.utcnow().isoformat(),
            "latency_ms": metrics.latency_ms,
            "status_code": metrics.status_code,
            "tokens_in": metrics.tokens_in,
            "tokens_out": metrics.tokens_out,
            "error": metrics.error,
        }))
        await redis_client.ltrim(key, 0, 9999)  # Keep last 10k
    
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
    
    cb = await get_circuit_breaker(endpoint_id)
    
    return HealthCheckResult(
        endpoint_id=endpoint_id,
        circuit_state=cb.state,
        **health
    )

@app.get("/health")
async def get_all_health():
    """Get health status of all endpoints"""
    results = {}
    for endpoint_id in ENDPOINTS:
        health = endpoint_health.get(endpoint_id, {
            "status": HealthStatus.UNHEALTHY,
            "latency_ms": 0,
            "error": "Not checked yet",
            "checked_at": datetime.utcnow(),
        })
        cb = await get_circuit_breaker(endpoint_id)
        results[endpoint_id] = HealthCheckResult(
            endpoint_id=endpoint_id,
            circuit_state=cb.state,
            **health
        )
    return results

@app.get("/metrics/{endpoint_id}", response_model=EndpointMetrics)
async def get_endpoint_metrics(endpoint_id: str, limit: int = 1000):
    """Get aggregated metrics for an endpoint"""
    if endpoint_id not in ENDPOINTS:
        raise HTTPException(status_code=404, detail="Endpoint not found")
    
    metrics = endpoint_metrics.get(endpoint_id, [])[-limit:]
    
    if not metrics:
        return EndpointMetrics(
            endpoint_id=endpoint_id,
            total_requests=0,
            successful_requests=0,
            failed_requests=0,
            avg_latency_ms=0,
            p50_latency_ms=0,
            p95_latency_ms=0,
            p99_latency_ms=0,
            total_tokens_in=0,
            total_tokens_out=0,
            error_rate=0,
            cost_estimate=0,
            last_updated=datetime.utcnow(),
        )
    
    latencies = sorted([m["latency_ms"] for m in metrics])
    successful = [m for m in metrics if m.get("status_code", 200) < 400]
    failed = [m for m in metrics if m.get("status_code", 200) >= 400]
    
    def percentile(arr: List[float], p: float) -> float:
        if not arr:
            return 0
        idx = int(len(arr) * p / 100)
        return arr[min(idx, len(arr) - 1)]
    
    config = ENDPOINTS.get(endpoint_id)
    cost = (config.cost_per_1k_input + config.cost_per_1k_output) * sum(m.get("tokens_in", 0) + m.get("tokens_out", 0) for m in metrics) / 1000 if config else 0
    
    return EndpointMetrics(
        endpoint_id=endpoint_id,
        total_requests=len(metrics),
        successful_requests=len(successful),
        failed_requests=len(failed),
        avg_latency_ms=sum(latencies) / len(latencies),
        p50_latency_ms=percentile(latencies, 50),
        p95_latency_ms=percentile(latencies, 95),
        p99_latency_ms=percentile(latencies, 99),
        total_tokens_in=sum(m.get("tokens_in", 0) for m in metrics),
        total_tokens_out=sum(m.get("tokens_out", 0) for m in metrics),
        error_rate=len(failed) / len(metrics) if metrics else 0,
        cost_estimate=cost,
        last_updated=datetime.utcnow(),
    )

@app.get("/circuit-breaker/{endpoint_id}")
async def get_circuit_breaker_state(endpoint_id: str):
    """Get circuit breaker state"""
    cb = await get_circuit_breaker(endpoint_id)
    return cb

@app.post("/circuit-breaker/{endpoint_id}/reset")
async def reset_circuit_breaker(endpoint_id: str):
    """Manually reset circuit breaker"""
    cb = CircuitBreakerState(
        endpoint_id=endpoint_id,
        state=CircuitState.CLOSED,
        failure_count=0,
        success_count=0,
    )
    await update_circuit_breaker(cb)
    return {"status": "reset"}

@app.get("/stats")
async def get_stats():
    """Get overall statistics"""
    total_endpoints = len(ENDPOINTS)
    healthy = sum(1 for h in endpoint_health.values() if h.get("status") == HealthStatus.HEALTHY)
    degraded = sum(1 for h in endpoint_health.values() if h.get("status") == HealthStatus.DEGRADED)
    unhealthy = sum(1 for h in endpoint_health.values() if h.get("status") == HealthStatus.UNHEALTHY)
    
    circuits = {s.value: 0 for s in CircuitState}
    for endpoint_id in ENDPOINTS:
        cb = await get_circuit_breaker(endpoint_id)
        circuits[cb.state.value] += 1
    
    return {
        "total_endpoints": total_endpoints,
        "healthy": healthy,
        "degraded": degraded,
        "unhealthy": unhealthy,
        "circuit_breakers": circuits,
        "timestamp": datetime.utcnow(),
    }

@app.get("/models")
async def list_models():
    """List all available models across endpoints"""
    models = []
    for endpoint_id, config in ENDPOINTS.items():
        health = endpoint_health.get(endpoint_id, {})
        for model in config.models:
            models.append({
                "model_id": model,
                "endpoint_id": endpoint_id,
                "provider": config.provider.value,
                "cost_per_1k_input": config.cost_per_1k_input,
                "cost_per_1k_output": config.cost_per_1k_output,
                "status": health.get("status", HealthStatus.UNHEALTHY).value,
                "latency_ms": health.get("latency_ms", 0),
            })
    return {"models": models}

async def periodic_metrics_aggregation():
    """Periodically aggregate metrics"""
    while True:
        try:
            await asyncio.sleep(60)  # Every minute
            # Could aggregate and store in time-series DB
        except Exception as e:
            logger.error(f"Metrics aggregation error: {e}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)