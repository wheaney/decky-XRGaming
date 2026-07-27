import os
import re
import select
import struct

# struct input_event on 64-bit Linux: { long sec; long usec; u16 type; u16 code; s32 value }
EVENT_FORMAT = 'llHHi'
EVENT_SIZE = struct.calcsize(EVENT_FORMAT)

EV_KEY = 0x01

KEY_LEFTCTRL = 29
KEY_RIGHTCTRL = 97
KEY_LEFTALT = 56
KEY_RIGHTALT = 100
KEY_R = 19


def list_keyboard_devices():
    """Parse /proc/bus/input/devices for evdev nodes that expose a keyboard handler.

    This also picks up virtual keyboards, such as the one Steam Input emits when a
    controller button has been mapped to a keyboard shortcut.
    """
    devices = []
    try:
        with open('/proc/bus/input/devices', 'r') as f:
            content = f.read()
    except OSError:
        return devices

    for block in content.split('\n\n'):
        if not block.strip():
            continue

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

        devices.append({
            'name': name_match.group(1),
            'path': f'/dev/input/{event_handler}'
        })

    return devices


def wait_for_recenter_hotkey(stop_event, poll_seconds=0.5):
    """
    Blocks (via select, on non-blocking reads) watching all keyboard-capable evdev devices
    for the Ctrl+Alt+R chord. Re-discovers devices on each call so reconnects are picked up.

    Returns True once the chord is detected, or False if stop_event is set or no keyboard
    devices are currently available (caller should retry).
    """
    devices = list_keyboard_devices()
    fds = {}
    held = set()
    try:
        for device in devices:
            try:
                fd = os.open(device['path'], os.O_RDONLY | os.O_NONBLOCK)
                fds[fd] = device
            except OSError:
                continue

        if not fds:
            stop_event.wait(2)
            return False

        while not stop_event.is_set():
            readable, _, _ = select.select(list(fds.keys()), [], [], poll_seconds)
            for fd in readable:
                try:
                    data = os.read(fd, EVENT_SIZE)
                except OSError:
                    continue

                if len(data) != EVENT_SIZE:
                    continue

                _, _, ev_type, code, value = struct.unpack(EVENT_FORMAT, data)
                if ev_type != EV_KEY:
                    continue

                if value == 0:
                    held.discard(code)
                elif value == 1:
                    held.add(code)
                    ctrl_down = KEY_LEFTCTRL in held or KEY_RIGHTCTRL in held
                    alt_down = KEY_LEFTALT in held or KEY_RIGHTALT in held
                    if code == KEY_R and ctrl_down and alt_down:
                        return True

        return False
    finally:
        for fd in fds:
            try:
                os.close(fd)
            except OSError:
                pass
