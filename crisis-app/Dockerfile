# ── PanicZero Frontend — Dockerfile ──────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Accept build-time API URL (injected by Render as build env var)
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

# Build the Vite app
COPY . .
RUN npm run build

# ── Serve the built app with a lightweight static server ─────────────────────
FROM node:20-alpine

WORKDIR /app
RUN npm install -g serve

COPY --from=builder /app/dist ./dist

EXPOSE 5173
CMD ["serve", "-s", "dist", "-l", "5173"]
