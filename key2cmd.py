#!/usr/bin/env python3
"""Generic key/button event to bash command runner.

Watches all keyboard-capable evdev devices for a key chord and runs a shell
command whenever it's pressed. No dependencies beyond the Python 3 that ships
with SteamOS — events are decoded with struct rather than the evdev package.

Because it watches every keyboard-capable device — including the *virtual*
keyboard Steam Input creates when a controller button is mapped to a keyboard
shortcut — this works even while Steam Input has exclusively grabbed the
physical controller during gameplay (where tools reading the raw gamepad
device see nothing).

Example — recenter the XR driver's display with a controller button:

  1. In Steam's controller layout settings (per-game or global), map a
     controller button (e.g. a back grip button) to Ctrl+Alt+R.
  2. Run:
       sudo ./key2cmd.py --chord ctrl+alt+r \
           --command 'echo recenter_screen=true > /dev/shm/xr_driver_control'

Reading /dev/input requires root or membership in the `input` group
(`sudo usermod -aG input $USER`, then log out and back in).

To run persistently, install a systemd unit, e.g. /etc/systemd/system/xr-recenter.service:

  [Unit]
  Description=Recenter XR display on Ctrl+Alt+R

  [Service]
  ExecStart=/path/to/key2cmd.py --chord ctrl+alt+r --command 'echo recenter_screen=true > /dev/shm/xr_driver_control'
  Restart=on-failure

  [Install]
  WantedBy=multi-user.target

then: sudo systemctl enable --now xr-recenter
"""

import argparse
import os
import re
import select
import struct
import subprocess
import sys
import time

# struct input_event on 64-bit Linux: { long sec; long usec; u16 type; u16 code; s32 value }
EVENT_FORMAT = 'llHHi'
EVENT_SIZE = struct.calcsize(EVENT_FORMAT)

EV_KEY = 0x01
KEY_DOWN = 1
KEY_UP = 0

# Modifiers match either the left or right variant.
MODIFIER_CODES = {
    'ctrl': (29, 97),
    'shift': (42, 54),
    'alt': (56, 100),
    'meta': (125, 126),
}

# Non-modifier keys, from linux/input-event-codes.h.
KEY_CODES = {
    'esc': 1, 'tab': 15, 'enter': 28, 'space': 57, 'backspace': 14,
    'minus': 12, 'equal': 13, 'semicolon': 39, 'apostrophe': 40, 'grave': 41,
    'backslash': 43, 'comma': 51, 'dot': 52, 'slash': 53, 'capslock': 58,
    'home': 102, 'up': 103, 'pageup': 104, 'left': 105, 'right': 106,
    'end': 107, 'down': 108, 'pagedown': 109, 'insert': 110, 'delete': 111,
    '1': 2, '2': 3, '3': 4, '4': 5, '5': 6, '6': 7, '7': 8, '8': 9, '9': 10, '0': 11,
    'q': 16, 'w': 17, 'e': 18, 'r': 19, 't': 20, 'y': 21, 'u': 22, 'i': 23, 'o': 24, 'p': 25,
    'a': 30, 's': 31, 'd': 32, 'f': 33, 'g': 34, 'h': 35, 'j': 36, 'k': 37, 'l': 38,
    'z': 44, 'x': 45, 'c': 46, 'v': 47, 'b': 48, 'n': 49, 'm': 50,
    'f1': 59, 'f2': 60, 'f3': 61, 'f4': 62, 'f5': 63, 'f6': 64, 'f7': 65, 'f8': 66,
    'f9': 67, 'f10': 68, 'f11': 87, 'f12': 88,
}


def parse_chord(chord):
    """Parse e.g. 'ctrl+alt+r' into (modifier_names, trigger_key_code)."""
    parts = [part.strip().lower() for part in chord.split('+') if part.strip()]
    if not parts:
        raise ValueError("empty chord")

    modifiers = []
    trigger = None
    for part in parts:
        if part in MODIFIER_CODES:
            modifiers.append(part)
        elif part in KEY_CODES:
            if trigger is not None:
                raise ValueError(f"chord can only contain one non-modifier key, got both '{trigger}' and '{part}'")
            trigger = part
        else:
            raise ValueError(f"unknown key '{part}' (known: {', '.join(sorted(MODIFIER_CODES) + sorted(KEY_CODES))})")

    if trigger is None:
        raise ValueError("chord must end with a non-modifier key, e.g. ctrl+alt+r")

    return modifiers, KEY_CODES[trigger]


def list_keyboard_devices():
    """Parse /proc/bus/input/devices for evdev nodes that expose a keyboard handler.

    This also picks up virtual keyboards, such as the one Steam Input emits when a
    controller button has been mapped to a keyboard shortcut.
    """
    devices = {}
    try:
        with open('/proc/bus/input/devices', 'r') as f:
            content = f.read()
    except OSError:
        return devices

    for block in content.split('\n\n'):
        name_match = re.search(r'^N: Name="(.*)"$', block, re.MULTILINE)
        handlers_match = re.search(r'^H: Handlers=(.*)$', block, re.MULTILINE)
        if not name_match or not handlers_match:
            continue

        handlers = handlers_match.group(1).split()
        if not any(h.startswith('kbd') for h in handlers):
            continue

        event_handler = next((h for h in handlers if h.startswith('event')), None)
        if not event_handler:
            continue

        devices[f'/dev/input/{event_handler}'] = name_match.group(1)

    return devices


def watch(modifiers, trigger_code, command, cooldown, rescan_seconds, verbose):
    fds = {}  # fd -> path
    open_paths = {}  # path -> fd
    held = set()
    last_triggered = 0
    last_scanned = 0

    def log(message):
        if verbose:
            print(message, flush=True)

    try:
        while True:
            now = time.time()
            if now - last_scanned >= rescan_seconds:
                last_scanned = now
                devices = list_keyboard_devices()
                for path in list(open_paths):
                    if path not in devices:
                        log(f"device removed: {path}")
                        os.close(open_paths[path])
                        del fds[open_paths[path]]
                        del open_paths[path]
                for path, name in devices.items():
                    if path in open_paths:
                        continue
                    try:
                        fd = os.open(path, os.O_RDONLY | os.O_NONBLOCK)
                    except OSError as e:
                        log(f"cannot open {path} ({name}): {e}")
                        continue
                    log(f"watching {path} ({name})")
                    fds[fd] = path
                    open_paths[path] = fd

            if not fds:
                time.sleep(2)
                continue

            readable, _, _ = select.select(list(fds), [], [], min(rescan_seconds, 1))
            for fd in readable:
                try:
                    data = os.read(fd, EVENT_SIZE)
                except OSError:
                    path = fds.pop(fd)
                    del open_paths[path]
                    os.close(fd)
                    log(f"device read failed, dropped: {path}")
                    continue

                if len(data) != EVENT_SIZE:
                    continue

                _, _, ev_type, code, value = struct.unpack(EVENT_FORMAT, data)
                if ev_type != EV_KEY:
                    continue

                if value == KEY_UP:
                    held.discard(code)
                elif value == KEY_DOWN:
                    held.add(code)
                    if code != trigger_code:
                        continue
                    if not all(any(c in held for c in MODIFIER_CODES[m]) for m in modifiers):
                        continue
                    if time.time() - last_triggered < cooldown:
                        continue
                    last_triggered = time.time()
                    log(f"chord detected, running: {command}")
                    subprocess.Popen(command, shell=True)
    finally:
        for fd in fds:
            try:
                os.close(fd)
            except OSError:
                pass


def main():
    parser = argparse.ArgumentParser(
        description="Run a shell command whenever a key chord is pressed on any keyboard-capable evdev device.",
        epilog="Example: %(prog)s --chord ctrl+alt+r --command 'echo recenter_screen=true > /dev/shm/xr_driver_control'",
    )
    parser.add_argument('--chord', required=True,
                        help="key chord to watch for, e.g. ctrl+alt+r (modifiers: ctrl, shift, alt, meta)")
    parser.add_argument('--command', required=True,
                        help="shell command to run when the chord is pressed")
    parser.add_argument('--cooldown', type=float, default=1.0,
                        help="minimum seconds between runs (default: 1)")
    parser.add_argument('--rescan-seconds', type=float, default=5.0,
                        help="how often to re-scan for added/removed input devices (default: 5)")
    parser.add_argument('--verbose', action='store_true',
                        help="log watched devices and triggers to stdout")
    args = parser.parse_args()

    try:
        modifiers, trigger_code = parse_chord(args.chord)
    except ValueError as e:
        parser.error(str(e))

    watch(modifiers, trigger_code, args.command, args.cooldown, args.rescan_seconds, args.verbose)


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
