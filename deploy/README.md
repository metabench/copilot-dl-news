# Deployment Configuration

Production and development deployment setup for the News Crawler system.

## Quick Start

### Production

```bash
# Build images
docker-compose -f deploy/docker-compose.yml build

# Start full stack
docker-compose -f deploy/docker-compose.yml up -d

# Scale crawlers
docker-compose -f deploy/docker-compose.yml up -d --scale crawler=5

# View logs
docker-compose -f deploy/docker-compose.yml logs -f crawler

# Stop
docker-compose -f deploy/docker-compose.yml down
```

### Development

```bash
# Start with dev overrides (source mounting, debug ports)
docker-compose -f deploy/docker-compose.yml -f deploy/docker-compose.dev.yml up

# Access services
# - Dashboard: http://localhost:3099
# - Crawl Observer: http://localhost:3100
# - Adminer (DB UI): http://localhost:8080
# - Redis Commander: http://localhost:8081
# - Node Inspector: chrome://inspect (port 9229)
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        NGINX (optional)                      │
│                      Ports 80, 443                          │
└──────────────────────────┬──────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│   Crawler 1   │  │   Crawler 2   │  │   Crawler 3   │
│   (replica)   │  │   (replica)   │  │   (replica)   │
└───────┬───────┘  └───────┬───────┘  └───────┬───────┘
        │                  │                  │
        └──────────────────┼──────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│   PostgreSQL  │  │     Redis     │  │   Dashboard   │
│   Port 5432   │  │   Port 6379   │  │  Ports 3099,  │
│               │  │               │  │     3100      │
└───────────────┘  └───────────────┘  └───────────────┘
```

## Files

| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage build for crawler service |
| `Dockerfile.dashboard` | Build for dashboard UI servers |
| `docker-compose.yml` | Production stack definition |
| `docker-compose.dev.yml` | Development overrides |
| `config/production.json` | Production crawler config |
| `config/staging.json` | Staging crawler config |
| `scripts/health-check.js` | Container health verification |
| `scripts/graceful-shutdown.js` | Clean shutdown handler |
| `scripts/init-db.sql` | PostgreSQL schema initialization |
| `.dockerignore` | Build context exclusions |

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_USER` | `crawler` | PostgreSQL username |
| `POSTGRES_PASSWORD` | `crawler_secret` | PostgreSQL password |
| `POSTGRES_DB` | `news_crawler` | PostgreSQL database |
| `DATABASE_URL` | (constructed) | Full PostgreSQL connection string |
| `REDIS_URL` | `redis://redis:6379` | Redis connection string |
| `NODE_ENV` | `production` | Node environment |
| `LOG_LEVEL` | `info` | Logging verbosity |

### Volumes

| Volume | Purpose |
|--------|---------|
| `pgdata` | PostgreSQL data persistence |
| `redis-data` | Redis append-only file |
| `crawler-logs` | Crawler log files |
| `crawler-data` | SQLite databases (if used) |

## Health Checks

The crawler container includes health checks that verify:

1. **Database connection** - Can connect and query the database
2. **Memory usage** - Heap usage below 90% of max
3. **Event loop** - Not blocked (lag < 100ms)
4. **Redis** (if configured) - Can PING Redis

```bash
# Manual health check
docker exec news-crawler-1 node deploy/scripts/health-check.js --verbose
```

## Graceful Shutdown

Containers handle SIGTERM gracefully:

1. Stop accepting new work
2. Drain in-flight requests (up to 60s)
3. Close database connections
4. Exit with code 0

```javascript
// Usage in your application
const { setupGracefulShutdown, onShutdown } = require('./deploy/scripts/graceful-shutdown');

setupGracefulShutdown({ timeout: 60000 });

onShutdown('my-cleanup', async () => {
  await myService.close();
}, 10); // priority 10 (lower = earlier)
```

## Scaling

### Horizontal Scaling (Crawlers)

```bash
# Scale to 5 crawler instances
docker-compose -f deploy/docker-compose.yml up -d --scale crawler=5

# Check status
docker-compose -f deploy/docker-compose.yml ps
```

### Resource Limits

Default limits per container:

| Service | CPU | Memory |
|---------|-----|--------|
| Crawler | 1.0 | 2GB |
| Dashboard | 0.5 | 512MB |

Adjust in `docker-compose.yml` under `deploy.resources`.

## Monitoring

### Logs

```bash
# All services
docker-compose -f deploy/docker-compose.yml logs -f

# Specific service
docker-compose -f deploy/docker-compose.yml logs -f crawler

# With timestamps
docker-compose -f deploy/docker-compose.yml logs -f -t crawler
```

### Metrics

The crawler emits structured telemetry to:
- stdout (JSON format)
- `task_events` table in PostgreSQL

Query recent events:
```sql
SELECT * FROM task_events 
WHERE task_type = 'crawl' 
ORDER BY created_at DESC 
LIMIT 100;
```

## Troubleshooting

### Container won't start

```bash
# Check logs
docker-compose -f deploy/docker-compose.yml logs crawler

# Check health
docker inspect --format='{{.State.Health.Status}}' news-crawler-1
```

### Database connection issues

```bash
# Verify PostgreSQL is healthy
docker-compose -f deploy/docker-compose.yml exec postgres pg_isready

# Check connection from crawler
docker-compose -f deploy/docker-compose.yml exec crawler \
  node -e "require('pg').Client({connectionString:process.env.DATABASE_URL}).connect().then(()=>console.log('OK'))"
```

### Memory issues

```bash
# Check container stats
docker stats news-crawler-1

# Increase memory limit in docker-compose.yml
deploy:
  resources:
    limits:
      memory: 4G
```

## Security Notes

1. **Change default passwords** in production
2. **Use secrets management** (Docker secrets, Vault, etc.)
3. **Enable TLS** for PostgreSQL and Redis
4. **Run as non-root** (already configured)
5. **Network isolation** via Docker networks
