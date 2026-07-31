# contrib/

Community-contributed tools that pair well with this plugin.

## button_listener.sh

A dependency-free (`dd`/`od`, bash 4+) button-combo-to-shell-command runner
for the Steam Deck's built-in controller. It reads the controller's raw
`hidraw` device directly, so — unlike keyboard-shortcut or `evdev`-based
approaches — it keeps working even while Steam Input has exclusively
grabbed the controller mid-game.

As of the **Recenter with a controller combo** toggle in the plugin's
sidebar, the plugin manages this script for you (starting/stopping it in
the background, auto-detecting your controller's `hidraw` device) — no
manual setup needed for the common case of binding a combo to recenter.

The instructions below are for running it manually/standalone instead
(e.g. binding a combo to something other than recenter, or using it
outside of the plugin).

Run without `--combo`/`--command` and it just prints currently-pressed
buttons and stick/trigger values, for figuring out which `hidraw` device is
your controller and confirming button names. See the script's own
`--help` and header comment for the full option list, permissions setup,
and a systemd unit example.

Example — recenter the XR display by holding L4+R4:

```
./button_listener.sh --combo l4+r4 --command '$HOME/.local/bin/xr_driver_cli --recenter'
```
