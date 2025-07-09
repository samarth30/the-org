FROM node:18-slim

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

# Set environment variables to avoid native module compilation issues
ENV NODE_ENV=production
ENV PYTHON=/usr/bin/python3

COPY package.json tsconfig.json ./
COPY .bunfig.toml ./

# Install dependencies skipping problematic native modules
RUN bun install --ignore-scripts --no-verify

# Copy source code
COPY src ./src
COPY . .

EXPOSE 3000

CMD ["bun", "run", "start"]