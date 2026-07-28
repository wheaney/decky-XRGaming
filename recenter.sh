#!/usr/bin/env bash
# Triggers a display recenter by writing directly to the XR driver's control-flags file.
#
# This is deliberately standalone: it's run by the plugin's "Recenter controller combo"
# toggle, but it doesn't depend on the plugin at all, so it also works if bound directly
# to any other key/button-binding tool (xbindkeys, sxhkd, a Steam Input keyboard shortcut,
# etc). Feel free to copy/adapt it for other control flags.
echo "recenter_screen=true" > /dev/shm/xr_driver_control
