FROM node:18-slim

# Install Python and I2C dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-smbus \
    i2c-tools \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy from the server subfolder into the container's /app
COPY server/package*.json ./
RUN npm install

# Copy the rest of the server code (including the driver folder)
COPY server/ .

CMD ["npm", "start"]