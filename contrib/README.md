# contrib/

Optional, community-contributed tools that pair well with this plugin but
aren't part of it: nothing here is imported by `main.py` or the frontend,
and the plugin doesn't install, run, or depend on any of it. Use at your
own risk; these aren't covered by the plugin's own install/uninstall flow.

## button_listener.sh

A dependency-free (`dd`/`od`, bash 4+) button-combo-to-shell-command runner
for the Steam Deck's built-in controller. It reads the controller's raw
`hidraw` device directly, so — unlike keyboard-shortcut or `evdev`-based
approaches — it keeps working even while Steam Input has exclusively
grabbed the controller mid-game.

Run without `--combo`/`--command` and it just prints currently-pressed
buttons and stick/trigger values, for figuring out which `hidraw` device is
your controller and confirming button names. See the script's own
`--help` and header comment for the full option list, permissions setup,
and a systemd unit example.

Example — recenter the XR display by holding L4+R4:

```
./button_listener.sh --combo l4+r4 --command '$HOME/.local/bin/xr_driver_cli --recenter'
```
