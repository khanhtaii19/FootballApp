# Server Dockerfile: nhiều stage
#   deps      : toàn bộ dependencies (dùng cho build và cho docker-compose.yml ở môi trường dev)
#   build     : biên dịch TypeScript
#   prod-deps : chỉ dependencies chạy thật + Prisma Client đã generate
#   runner    : image production, chạy bằng user không phải root
FROM node:22-alpine AS base
WORKDIR /app
# Prisma trên Alpine cần OpenSSL
RUN apk add --no-cache openssl

# ─── Toàn bộ dependencies ───
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ─── Build ───
FROM deps AS build
COPY . .
RUN npx prisma generate && npm run build

# ─── Dependencies production ───
# Prisma Client PHẢI được generate trong chính node_modules sẽ đưa vào image cuối.
FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY prisma ./prisma
RUN npx prisma generate

# ─── Production ───
FROM base AS runner
ENV NODE_ENV=production

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY prisma ./prisma
COPY package.json ./
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh && chown -R node:node /app

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
