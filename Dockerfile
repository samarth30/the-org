FROM node:23.3.0-slim AS builder

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    ffmpeg \
    g++ \
    git \
    make \
    python3 \
    python3-dev \
    pkg-config \
    libnode-dev \
    unzip && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

RUN npm install -g bun@1.2.5 node-gyp@latest

RUN ln -s /usr/bin/python3 /usr/bin/python

COPY package.json ./
COPY . .

RUN bun install --no-cache

RUN bun run build

FROM node:23.3.0-slim

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    curl \
    ffmpeg \
    git \
    python3 \
    unzip && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

RUN npm install -g bun@1.2.5

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src ./src

ENV NODE_ENV=production

EXPOSE 3000

CMD ["bun", "run", "start"]