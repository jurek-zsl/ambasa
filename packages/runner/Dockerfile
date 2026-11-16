# Ambasa runner. Build from the repo root:  docker build -f packages/runner/Dockerfile -t ambasa-runner .
FROM node:22-slim AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter @ambasa/runner... && pnpm --filter @ambasa/runner build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production AMBASA_DATA=/data
COPY --from=build /repo/packages/runner/dist ./dist
COPY --from=build /repo/packages/runner/package.json ./package.json
RUN npm install --omit=dev --ignore-scripts --no-audit --no-fund && mkdir /data && chown node /data
USER node
VOLUME /data
# Self-hosted:  docker run -e AMBASA_TOKEN=... -e AMBASA_LLM_PROVIDER=anthropic -e AMBASA_LLM_KEY=... ambasa-runner run
# Dashboard:    docker run -p 127.0.0.1:7777:7777 -e AMBASA_DASHBOARD_HOST=0.0.0.0 -v ambasa:/data ambasa-runner dashboard
# Hosted:       docker run --env-file worker.env ambasa-runner worker
ENTRYPOINT ["node", "dist/cli.js"]
CMD ["run"]
