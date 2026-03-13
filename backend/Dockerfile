FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json

RUN npm ci --workspace backend

WORKDIR /app/backend

COPY backend/package.json ./package.json
COPY backend/tsconfig.json ./tsconfig.json
COPY backend/prisma ./prisma
COPY backend/src ./src

EXPOSE 3001

CMD ["sh", "-c", "npx prisma generate && node --import tsx src/server.ts"]