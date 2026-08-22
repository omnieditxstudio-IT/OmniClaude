import Redis from 'ioredis';
import { createHash } from 'crypto';
import env from '../config';

interface CacheOptions {
  ttl?: number; // seconds
  prefix?: string;
}

interface SemanticCacheEntry {
  request: any;
  response: any;
  embedding: number[];
  createdAt: number;
  hits: number;
}

export class CacheService {
  private client: Redis;
  private defaultTtl = 3600; // 1 hour
  private semanticPrefix = 'semantic:';
  private exactPrefix = 'exact:';

  constructor() {
    this.client = new Redis(env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 50, 2000),
      enableReadyCheck: true,
      lazyConnect: true,
    });

    this.client.on('error', (err) => {
      console.error('Redis connection error:', err);
    });

    this.client.on('connect', () => {
      console.log('✅ Connected to Redis');
    });
  }

  async connect(): Promise<void> {
    if (this.client.status === 'wait') {
      await this.client.connect();
    }
  }

  async disconnect(): Promise<void> {
    await this.client.quit();
  }

  // Generate cache key from request
  private generateKey(request: any, prefix: string): string {
    const normalized = JSON.stringify({
      model: request.model,
      messages: request.messages,
      system: request.system,
      temperature: request.temperature,
      max_tokens: request.max_tokens,
      tools: request.tools,
    });
    const hash = createHash('sha256').update(normalized).digest('hex').slice(0, 32);
    return `${prefix}${hash}`;
  }

  // Exact cache (for identical requests)
  async getExact(request: any): Promise<any | null> {
    const key = this.generateKey(request, this.exactPrefix);
    const cached = await this.client.get(key);
    if (cached) {
      const parsed = JSON.parse(cached);
      return parsed.response;
    }
    return null;
  }

  async setExact(request: any, response: any, options: CacheOptions = {}): Promise<void> {
    const key = this.generateKey(request, this.exactPrefix);
    const ttl = options.ttl || this.defaultTtl;
    await this.client.setex(key, ttl, JSON.stringify({ response, createdAt: Date.now() }));
  }

  // Semantic cache (for similar requests using embeddings)
  async getSemantic(request: any, embedding: number[], threshold = 0.95): Promise<any | null> {
    const prefix = this.semanticPrefix;
    const keys = await this.client.keys(`${prefix}*`);
    
    if (keys.length === 0) return null;

    // Get all cached entries
    const entries: SemanticCacheEntry[] = [];
    for (const key of keys) {
      const data = await this.client.get(key);
      if (data) {
        entries.push(JSON.parse(data));
      }
    }

    // Find best match using cosine similarity
    let bestMatch: SemanticCacheEntry | null = null;
    let bestScore = 0;

    for (const entry of entries) {
      const score = this.cosineSimilarity(embedding, entry.embedding);
      if (score > threshold && score > bestScore) {
        bestScore = score;
        bestMatch = entry;
      }
    }

    if (bestMatch) {
      // Increment hit count
      bestMatch.hits++;
      const key = this.generateKey(bestMatch.request, this.semanticPrefix);
      await this.client.set(key, JSON.stringify(bestMatch));
      return bestMatch.response;
    }

    return null;
  }

  async setSemantic(request: any, response: any, embedding: number[], options: CacheOptions = {}): Promise<void> {
    const key = this.generateKey(request, this.semanticPrefix);
    const ttl = options.ttl || this.defaultTtl;
    const entry: SemanticCacheEntry = {
      request,
      response,
      embedding,
      createdAt: Date.now(),
      hits: 0,
    };
    await this.client.setex(key, ttl, JSON.stringify(entry));
  }

  // Cosine similarity for embeddings
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  // Generate embedding for request (using a simple hash-based approach or external service)
  async generateEmbedding(text: string): Promise<number[]> {
    // In production, use a real embedding model (e.g., text-embedding-3-small)
    // For now, use a simple hash-based pseudo-embedding
    const hash = createHash('sha256').update(text).digest();
    const embedding = new Array(384).fill(0);
    for (let i = 0; i < hash.length; i++) {
      embedding[i % 384] += hash[i] / 255;
    }
    // Normalize
    const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map(val => val / norm);
  }

  // Get embedding for entire request
  async getRequestEmbedding(request: any): Promise<number[]> {
    const text = [
      request.system || '',
      ...request.messages.map((m: any) => typeof m.content === 'string' ? m.content : 
        m.content?.map((c: any) => c.text || '').join(' ') || ''
      ),
    ].join('\n');
    return this.generateEmbedding(text);
  }

  // Cache invalidation
  async invalidatePattern(pattern: string): Promise<number> {
    const keys = await this.client.keys(pattern);
    if (keys.length > 0) {
      return this.client.del(...keys);
    }
    return 0;
  }

  async invalidateUserCache(userId: string): Promise<void> {
    await this.invalidatePattern(`*${userId}*`);
  }

  async invalidateModelCache(modelId: string): Promise<void> {
    await this.invalidatePattern(`*${modelId}*`);
  }

  // Health check
  async healthCheck(): Promise<{ healthy: boolean; latency?: number; error?: string }> {
    const start = Date.now();
    try {
      await this.client.ping();
      return { healthy: true, latency: Date.now() - start };
    } catch (error) {
      return { healthy: false, latency: Date.now() - start, error: (error as Error).message };
    }
  }

  // Stats
  async getStats(): Promise<{ keys: number; memory: string }> {
    const info = await this.client.info('memory');
    const keys = await this.client.dbsize();
    const memoryMatch = info.match(/used_memory_human:(\S+)/);
    return {
      keys,
      memory: memoryMatch ? memoryMatch[1] : 'unknown',
    };
  }
}

export const cacheService = new CacheService();