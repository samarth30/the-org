FROM node:20-slim

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    curl \
    ffmpeg \
    git \
    python3 \
    unzip \
    build-essential \
    make \
    g++ \
    pkg-config \
    libnss3-dev \
    libatk-bridge2.0-dev \
    libgtk-3-dev \
    libxss1 \
    libasound2-dev && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

RUN npm install -g bun@1.2.5 @elizaos/cli

# Set environment variables to avoid native module compilation issues
ENV NODE_ENV=production
ENV PYTHON=/usr/bin/python3
ENV PORT=3000
ENV HOST=0.0.0.0

COPY package.json tsconfig.json ./
COPY .bunfig.toml ./

# Install dependencies 
RUN bun install

# Copy source code
COPY src ./src
COPY . .

# Build the project
RUN bun run build

EXPOSE 3000
EXPOSE 50000-50100/udp

CMD ["bun", "run", "start"]