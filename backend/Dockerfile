# traders-api (NestJS) — development image with hot reload.
FROM node:20-alpine

WORKDIR /app

# Prisma needs OpenSSL present on Alpine.
RUN apk add --no-cache openssl

# Install deps first (better layer caching). Copy prisma schema too so the
# `postinstall` (prisma generate) has the schema available.
COPY package*.json ./
COPY prisma ./prisma
RUN npm install

# App source (overlaid by a bind mount in docker-compose for live reload).
COPY . .

EXPOSE 8091

# Default command (compose overrides it to also sync the DB schema first).
CMD ["npm", "run", "start:dev"]
