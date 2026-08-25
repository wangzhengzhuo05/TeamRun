FROM node:24-bookworm-slim AS build

WORKDIR /workspace
RUN corepack enable

COPY .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY config/patches config/patches
COPY src/packages/teamrun-contracts/package.json src/packages/teamrun-contracts/package.json
COPY src/services/teamrun-api/package.json src/services/teamrun-api/package.json
RUN pnpm install --frozen-lockfile --filter @teamrun/api... --ignore-scripts

COPY src/packages/teamrun-contracts src/packages/teamrun-contracts
COPY src/services/teamrun-api src/services/teamrun-api
RUN pnpm --filter @teamrun/contracts build \
  && pnpm --filter @teamrun/api build \
  && pnpm --filter @teamrun/api deploy --prod --legacy --ignore-scripts /opt/teamrun-api

FROM node:24-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /opt/teamrun-api ./
USER node
CMD ["sh", "-c", "node dist/database/migrate.js && exec node dist/server.js"]
