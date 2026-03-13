#!/usr/bin/env python3
"""Ensure Blinka JSON package data exists (for Docker installs that omit it)."""
import os
import sys
import urllib.request

BASE = "https://raw.githubusercontent.com/adafruit/Adafruit_Blinka/main/src"

# 1. board_imports.json next to board.py
for p in getattr(sys, "path", []):
    if p and os.path.isfile(os.path.join(p, "board.py")):
        target = os.path.join(p, "board_imports.json")
        if not os.path.isfile(target):
            urllib.request.urlretrieve(f"{BASE}/board_imports.json", target)
        break

# 2. microcontroller_imports.json next to digitalio.py (required by adafruit_bus_device chain)
for p in getattr(sys, "path", []):
    if p and os.path.isfile(os.path.join(p, "digitalio.py")):
        target = os.path.join(p, "microcontroller_imports.json")
        if not os.path.isfile(target):
            urllib.request.urlretrieve(f"{BASE}/microcontroller_imports.json", target)
        break
