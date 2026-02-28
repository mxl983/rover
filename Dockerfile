FROM balenalib/raspberrypi3-node:18-bookworm-run

# Install the correct Bookworm packages
# 1. Add python3-pip and OpenCV system dependencies
RUN install_packages \
    python3 \
    python3-pip \
    python3-dev \
    python3-smbus \
    python3-opencv \
    python3-numpy \
    i2c-tools \
    libcamera-apps-lite \
    docker.io \
    uhubctl \ 
    wireless-tools \
    libgl1-mesa-glx \
    libglib2.0-0 \
    build-essential

# Pip will handle adafruit-pureio automatically as a dependency
RUN pip3 install --no-cache-dir --break-system-packages \
    adafruit-circuitpython-servokit \
    adafruit-circuitpython-pca9685 \
    rpi-lgpio

WORKDIR /app

COPY server/package*.json ./
RUN npm install

COPY server/ .

# Ensure photos directory is ready
RUN mkdir -p /app/photos && chmod 777 /app/photos

CMD ["npm", "start"]