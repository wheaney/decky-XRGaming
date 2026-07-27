import os
import re
import select
import struct
import time

# struct input_event on 64-bit Linux: { long sec; long usec; u16 type; u16 code; s32 value }
EVENT_FORMAT = 'llHHi'
EVENT_SIZE = struct.calcsize(EVENT_FORMAT)

EV_KEY = 0x01

BUTTON_LABELS = {
    0x130: "A", 0x131: "B", 0x132: "C", 0x133: "X", 0x134: "Y", 0x135: "Z",
    0x136: "L1", 0x137: "R1", 0x138: "L2", 0x139: "R2",
    0x13a: "Select", 0x13b: "Start", 0x13c: "Mode",
    0x13d: "Left Stick", 0x13e: "Right Stick",
    0x220: "D-Pad Up", 0x221: "D-Pad Down", 0x222: "D-Pad Left", 0x223: "D-Pad Right",
}
for _i in range(1, 41):
    BUTTON_LABELS[0x2c0 + _i - 1] = f"Extra Button {_i}"


def button_label(code):
    return BUTTON_LABELS.get(code, f"Button {code}")


def list_gamepad_devices():
    """Parse /proc/bus/input/devices for evdev nodes that expose a joystick handler."""
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
        if not any(h.startswith('js') for h in handlers):
            continue

        event_handler = next((h for h in handlers if h.startswith('event')), None)
        if not event_handler:
            continue

        devices.append({
            'name': name_match.group(1),
            'path': f'/dev/input/{event_handler}'
        })

    return devices


def read_next_button_press(devices, timeout_seconds=None, stop_event=None, match_code=None):
    """
    Opens the given devices (as returned by list_gamepad_devices) read-only and waits for
    a button-down event. If match_code is given, only that button code will resolve the wait;
    otherwise the first button pressed on any of the devices resolves it.

    Returns {'device_name', 'code'} or None if the timeout elapses or stop_event is set.
    """
    fds = {}
    try:
        for device in devices:
            try:
                fd = os.open(device['path'], os.O_RDONLY | os.O_NONBLOCK)
                fds[fd] = device
            except OSError:
                continue

        if not fds:
            if stop_event is not None:
                stop_event.wait(min(timeout_seconds, 2) if timeout_seconds else 2)
            return None

        deadline = time.time() + timeout_seconds if timeout_seconds else None
        while True:
            if stop_event is not None and stop_event.is_set():
                return None
            if deadline is not None and time.time() >= deadline:
                return None

            wait_time = 0.5 if deadline is None else max(0, min(0.5, deadline - time.time()))
            readable, _, _ = select.select(list(fds.keys()), [], [], wait_time)
            for fd in readable:
                try:
                    data = os.read(fd, EVENT_SIZE)
                except OSError:
                    continue

                if len(data) != EVENT_SIZE:
                    continue

                _, _, ev_type, code, value = struct.unpack(EVENT_FORMAT, data)
                if ev_type == EV_KEY and value == 1 and (match_code is None or code == match_code):
                    return {'device_name': fds[fd]['name'], 'code': code}
    finally:
        for fd in fds:
            try:
                os.close(fd)
            except OSError:
                pass
