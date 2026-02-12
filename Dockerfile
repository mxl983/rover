FROM balenalib/raspberrypi3-node:18-bookworm-run

# Install the correct Bookworm packages
RUN install_packages \
    python3 \
    python3-smbus \
    i2c-tools \
    libcamera-apps-lite \
    docker.io \
    uhubctl \ 
    wireless-tools

WORKDIR /app

COPY server/package*.json ./
RUN npm install

COPY server/ .

# Ensure photos directory is ready
RUN mkdir -p /app/photos && chmod 777 /app/photos

CMD ["npm", "start"]