FROM node:22-alpine
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm exec nest build \
  && apk add --no-cache su-exec \
  && addgroup -S lab \
  && adduser -S lab -G lab \
  && mkdir -p /app/data \
  && chown -R lab:lab /app \
  && chmod +x /app/docker-entrypoint.sh
USER root
ENV PORT=3456
ENV STELLAR_DATA_DIR=/app/data
EXPOSE 3456
ENTRYPOINT ["/app/docker-entrypoint.sh"]
