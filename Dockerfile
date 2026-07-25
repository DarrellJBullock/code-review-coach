# Single image for both the api and worker Railway services — which
# process runs is chosen at container start via SERVICE_ROLE (see
# docker-entrypoint.sh), so both services deploy from this one build.

FROM node:24-slim AS build
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY packages/shared packages/shared
COPY apps/api/package.json apps/api/package.json
COPY apps/api/prisma apps/api/prisma
COPY apps/web/package.json apps/web/package.json
RUN npm ci

COPY apps/api apps/api
RUN npm run build --workspace apps/api

FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules node_modules
# npm workspaces doesn't hoist every package to the root node_modules (e.g.
# @anthropic-ai/sdk stays nested under apps/api's own node_modules) — copy
# it too so subpath imports like @anthropic-ai/sdk/helpers/zod resolve.
COPY --from=build /app/apps/api/node_modules apps/api/node_modules
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/shared/package.json packages/shared/package.json
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/prisma apps/api/prisma
COPY --from=build /app/apps/api/package.json apps/api/package.json
COPY docker-entrypoint.sh docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

ENTRYPOINT ["./docker-entrypoint.sh"]
