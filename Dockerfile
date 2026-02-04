# syntax=docker/dockerfile:1

FROM node:24-bookworm AS deps
WORKDIR /app

ENV NODE_ENV=development

COPY package.json pnpm-lock.yaml* ./
COPY prisma ./prisma

RUN corepack enable \
  && corepack prepare pnpm@10 --activate \
  && pnpm install --prod=false

FROM node:24-bookworm AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"

RUN corepack enable \
  && corepack prepare pnpm@10 --activate \
  && npx prisma generate \
  && pnpm build \
  && pnpm prune --prod

FROM node:24-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@10 --activate

COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts

EXPOSE 5050

CMD ["pnpm", "start:docker"]
