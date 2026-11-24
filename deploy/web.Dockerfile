# Image web: build client rồi phục vụ bằng Caddy (tự cấp HTTPS, proxy /api tới server).
# Build từ thư mục gốc repo:  docker build -f deploy/web.Dockerfile .
FROM node:22-alpine AS build
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
# Cùng một domain với API (Caddy proxy /api) nên không cần CORS
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/client/dist /srv
