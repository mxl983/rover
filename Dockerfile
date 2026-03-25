FROM balenalib/raspberrypi3-node:18-bookworm-run

# System packages: Python, I2C, camera, TTS, Docker CLI for capture (stop/start mediamtx).
RUN install_packages \
    python3 \
    python3-pip \
    python3-dev \
    python3-smbus \
    i2c-tools \
    libcamera-apps-lite \
    espeak-ng \
    mpg123 \
    alsa-utils \
    uhubctl \
    wireless-tools \
    build-essential \
    docker.io

# Pip will handle adafruit-pureio automatically as a dependency.
# Install adafruit-blinka first so board_imports.json and Pi detection are present.
RUN pip3 install --no-cache-dir --break-system-packages \
    adafruit-blinka \
    adafruit-circuitpython-servokit \
    adafruit-circuitpython-pca9685 \
    rpi-lgpio

# Piper is not available as an apt package on some Raspberry Pi Debian mirrors.
# Try Python package install, but do not fail image build if unavailable.
RUN pip3 install --no-cache-dir --break-system-packages piper-tts || true

# High quality cloud TTS (Mandarin neural voices)
RUN pip3 install --no-cache-dir --break-system-packages edge-tts

# Ensure board_imports.json exists next to board.py (some installs omit package data)
COPY server/driver/ensure_board_imports.py /tmp/ensure_board_imports.py
RUN python3 /tmp/ensure_board_imports.py

WORKDIR /app

COPY server/package*.json ./
RUN npm install

COPY server/ .

# Ensure photos and telemetry data directories
RUN mkdir -p /app/photos /app/data && chmod 777 /app/photos /app/data

CMD ["npm", "start"]