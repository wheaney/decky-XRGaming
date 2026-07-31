#!/usr/bin/env bash
#
# Pure shell version of the Steam Deck raw HID reader, generalized into a
# button-combo-to-shell-command runner.
# Byte offsets / bit masks map 1:1 to bitsteam/deck.py's _parse_input()
#
# Reads directly from the controller's hidraw device, so (unlike Steam
# Input/keyboard-shortcut based approaches) it keeps working even when
# Steam Input has exclusively grabbed the controller mid-game.
#
# Usage:
#   ./button_listener.sh [/dev/hidrawN]
#       Debug/listen mode (default): prints currently-pressed buttons and
#       stick/trigger values, doesn't run anything.
#
#   ./button_listener.sh --device /dev/hidrawN --combo l1+r1 --command 'CMD'
#       Runs CMD (via `bash -c`) once whenever all buttons in --combo are
#       pressed simultaneously (edge-triggered, so holding won't repeat-fire
#       faster than --cooldown seconds).
#
# Example - recenter the XR driver's display by holding L4+R4:
#   ./button_listener.sh --combo l4+r4 --command '$HOME/.local/bin/xr_driver_cli --recenter'
#
# Valid --combo button names (joined with '+'):
#   a b x y l1 r1 l2 r2 l3 r3 l4 r4 dup ddown dleft dright select start steam quick
#   lstick rstick lstouch rstouch
#   lpadtouch lpadpress rpadtouch rpadpress
#
# Dependencies: dd, od (part of coreutils), bash 4+
# Permissions: requires a udev rule allowing non-root read access to the
#              hidraw device, otherwise run with sudo
#
# To run persistently, install a systemd unit, e.g. /etc/systemd/system/xr-recenter.service:
#
#   [Unit]
#   Description=Recenter XR display by holding L4+R4
#
#   [Service]
#   ExecStart=/path/to/button_listener.sh --combo l4+r4 --command '/home/deck/.local/bin/xr_driver_cli --recenter'
#   Restart=on-failure
#
#   [Install]
#   WantedBy=multi-user.target
#
# then: sudo systemctl enable --now xr-recenter

set -euo pipefail

DEV="/dev/hidraw2"
SIZE=64
COMBO=""
COMMAND=""
COOLDOWN=1
VERBOSE=0

declare -A BUTTON_VARS=(
    [a]=a_btn [b]=b_btn [x]=x_btn [y]=y_btn
    [l1]=l1 [r1]=r1 [l2]=l2 [r2]=r2
    [l3]=l3 [r3]=r3 [l4]=l4 [r4]=r4
    [dup]=dpad_up [ddown]=dpad_down [dleft]=dpad_left [dright]=dpad_right
    [select]=select_btn [start]=start_btn [steam]=steam_btn [quick]=quick_access
    [lstick]=l_stick_press [rstick]=r_stick_press
    [lstouch]=l_stick_touch [rstouch]=r_stick_touch
    [lpadtouch]=l_trackpad_touch [lpadpress]=l_trackpad_press
    [rpadtouch]=r_trackpad_touch [rpadpress]=r_trackpad_press
)

print_usage() {
    echo "Usage: $0 [/dev/hidrawN] [--device /dev/hidrawN] [--combo btn1+btn2+...] [--command 'shell command'] [--cooldown seconds] [--verbose]"
    echo
    echo "Valid --combo button names: ${!BUTTON_VARS[*]}"
}

# Accept the historical positional device arg alongside the new flags.
if [[ $# -gt 0 && "$1" != --* && "$1" != "-h" ]]; then
    DEV="$1"
    shift
fi

while [[ $# -gt 0 ]]; do
    case "$1" in
        --device)
            DEV="$2"; shift 2 ;;
        --combo)
            COMBO="$2"; shift 2 ;;
        --command)
            COMMAND="$2"; shift 2 ;;
        --cooldown)
            COOLDOWN="$2"; shift 2 ;;
        --verbose)
            VERBOSE=1; shift ;;
        -h|--help)
            print_usage; exit 0 ;;
        *)
            echo "Unknown argument: $1" >&2
            print_usage
            exit 1 ;;
    esac
done

COMBO_BUTTONS=()
if [[ -n "$COMBO" ]]; then
    IFS='+' read -ra COMBO_BUTTONS <<< "$COMBO"
    for name in "${COMBO_BUTTONS[@]}"; do
        if [[ -z "${BUTTON_VARS[$name]:-}" ]]; then
            echo "Unknown button name '$name' in --combo. Valid names: ${!BUTTON_VARS[*]}" >&2
            exit 1
        fi
    done
    if [[ -z "$COMMAND" ]]; then
        echo "--combo requires --command" >&2
        exit 1
    fi
fi

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

if [[ -n "$COMBO" ]]; then
    echo "Watching $DEV for combo '$COMBO' -> running: $COMMAND"
else
    echo "Reading from $DEV (Ctrl+C to quit)..."
fi

last_triggered=-9999
prev_combo_pressed=0

while true; do
    # Blocking read of one full 64-byte report, converted to a 128-char hex string.
    # -v disables od's default elision of repeated identical lines with '*', which
    # would otherwise shorten $hex (and cause the length check below to falsely
    # drop the frame) whenever 2+ consecutive 16-byte chunks are all zero, e.g.
    # centered sticks/triggers.
    hex=$(dd if="$DEV" bs=$SIZE count=1 status=none | od -An -tx1 -v | tr -d ' \n')

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
    l1=$(( (byte8  & 0x08) != 0 ))
    r1=$(( (byte8  & 0x04) != 0 ))
    l2=$(( (byte8 & 0x02) != 0 ))
    r2=$(( (byte8 & 0x01) != 0 ))

    dpad_up=$((    (byte9 & 0x01) != 0 ))
    dpad_right=$(( (byte9 & 0x02) != 0 ))
    dpad_left=$((  (byte9 & 0x04) != 0 ))
    dpad_down=$((  (byte9 & 0x08) != 0 ))
    select_btn=$(( (byte9 & 0x10) != 0 ))
    steam_btn=$((   (byte9 & 0x20) != 0 ))
    start_btn=$((   (byte9 & 0x40) != 0 ))
    l4=$(( (byte9 & 0x80) != 0 ))

    r4=$((    (byte10 & 0x01) != 0 ))
    l_trackpad_touch=$(( (byte10 & 0x08) != 0 ))
    r_trackpad_touch=$(( (byte10 & 0x10) != 0 ))
    l_stick_press=$((    (byte10 & 0x40) != 0 ))
    l_trackpad_press=$(( (byte10 & 0x0a) == 0x0a ))
    r_trackpad_press=$(( (byte10 & 0x14) == 0x14 ))

    r_stick_press=$(( (byte11 & 0x04) != 0 ))

    l3=$((  (byte13 & 0x02) != 0 ))
    r3=$((  (byte13 & 0x04) != 0 ))
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

    if [[ -n "$COMBO" ]]; then
        combo_pressed=1
        for name in "${COMBO_BUTTONS[@]}"; do
            varname="${BUTTON_VARS[$name]}"
            if (( ! ${!varname} )); then
                combo_pressed=0
                break
            fi
        done

        if (( combo_pressed )) && (( ! prev_combo_pressed )) && (( SECONDS - last_triggered >= COOLDOWN )); then
            last_triggered=$SECONDS
            (( VERBOSE )) && echo "combo '$COMBO' detected, running: $COMMAND"
            bash -c "$COMMAND" &
        fi
        prev_combo_pressed=$combo_pressed

        (( ! VERBOSE )) && continue
    fi

    # --- Output (only print buttons that are currently pressed, to reduce spam) ---
    pressed=""
    (( a_btn ))            && pressed+="A "
    (( b_btn ))            && pressed+="B "
    (( x_btn ))            && pressed+="X "
    (( y_btn ))            && pressed+="Y "
    (( l1 ))               && pressed+="L1 "
    (( r1 ))               && pressed+="R1 "
    (( l2 ))               && pressed+="L2 "
    (( r2 ))               && pressed+="R2 "
    (( dpad_up ))          && pressed+="DUp "
    (( dpad_down ))        && pressed+="DDown "
    (( dpad_left ))        && pressed+="DLeft "
    (( dpad_right ))       && pressed+="DRight "
    (( select_btn ))       && pressed+="Select "
    (( start_btn ))        && pressed+="Start "
    (( steam_btn ))        && pressed+="Steam "
    (( quick_access ))     && pressed+="QuickAccess "
    (( l3 ))               && pressed+="L3 "
    (( r3 ))               && pressed+="R3 "
    (( l4 ))               && pressed+="L4 "
    (( r4 ))               && pressed+="R4 "
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
