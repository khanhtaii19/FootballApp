# Server Dockerfile — multi-stage build
FROM node:22-alpine AS base
WORKDIR /app

# ─── Install dependencies ───
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

# ─── Build ───
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# ─── Production ───
FROM base AS runner
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json ./

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
