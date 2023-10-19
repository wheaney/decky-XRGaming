import os
import subprocess

# The decky plugin module is located at decky-loader/plugin
# For easy intellisense checkout the decky-loader code one directory up
# or add the `decky-loader/plugin` path to `python.analysis.extraPaths` in `.vscode/settings.json`
import decky_plugin
from settings import SettingsManager


CONFIG_FILE_PATH = os.path.join(decky_plugin.DECKY_USER_HOME, ".xreal_driver_config")
INSTALLED_VERSION_SETTING_KEY = "installed_from_plugin_version"

settings = SettingsManager(name="settings", settings_directory=decky_plugin.DECKY_PLUGIN_SETTINGS_DIR)
settings.read()


def parse_boolean(value, default):
    if not value:
        return default

    return value.lower() == 'true'


def parse_int(value, default):
    return int(value) if value.isdigit() else default

def parse_float(value, default):
    try:
        return float(value)
    except ValueError:
        return default



class Plugin:
    async def retrieve_config(self):

        config = {}
        config['disabled'] = False
        config['output_mode'] = 'mouse'
        config['mouse_sensitivity'] = 20
        config['external_zoom'] = 1
        config['look_ahead'] = 0

        try:
            with open(CONFIG_FILE_PATH, 'r') as f:
                for line in f:
                    try:
                        key, value = line.strip().split('=')
                        if key in ['disabled']:
                            config[key] = parse_boolean(value, config[key])
                        elif key in ['mouse_sensitivity', 'look_ahead']:
                            config[key] = parse_int(value, config[key])
                        elif key in ['external_zoom']:
                            config[key] = parse_float(value, config[key])
                        else:
                            config[key] = value
                    except Exception as e:
                        print(f"Error parsing key-value pair {key}={value}: {e}")
        except FileNotFoundError:
            pass

        return config

    async def write_config(self, config):
        output = ""
        for key, value in config.items():
            if key != "updated":
                if isinstance(value, bool):
                    output += f'{key}={str(value).lower()}\n'
                elif isinstance(value, int):
                    output += f'{key}={value}\n'
                elif isinstance(value, list):
                    output += f'{key}={",".join(value)}\n'
                else:
                    output += f'{key}={value}\n'

        temp_file = "temp.txt"

        # Write to a temporary file
        with open(temp_file, 'w') as f:
            f.write(output)

        # Atomically replace the old config file with the new one
        os.replace(temp_file, CONFIG_FILE_PATH)

    async def is_driver_installed(self):
        try:
            output = subprocess.check_output(['systemctl', 'is-active', 'xreal-air-driver'], stderr=subprocess.STDOUT)
            if output.strip() != b'active':
                return False

            installed_from_plugin_version = settings.getSetting(INSTALLED_VERSION_SETTING_KEY)
            return installed_from_plugin_version == decky_plugin.DECKY_PLUGIN_VERSION
        except subprocess.CalledProcessError:
            return False

    async def install_driver(self):
        decky_plugin.logger.info(f"Installing driver for plugin version {decky_plugin.DECKY_PLUGIN_VERSION}")

        # Set the USER environment variable for this command
        env_copy = os.environ.copy()
        env_copy["USER"] = decky_plugin.DECKY_USER

        setup_script_path = os.path.dirname(__file__) + "/bin/breezy_vulkan_setup"
        binary_path = os.path.dirname(__file__) + "/bin/breezyVulkan.tar.gz"
        try:
            subprocess.check_output([setup_script_path, binary_path], stderr=subprocess.STDOUT, env=env_copy)
            settings.setSetting(INSTALLED_VERSION_SETTING_KEY, decky_plugin.DECKY_PLUGIN_VERSION)
            return True
        except subprocess.CalledProcessError as exc:
            decky_plugin.logger.error("Error running setup script", exc)
            return False

    # Asyncio-compatible long-running code, executed in a task when the plugin is loaded
    async def _main(self):
        if not await self.is_driver_installed(self):
            await self.install_driver(self)

    # Function called first during the unload process, utilize this to handle your plugin being removed
    async def _unload(self):
        pass

    # Migrations that should be performed before entering `_main()`.
    async def _migration(self):
        pass
