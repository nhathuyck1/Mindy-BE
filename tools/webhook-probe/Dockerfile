FROM node:22.20.0-alpine AS dependencies
RUN npm install --global pnpm@12.6.0
WORKDIR /probe
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile

FROM node:22.20.0-alpine
ENV NODE_ENV=production
WORKDIR /probe
COPY --from=dependencies --chown=node:node /probe/node_modules ./node_modules
COPY --chown=node:node package.json receiver.mjs server.mjs ./
USER node
EXPOSE 3100
CMD ["node", "server.mjs"]
