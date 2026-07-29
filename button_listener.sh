#!/usr/bin/env bash
#
# Pure shell version of the Steam Deck raw HID reader.
# Byte offsets / bit masks map 1:1 to bitsteam/deck.py's _parse_input()
#
# Usage: ./steamdeck_read.sh [/dev/hidrawN]
#
# Dependencies: dd, od (part of coreutils), bash 4+
# Permissions: requires a udev rule allowing non-root read access to the
#              hidraw device, otherwise run with sudo

set -euo pipefail

DEV="${1:-/dev/hidraw2}"
SIZE=64

if [[ ! -r "$DEV" ]]; then
    echo "Cannot read $DEV, check the device path or permissions (udev rule / sudo)" >&2
    exit 1
fi

# Read a single byte at offset 'off', return as decimal
get_byte() {
    local hex="$1" off="$2"
    echo $(( 16#${hex:$((off*2)):2} ))
}

# Read a little-endian signed int16 at offset 'off', return as decimal
get_i16() {
    local hex="$1" off="$2"
    local lo="${hex:$((off*2)):2}" hi="${hex:$((off*2+2)):2}"
    local raw=$(( (16#$hi << 8) | 16#$lo ))
    (( raw >= 32768 )) && raw=$(( raw - 65536 ))
    echo "$raw"
}

# Read a little-endian unsigned int16 at offset 'off', return as decimal
get_u16() {
    local hex="$1" off="$2"
    local lo="${hex:$((off*2)):2}" hi="${hex:$((off*2+2)):2}"
    echo $(( (16#$hi << 8) | 16#$lo ))
}

echo "Reading from $DEV (Ctrl+C to quit)..."

while true; do
    # Blocking read of one full 64-byte report, converted to a 128-char hex string
    hex=$(dd if="$DEV" bs=$SIZE count=1 status=none | od -An -tx1 | tr -d ' \n')

    # Skip this frame if fewer than 64 bytes were read (e.g. device just opened)
    (( ${#hex} < SIZE*2 )) && continue

    byte8=$(get_byte  "$hex" 8)
    byte9=$(get_byte  "$hex" 9)
    byte10=$(get_byte "$hex" 10)
    byte11=$(get_byte "$hex" 11)
    byte13=$(get_byte "$hex" 13)
    byte14=$(get_byte "$hex" 14)

    # --- Buttons (masks match deck.py exactly) ---
    a_btn=$((  (byte8  & 0x80) != 0 ))
    b_btn=$((  (byte8  & 0x20) != 0 ))
    x_btn=$((  (byte8  & 0x40) != 0 ))
    y_btn=$((  (byte8  & 0x10) != 0 ))
    l1_btn=$(( (byte8  & 0x08) != 0 ))
    r1_btn=$(( (byte8  & 0x04) != 0 ))
    l2_click=$(( (byte8 & 0x02) != 0 ))
    r2_click=$(( (byte8 & 0x01) != 0 ))

    dpad_up=$((    (byte9 & 0x01) != 0 ))
    dpad_right=$(( (byte9 & 0x02) != 0 ))
    dpad_left=$((  (byte9 & 0x04) != 0 ))
    dpad_down=$((  (byte9 & 0x08) != 0 ))
    select_btn=$(( (byte9 & 0x10) != 0 ))
    steam_btn=$((   (byte9 & 0x20) != 0 ))
    start_btn=$((   (byte9 & 0x40) != 0 ))
    l_lower_grip=$(( (byte9 & 0x80) != 0 ))

    r_lower_grip=$((    (byte10 & 0x01) != 0 ))
    l_trackpad_touch=$(( (byte10 & 0x08) != 0 ))
    r_trackpad_touch=$(( (byte10 & 0x10) != 0 ))
    l_stick_press=$((    (byte10 & 0x40) != 0 ))
    l_trackpad_press=$(( (byte10 & 0x0a) == 0x0a ))
    r_trackpad_press=$(( (byte10 & 0x14) == 0x14 ))

    r_stick_press=$(( (byte11 & 0x04) != 0 ))

    l_upper_grip=$((  (byte13 & 0x02) != 0 ))
    r_upper_grip=$((  (byte13 & 0x04) != 0 ))
    l_stick_touch=$(( (byte13 & 0x40) != 0 ))
    r_stick_touch=$(( (byte13 & 0x80) != 0 ))

    quick_access=$(( (byte14 & 0x04) != 0 ))

    # --- Sticks / triggers / trackpads (offsets match deck.py) ---
    left_stick_x=$(get_i16 "$hex" 48)
    left_stick_y=$(get_i16 "$hex" 50)
    right_stick_x=$(get_i16 "$hex" 52)
    right_stick_y=$(get_i16 "$hex" 54)

    left_trigger=$(get_u16 "$hex" 44)
    right_trigger=$(get_u16 "$hex" 46)

    left_track_x=$(get_i16 "$hex" 16)
    left_track_y=$(get_i16 "$hex" 18)
    right_track_x=$(get_i16 "$hex" 20)
    right_track_y=$(get_i16 "$hex" 22)
    left_track_pressure=$(get_u16 "$hex" 56)
    right_track_pressure=$(get_u16 "$hex" 58)

    # --- Output (only print buttons that are currently pressed, to reduce spam) ---
    pressed=""
    (( a_btn ))            && pressed+="A "
    (( b_btn ))            && pressed+="B "
    (( x_btn ))            && pressed+="X "
    (( y_btn ))            && pressed+="Y "
    (( l1_btn ))           && pressed+="L1 "
    (( r1_btn ))           && pressed+="R1 "
    (( l2_click ))         && pressed+="L2click "
    (( r2_click ))         && pressed+="R2click "
    (( dpad_up ))          && pressed+="DUp "
    (( dpad_down ))        && pressed+="DDown "
    (( dpad_left ))        && pressed+="DLeft "
    (( dpad_right ))       && pressed+="DRight "
    (( select_btn ))       && pressed+="Select "
    (( start_btn ))        && pressed+="Start "
    (( steam_btn ))        && pressed+="Steam "
    (( quick_access ))     && pressed+="QuickAccess "
    (( l_lower_grip ))     && pressed+="L_LowerGrip "
    (( r_lower_grip ))     && pressed+="R_LowerGrip "
    (( l_upper_grip ))     && pressed+="L_UpperGrip "
    (( r_upper_grip ))     && pressed+="R_UpperGrip "
    (( l_stick_press ))    && pressed+="LStickPress "
    (( r_stick_press ))    && pressed+="RStickPress "
    (( l_stick_touch ))    && pressed+="LStickTouch "
    (( r_stick_touch ))    && pressed+="RStickTouch "
    (( l_trackpad_touch )) && pressed+="LPadTouch "
    (( l_trackpad_press )) && pressed+="LPadPress "
    (( r_trackpad_touch )) && pressed+="RPadTouch "
    (( r_trackpad_press )) && pressed+="RPadPress "

    printf "\rPressed: %-90s LX:%6d LY:%6d RX:%6d RY:%6d LT:%5d RT:%5d" \
        "$pressed" "$left_stick_x" "$left_stick_y" "$right_stick_x" "$right_stick_y" \
        "$left_trigger" "$right_trigger"
done
