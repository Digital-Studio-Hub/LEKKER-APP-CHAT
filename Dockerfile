# Lekker Chat API — Cloud Run (Neon Postgres)
# Builds server_dist only; mobile client is distributed via EAS stores.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Skip postinstall patches (Expo-only); server needs production deps
RUN npm ci --omit=dev --ignore-scripts

FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json drizzle.config.ts ./
COPY shared ./shared
COPY server ./server
COPY scripts ./scripts
# Bundle Express server (external packages stay in node_modules)
RUN npx esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=server_dist

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV LISTEN_HOST=0.0.0.0

COPY package.json package-lock.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/server_dist ./server_dist
COPY --from=builder /app/shared ./shared
# Landing page + brand icons (served at / and /assets/images/*)
COPY server/templates ./server/templates
COPY assets/images/icon.png assets/images/lekker-logo.png assets/images/favicon.png ./assets/images/

EXPOSE 8080
CMD ["node", "server_dist/index.js"]
