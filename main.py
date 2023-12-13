import os
import stat
import subprocess
import time

# The decky plugin module is located at decky-loader/plugin
# For easy intellisense checkout the decky-loader code one directory up
# or add the `decky-loader/plugin` path to `python.analysis.extraPaths` in `.vscode/settings.json`
import decky_plugin
from settings import SettingsManager


CONFIG_FILE_PATH = os.path.join(decky_plugin.DECKY_USER_HOME, ".xreal_driver_config")

# write-only file that the driver reads (but never writes) to get user-specified control flags
CONTROL_FLAGS_FILE_PATH = '/dev/shm/xr_driver_control'

# read-only file that the driver writes (but never reads) to with its current state
DRIVER_STATE_FILE_PATH = '/dev/shm/xr_driver_state'

INSTALLED_VERSION_SETTING_KEY = "installed_from_plugin_version"
CONTROL_FLAGS = ['recenter_screen', 'recalibrate', 'sbs_mode']
SBS_MODE_VALUES = ['unset', 'enable', 'disable']

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
                        decky_plugin.logger.error(f"Error parsing key-value pair {key}={value}: {e}")
        except FileNotFoundError:
            pass

        return config

    async def write_config(self, config):
        try:
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
            os.chmod(CONFIG_FILE_PATH, stat.S_IRUSR | stat.S_IWUSR | stat.S_IRGRP | stat.S_IWGRP | stat.S_IROTH | stat.S_IWOTH)
        except Exception as e:
            decky_plugin.logger.error(f"Error writing config {e}")

    async def write_control_flags(self, control_flags):
        try:
            output = ""
            for key, value in control_flags.items():
                if isinstance(value, bool) and key in CONTROL_FLAGS:
                    if key == 'sbs_mode':
                        if value not in SBS_MODE_VALUES:
                            decky_plugin.logger.error(f"Invalid value {value} for sbs_mode flag")
                            continue
                    output += f'{key}={str(value).lower()}\n'

            with open(CONTROL_FLAGS_FILE_PATH, 'w') as f:
                f.write(output)
        except Exception as e:
            decky_plugin.logger.error(f"Error writing control flags {e}")

    async def retrieve_driver_state(self):
        state = {}
        state['heartbeat'] = 0
        state['connected_device_name'] = None
        state['calibration_setup'] = "AUTOMATIC"
        state['calibration_state'] = "NOT_CALIBRATED"
        state['sbs_mode_enabled'] = False
        state['sbs_mode_supported'] = False

        try:
            with open(DRIVER_STATE_FILE_PATH, 'r') as f:
                output = f.read()
                for line in output.splitlines():
                    try:
                        key, value = line.strip().split('=')
                        if key == 'heartbeat':
                            state[key] = parse_int(value, 0)
                        elif key in ['calibration_setup', 'calibration_state', 'connected_device_name']:
                            state[key] = value
                        elif key in ['sbs_mode_enabled', 'sbs_mode_supported']:
                            state[key] = parse_boolean(value, False)
                        else:
                            decky_plugin.logger.error(f"Unknown key {key} in driver state file")
                    except Exception as e:
                        decky_plugin.logger.error(f"Error parsing key-value pair {key}={value}: {e}")
        except FileNotFoundError:
            pass

        # state is stale, ignore it
        if state['heartbeat'] == 0 or (time.time() - state['heartbeat']) > 5:
            return {}

        return state

    async def is_driver_running(self):
        try:
            output = subprocess.check_output(['systemctl', 'is-active', 'xreal-air-driver'], stderr=subprocess.STDOUT)
            return output.strip() == b'active'
        except subprocess.CalledProcessError as exc:
            decky_plugin.logger.error(f"Error checking driver status {exc}")
            return False

    async def is_driver_installed(self):
        try:
            if not await self.is_driver_running(self):
                return False

            installed_from_plugin_version = settings.getSetting(INSTALLED_VERSION_SETTING_KEY)
            return installed_from_plugin_version == decky_plugin.DECKY_PLUGIN_VERSION
        except subprocess.CalledProcessError as exc:
            decky_plugin.logger.error(f"Error checking driver installation {exc}")
            return False

    async def install_driver(self):
        decky_plugin.logger.info(f"Installing breezy for plugin version {decky_plugin.DECKY_PLUGIN_VERSION}")

        # Set the USER environment variable for this command
        env_copy = os.environ.copy()
        env_copy["USER"] = decky_plugin.DECKY_USER

        setup_script_path = os.path.dirname(__file__) + "/bin/breezy_vulkan_setup"
        binary_path = os.path.dirname(__file__) + "/bin/breezyVulkan.tar.gz"
        attempt = 0
        try:
            while attempt < 3:
                subprocess.check_output([setup_script_path, binary_path], stderr=subprocess.STDOUT, env=env_copy)
                if await self.is_driver_running(self):
                    settings.setSetting(INSTALLED_VERSION_SETTING_KEY, decky_plugin.DECKY_PLUGIN_VERSION)
                    return True

                attempt += 1
                time.sleep(1)

            return False
        except subprocess.CalledProcessError as exc:
            decky_plugin.logger.error(f"Error running setup script {exc}")
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

    async def _uninstall(self):
        decky_plugin.logger.info(f"Uninstalling breezy for plugin version {decky_plugin.DECKY_PLUGIN_VERSION}")

        # Set the USER environment variable for this command
        env_copy = os.environ.copy()
        env_copy["USER"] = decky_plugin.DECKY_USER

        try:
            subprocess.check_output([decky_plugin.DECKY_USER_HOME + "/bin/breezy_vulkan_uninstall"], stderr=subprocess.STDOUT, env=env_copy)
            subprocess.check_output([decky_plugin.DECKY_USER_HOME + "/bin/xreal_driver_uninstall"], stderr=subprocess.STDOUT, env=env_copy)
            settings.setSetting(INSTALLED_VERSION_SETTING_KEY, None)
            return True
        except subprocess.CalledProcessError as exc:
            decky_plugin.logger.error(f"Error running uninstall script {exc}")
            return False
