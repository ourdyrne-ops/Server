# Build Stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies required by native modules (like bcrypt, Prisma, fluent-ffmpeg)
RUN apk add --no-cache python3 make g++ ffmpeg

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci

# Generate Prisma Client
RUN npx prisma generate

# Copy source code
COPY . .

# Build the NestJS app
RUN npm run build

# Production Stage
FROM node:20-alpine

WORKDIR /app

# Install runtime dependencies for media processing
RUN apk add --no-cache ffmpeg

# Copy package files and runtime dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy generated Prisma client
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Copy built application
COPY --from=builder /app/dist ./dist

# Create storage directories for media processing
RUN mkdir -p storage/hls storage/keys && chown -R node:node storage

# Use non-root user
USER node

EXPOSE 3000

CMD ["npm", "run", "start:prod"]
