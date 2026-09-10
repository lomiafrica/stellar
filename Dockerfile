FROM node:22-alpine
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile || pnpm install
COPY . .
RUN pnpm build
ENV PORT=3456
EXPOSE 3456
CMD ["node", "dist/main.js"]
