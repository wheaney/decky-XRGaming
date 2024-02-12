import json
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
DONT_SHOW_AGAIN_SETTING_KEY = "dont_show_again"
MANIFEST_CHECKSUM_KEY = "manifest_checksum"
CONTROL_FLAGS = ['recenter_screen', 'recalibrate', 'sbs_mode', 'refresh_device_license']
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
        config['disabled'] = True
        config['output_mode'] = 'mouse'
        config['external_mode'] = 'none'
        config['mouse_sensitivity'] = 20
        config['display_zoom'] = 1.0
        config['look_ahead'] = 0
        config['sbs_display_size'] = 1.0
        config['sbs_display_distance'] = 1.0
        config['sbs_content'] = False
        config['sbs_mode_stretched'] = False
        config['sideview_position'] = 'center'
        config['sideview_display_size'] = 1.0
        config['virtual_display_smooth_follow_enabled'] = False
        config['sideview_smooth_follow_enabled'] = False

        try:
            with open(CONFIG_FILE_PATH, 'r') as f:
                for line in f:
                    try:
                        if not line.strip():
                            continue

                        key, value = line.strip().split('=')
                        if key in ['disabled', 'sbs_mode_stretched', 'sbs_content',
                                   'virtual_display_smooth_follow_enabled', 'sideview_smooth_follow_enabled']:
                            config[key] = parse_boolean(value, config[key])
                        elif key in ['mouse_sensitivity', 'look_ahead']:
                            config[key] = parse_int(value, config[key])
                        elif key in ['external_zoom', 'display_zoom', 'sbs_display_distance', 'sbs_display_size', 'sideview_display_size']:
                            if key in ['external_zoom', 'display_zoom']:
                                key = 'display_zoom'
                            config[key] = parse_float(value, config[key])
                        else:
                            config[key] = value
                    except Exception as e:
                        decky_plugin.logger.error(f"Error parsing line {line}: {e}")
        except FileNotFoundError as e:
            decky_plugin.logger.error(f"Config file not found {e}")
            return config

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
                if key in CONTROL_FLAGS:
                    if key == 'sbs_mode':
                        if value not in SBS_MODE_VALUES:
                            decky_plugin.logger.error(f"Invalid value {value} for sbs_mode flag")
                            continue
                    elif not isinstance(value, bool):
                        decky_plugin.logger.error(f"Invalid value {value} for {key} flag")
                        continue
                    output += f'{key}={str(value).lower()}\n'

            with open(CONTROL_FLAGS_FILE_PATH, 'w') as f:
                f.write(output)
        except Exception as e:
            decky_plugin.logger.error(f"Error writing control flags {e}")

    async def retrieve_driver_state(self):
        state = {}
        state['heartbeat'] = 0
        state['connected_device_brand'] = None
        state['connected_device_model'] = None
        state['calibration_setup'] = "AUTOMATIC"
        state['calibration_state'] = "NOT_CALIBRATED"
        state['sbs_mode_enabled'] = False
        state['sbs_mode_supported'] = False
        state['firmware_update_recommended'] = False
        state['device_license'] = {}

        try:
            with open(DRIVER_STATE_FILE_PATH, 'r') as f:
                output = f.read()
                for line in output.splitlines():
                    try:
                        if not line.strip():
                            continue

                        key, value = line.strip().split('=')
                        if key == 'heartbeat':
                            state[key] = parse_int(value, 0)
                        elif key in ['calibration_setup', 'calibration_state', 'connected_device_brand', 'connected_device_model']:
                            state[key] = value
                        elif key in ['sbs_mode_enabled', 'sbs_mode_supported', 'firmware_update_recommended']:
                            state[key] = parse_boolean(value, False)
                        elif key == 'device_license':
                            state[key] = json.loads(value)
                    except Exception as e:
                        decky_plugin.logger.error(f"Error parsing key-value pair {key}={value}: {e}")
        except FileNotFoundError:
            pass

        # state is stale, just send the license
        if state['heartbeat'] == 0 or (time.time() - state['heartbeat']) > 5:
            return {
                'device_license': state['device_license']
            }

        return state

    async def retrieve_dont_show_again_keys(self):
        return [key for key in settings.getSetting(DONT_SHOW_AGAIN_SETTING_KEY, "").split(",") if key]

    async def set_dont_show_again(self, key):
        try:
            dont_show_again_keys = await self.retrieve_dont_show_again_keys(self)
            dont_show_again_keys.append(key)
            settings.setSetting(DONT_SHOW_AGAIN_SETTING_KEY, ",".join(dont_show_again_keys))
            return True
        except Exception as e:
            decky_plugin.logger.error(f"Error setting dont_show_again {e}")
            return False

    async def reset_dont_show_again(self):
        try:
            settings.setSetting(DONT_SHOW_AGAIN_SETTING_KEY, "")
            return True
        except Exception as e:
            decky_plugin.logger.error(f"Error resetting dont_show_again {e}")
            return False

    async def is_breezy_installed_and_running(self):
        waitSecs = 0
        while self.breezy_installing and waitSecs < 3:
            time.sleep(1)
            waitSecs += 1

        return self.breezy_installed and await self.is_driver_running(self)

    async def is_driver_running(self):
        try:
            output = subprocess.check_output(['systemctl', 'is-active', 'xreal-air-driver'], stderr=subprocess.STDOUT)
            return output.strip() == b'active'
        except subprocess.CalledProcessError as exc:
            if exc.output.strip() != b'inactive':
                decky_plugin.logger.error(f"Error checking driver status {exc.output}")
            return False

    async def is_breezy_installed(self):
        try:
            if not await self.is_driver_running(self):
                return False

            installed_from_plugin_version = settings.getSetting(INSTALLED_VERSION_SETTING_KEY)
            if not installed_from_plugin_version == decky_plugin.DECKY_PLUGIN_VERSION:
                return False

            if (await self.get_breezy_manifest_checksum(self)) != settings.getSetting(MANIFEST_CHECKSUM_KEY):
                return False

            output = subprocess.check_output([decky_plugin.DECKY_USER_HOME + "/.local/bin/breezy_vulkan/verify_installation"], stderr=subprocess.STDOUT)
            return output.strip() == b"Verification succeeded"
        except subprocess.CalledProcessError as exc:
            decky_plugin.logger.error(f"Error checking driver installation {exc.output}")
            return False

    async def get_breezy_manifest_checksum(self):
        try:
            output = subprocess.check_output(["sha256sum", decky_plugin.DECKY_USER_HOME + "/.local/bin/breezy_vulkan/manifest"], stderr=subprocess.STDOUT)

            # convert to a non-byte string, then split on spaces
            return output.strip().decode("utf-8").split(" ")[0]
        except subprocess.CalledProcessError as exc:
            decky_plugin.logger.error(f"Error getting breezy manifest checksum {exc.output}")
            return None

    async def install_breezy(self):
        decky_plugin.logger.info(f"Installing breezy for plugin version {decky_plugin.DECKY_PLUGIN_VERSION}")

        # Set the USER environment variable for this command
        env_copy = os.environ.copy()
        env_copy["USER"] = decky_plugin.DECKY_USER

        setup_script_path = os.path.dirname(__file__) + "/bin/breezy_vulkan_setup"
        binary_path = os.path.dirname(__file__) + "/bin/breezyVulkan.tar.gz"
        attempt = 0
        while attempt < 3:
            try:
                subprocess.check_output([
                    setup_script_path,
                    "-v",
                    decky_plugin.DECKY_PLUGIN_VERSION.replace("-", "_"),
                    binary_path
                ], stderr=subprocess.STDOUT, env=env_copy)
                if await self.is_driver_running(self):
                    settings.setSetting(INSTALLED_VERSION_SETTING_KEY, decky_plugin.DECKY_PLUGIN_VERSION)
                    settings.setSetting(MANIFEST_CHECKSUM_KEY, await self.get_breezy_manifest_checksum(self))
                    return True
            except subprocess.CalledProcessError as exc:
                decky_plugin.logger.error(f"Error running setup script: {exc.output}")

            attempt += 1
            time.sleep(1)

        return False

    async def request_token(self, email):
        decky_plugin.logger.info(f"Requesting a new token for {email}")

        # Set the USER environment variable for this command
        env_copy = os.environ.copy()
        env_copy["USER"] = decky_plugin.DECKY_USER

        try:
            output = subprocess.check_output([decky_plugin.DECKY_USER_HOME + "/bin/xreal_driver_config", "--request-token", email], stderr=subprocess.STDOUT, env=env_copy)
            return output.strip() == b"Token request sent"
        except subprocess.CalledProcessError as exc:
            decky_plugin.logger.error(f"Error running config script {exc.output}")
            return False

    async def verify_token(self, token):
        decky_plugin.logger.info(f"Verifying token {token}")

        # Set the USER environment variable for this command
        env_copy = os.environ.copy()
        env_copy["USER"] = decky_plugin.DECKY_USER

        try:
            output = subprocess.check_output([decky_plugin.DECKY_USER_HOME + "/bin/xreal_driver_config", "--verify-token", token], stderr=subprocess.STDOUT, env=env_copy)
            return output.strip() == b"Token verified"
        except subprocess.CalledProcessError as exc:
            decky_plugin.logger.error(f"Error running config script {exc.output}")
            return False

    # Asyncio-compatible long-running code, executed in a task when the plugin is loaded
    async def _main(self):
        self.breezy_installing = True
        self.breezy_installed = await self.is_breezy_installed(self)

        if self.breezy_installed:
            self.breezy_installing = False
            return

        self.breezy_installed = await self.install_breezy(self)
        self.breezy_installing = False


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
            decky_plugin.logger.error(f"Error running uninstall script {exc.output}")
            return False
