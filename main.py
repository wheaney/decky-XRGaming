import os
import subprocess

# The decky plugin module is located at decky-loader/plugin
# For easy intellisense checkout the decky-loader code one directory up
# or add the `decky-loader/plugin` path to `python.analysis.extraPaths` in `.vscode/settings.json`
import decky_plugin


CONFIG_FILE_PATH = os.path.join(decky_plugin.DECKY_USER_HOME, ".xreal_driver_config")


def parse_boolean(value, default):
    if not value:
        return default

    return value.lower() == 'true'


def parse_int(value, default):
    return int(value) if value.isdigit() else default


class Plugin:
    async def retrieve_config(self):
        config = {}
        with open(CONFIG_FILE_PATH, 'r') as f:
            for line in f:
                key, value = line.strip().split('=')
                if key in ['disabled', 'use_joystick']:
                    config[key] = parse_boolean(value, False)
                elif key == 'mouse_sensitivity':
                    config[key] = parse_int(value, 20)

        return config

    async def write_config(self, data):
        with open(CONFIG_FILE_PATH, 'w') as f:
            for key, value in data.items():
                if isinstance(value, bool):
                    f.write(f'{key}={str(value).lower()}\n')
                elif isinstance(value, int):
                    f.write(f'{key}={value}\n')
                elif isinstance(value, list):
                    f.write(f'{key}={",".join(value)}\n')
                else:
                    f.write(f'{key}={value}\n')

    async def is_driver_installed(self):
        # todo - in addition to checking systemd, store the plugin version in `install_driver` and match it against the current version
        try:
            output = subprocess.check_output(['systemctl', 'is-active', 'xreal-air-driver'], stderr=subprocess.STDOUT)
            return output.strip() == b'active'
        except subprocess.CalledProcessError:
            return False

    async def install_driver(self):
        decky_plugin.logger.info(f"Installing driver for plugin version {decky_plugin.DECKY_PLUGIN_VERSION}")

        # todo store the plugin version in the settings
        script_path = os.path.dirname(__file__) + "/bin/xreal_driver_setup"
        binary_path = os.path.dirname(__file__) + "/bin/xrealAirLinuxDriver.tar.gz"
        try:
            subprocess.check_output([script_path, binary_path], stderr=subprocess.STDOUT)
            return True
        except subprocess.CalledProcessError as exc:
            decky_plugin.logger.error("Error running setup script", exc)
            return False

    # Asyncio-compatible long-running code, executed in a task when the plugin is loaded
    async def _main(self):
        pass

    # Function called first during the unload process, utilize this to handle your plugin being removed
    async def _unload(self):
        pass

    # Migrations that should be performed before entering `_main()`.
    async def _migration(self):
        pass
