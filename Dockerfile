# Bayanis application image: the Next.js app plus what its background features need at
# runtime (Python + pbixray for the .pbix crawl, the scheduler scripts, the migrations).
# One image runs three services (see deploy/docker-compose.yml): the app, and the two
# schedulers with a different command.

FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# puppeteer is only a local test tool here; its install step downloads a browser,
# which the image neither needs nor can always fetch.
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN npm ci

FROM deps AS build
COPY . .
# NEXT_PUBLIC_* values are compiled into the client bundle, so they are build arguments.
ARG NEXT_PUBLIC_APP_ENVIRONMENT=DEMO
ENV NEXT_PUBLIC_APP_ENVIRONMENT=$NEXT_PUBLIC_APP_ENVIRONMENT \
    NEXT_TELEMETRY_DISABLED=1
# The build only needs these to be present, not real: nothing connects to a database
# while compiling. The real values come from the server's .env at run time.
RUN DATABASE_URL=postgres://build:build@localhost:5432/build \
    AUTH_SECRET=build-time-placeholder-not-used-at-runtime \
    npm run build

FROM node:24-bookworm-slim AS run
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-pip python-is-python3 \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY scripts/requirements-pbixray.txt ./scripts/requirements-pbixray.txt
RUN pip install --no-cache-dir --break-system-packages -r scripts/requirements-pbixray.txt
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000
COPY package.json package-lock.json ./
RUN PUPPETEER_SKIP_DOWNLOAD=true npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY next.config.mjs ./
COPY scripts ./scripts
COPY db ./db
COPY lib ./lib
USER node
EXPOSE 3000
CMD ["node_modules/.bin/next", "start", "-p", "3000"]
