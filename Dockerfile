FROM node:18-alpine

# Install FFmpeg and required dependencies
RUN apk update && \
    apk add --no-cache \
    ffmpeg \
    python3 \
    make \
    g++ \
    && rm -rf /var/cache/apk/*

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy app source
COPY . .

# Create temp directory with proper permissions
RUN mkdir -p /tmp/video-processing && \
    chmod 777 /tmp/video-processing

# Expose port
EXPOSE 10000

# Start the app
CMD ["node", "server.js"]
