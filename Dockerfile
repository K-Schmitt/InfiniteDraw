# syntax=docker/dockerfile:1

# ---- stage 1: build the client bundle -------------------------------------
FROM node:24-alpine AS client-build
WORKDIR /app
COPY tsconfig.base.json ./
COPY shared ./shared
COPY client/package.json client/package-lock.json ./client/
RUN cd client && npm ci
COPY client ./client
RUN cd client && npm run build

# ---- stage 2: compile the server ------------------------------------------
FROM node:24-alpine AS server-build
WORKDIR /app
COPY tsconfig.base.json ./
COPY shared ./shared
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci
COPY server ./server
RUN cd server && npm run build

# ---- stage 3: runtime ------------------------------------------------------
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev && npm cache clean --force
COPY --from=server-build /app/server/dist ./server/dist
COPY --from=client-build /app/client/dist ./client/dist
RUN mkdir -p /app/data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/dist/server/src/index.js"]
