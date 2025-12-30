# =============================================================================
# Dockerfile - News Crawler Production Build
# =============================================================================
# Multi-stage build for optimized production image
# Usage: docker build -t news-crawler -f deploy/Dockerfile .
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Dependencies
# -----------------------------------------------------------------------------
FROM node:20-alpine AS deps

WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++ git

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production --ignore-scripts

# -----------------------------------------------------------------------------
# Stage 2: Production Image
# -----------------------------------------------------------------------------
FROM node:20-alpine AS production

LABEL maintainer="News Crawler Team"
LABEL description="Production news crawler service"
LABEL version="1.0.0"

WORKDIR /app

# Install runtime dependencies
# - chromium: for Puppeteer fallback
# - tini: proper init system for containers
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    tini \
    curl \
    && rm -rf /var/cache/apk/*

# Puppeteer configuration
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Create non-root user for security
RUN addgroup -g 1001 -S crawler && \
    adduser -u 1001 -S crawler -G crawler

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application source
COPY package*.json ./
COPY src/ ./src/
COPY config/ ./config/
COPY crawl.js ./

# Copy deployment scripts
COPY deploy/scripts/ ./deploy/scripts/

# Set ownership
RUN chown -R crawler:crawler /app

# Switch to non-root user
USER crawler

# Environment defaults
ENV NODE_ENV=production \
    NODE_OPTIONS="--max-old-space-size=2048" \
    CRAWL_CONFIG_PATH=/app/config/crawl-runner.json

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD node deploy/scripts/health-check.js || exit 1

# Use tini as init system
ENTRYPOINT ["/sbin/tini", "--"]

# Default command
CMD ["node", "crawl.js"]
