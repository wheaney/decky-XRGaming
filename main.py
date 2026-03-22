import decky
import os
import subprocess
import sys
import time
from settings import SettingsManager

sys.path.insert(1, decky.DECKY_PLUGIN_DIR)
from PyXRLinuxDriverIPC.xrdriveripc import XRDriverIPC

INSTALLED_VERSION_SETTING_KEY = "installed_from_plugin_version"
DONT_SHOW_AGAIN_SETTING_KEY = "dont_show_again"
MANIFEST_CHECKSUM_KEY = "manifest_checksum"
MEASUREMENT_UNITS_SETTING_KEY = "measurement_units"
BREEZY_INSTALL_STARTED_AT_SETTING_KEY = "breezy_install_started_at"
BREEZY_INSTALL_TIMEOUT_SECONDS = 60

settings = SettingsManager(name="settings", settings_directory=decky.DECKY_PLUGIN_SETTINGS_DIR)
settings.read()

ipc = XRDriverIPC(logger = decky.logger, 
                  config_home = os.path.join(decky.DECKY_USER_HOME, ".config"),
                  supported_output_modes = ['virtual_display', 'sideview'])

class Plugin:
    def __init__(self):
        self.breezy_installed = False

    async def is_breezy_install_pending(self):
        started_at = settings.getSetting(BREEZY_INSTALL_STARTED_AT_SETTING_KEY)
        if started_at is None:
            return False

        try:
            started_at = float(started_at)
        except (TypeError, ValueError):
            settings.setSetting(BREEZY_INSTALL_STARTED_AT_SETTING_KEY, None)
            return False

        if time.time() - started_at > BREEZY_INSTALL_TIMEOUT_SECONDS:
            settings.setSetting(BREEZY_INSTALL_STARTED_AT_SETTING_KEY, None)
            return False

        return True

    def mark_breezy_install_started(self):
        settings.setSetting(BREEZY_INSTALL_STARTED_AT_SETTING_KEY, time.time())

    def clear_breezy_install_started(self):
        settings.setSetting(BREEZY_INSTALL_STARTED_AT_SETTING_KEY, None)
    
    async def retrieve_config(self):
        try:
            config = ipc.retrieve_config()
            measurement_units = settings.getSetting(MEASUREMENT_UNITS_SETTING_KEY)
            if measurement_units is not None:
                config['measurement_units'] = measurement_units
            return config
        except Exception as e:
            decky.logger.error(f"Error retrieving config {e}")
            return None
    
    async def write_config(self, config):
        try:
            config_copy = config.copy()
            if 'measurement_units' in config_copy:
                measurement_units = config_copy['measurement_units']
                del config_copy['measurement_units']
                settings.setSetting(MEASUREMENT_UNITS_SETTING_KEY, measurement_units)
            ipc.write_config(config_copy)

            return config
        except Exception as e:
            decky.logger.error(f"Error writing config {e}")
            return None

    async def write_control_flags(self, control_flags):
        ipc.write_control_flags(control_flags)

    async def retrieve_driver_state(self):
        return ipc.retrieve_driver_state()

    async def retrieve_dont_show_again_keys(self):
        return [key for key in settings.getSetting(DONT_SHOW_AGAIN_SETTING_KEY, "").split(",") if key]

    async def set_dont_show_again(self, key):
        try:
            dont_show_again_keys = await self.retrieve_dont_show_again_keys()
            dont_show_again_keys.append(key)
            settings.setSetting(DONT_SHOW_AGAIN_SETTING_KEY, ",".join(dont_show_again_keys))
            return True
        except Exception as e:
            decky.logger.error(f"Error setting dont_show_again {e}")
            return False

    async def reset_dont_show_again(self):
        try:
            settings.setSetting(DONT_SHOW_AGAIN_SETTING_KEY, "")
            return True
        except Exception as e:
            decky.logger.error(f"Error resetting dont_show_again {e}")
            return False

    async def is_breezy_installed_and_running(self):
        return self.breezy_installed

    async def is_driver_running(self):
        return ipc.is_driver_running(as_user=decky.DECKY_USER)

    async def force_reset_driver(self):
        return ipc.reset_driver(as_user=decky.DECKY_USER)

    async def check_breezy_installed(self):
        try:
            if not await self.is_driver_running():
                return False

            installed_from_plugin_version = settings.getSetting(INSTALLED_VERSION_SETTING_KEY)
            if not installed_from_plugin_version == decky.DECKY_PLUGIN_VERSION:
                decky.logger.info(f"Breezy plugin version {decky.DECKY_PLUGIN_VERSION} does not match installed version {installed_from_plugin_version}")
                return False

            if (await self.get_breezy_manifest_checksum()) != settings.getSetting(MANIFEST_CHECKSUM_KEY):
                decky.logger.info("Breezy manifest checksum does not match expected value")
                return False

            output = subprocess.check_output(['su', '-l', '-c', 'XDG_RUNTIME_DIR=/run/user/1000 ' + decky.DECKY_USER_HOME + '/.local/bin/breezy_vulkan_verify', decky.DECKY_USER], stderr=subprocess.STDOUT)
            self.breezy_installed = output.strip() == b"Verification succeeded"
            if not self.breezy_installed:
                decky.logger.error(f"Error verifying breezy installation {output}")
            
            return self.breezy_installed
        except subprocess.CalledProcessError as exc:
            decky.logger.error(f"Error checking driver installation {exc.output}")
            return False

    async def get_breezy_manifest_checksum(self):
        try:
            output = subprocess.check_output(["sha256sum", decky.DECKY_USER_HOME + "/.local/share/breezy_vulkan/manifest"], stderr=subprocess.STDOUT)

            # convert to a non-byte string, then split on spaces
            return output.strip().decode("utf-8").split(" ")[0]
        except subprocess.CalledProcessError as exc:
            decky.logger.error(f"Error getting breezy manifest checksum {exc.output}")
            return None

    async def install_breezy(self):
        decky.logger.info(f"Installing breezy for plugin version {decky.DECKY_PLUGIN_VERSION}")

        # Set the USER environment variable for this command
        env_copy = os.environ.copy()
        del env_copy["LD_LIBRARY_PATH"]
        env_copy["USER"] = decky.DECKY_USER

        setup_script_path = os.path.dirname(__file__) + "/bin/breezy_vulkan_setup"
        binaries_dir = os.path.dirname(__file__) + "/bin/"

        if not os.path.isfile(setup_script_path):
            decky.logger.error(f"Breezy setup script not found at {setup_script_path}")
            return False
        
        self.mark_breezy_install_started()
        attempt = 0
        while attempt < 3:
            try:
                subprocess.check_output([
                    setup_script_path,
                    "-v",
                    decky.DECKY_PLUGIN_VERSION.replace("-", "_"),
                    binaries_dir
                ], stderr=subprocess.STDOUT, env=env_copy)

                self.breezy_installed = await self.is_driver_running()
                if self.breezy_installed:
                    settings.setSetting(INSTALLED_VERSION_SETTING_KEY, decky.DECKY_PLUGIN_VERSION)
                    settings.setSetting(MANIFEST_CHECKSUM_KEY, await self.get_breezy_manifest_checksum())
                    self.clear_breezy_install_started()
                    return True
            except FileNotFoundError as exc:
                # don't return, we still want to retry in case a file was still being downloaded
                decky.logger.error(f"Breezy install failed because a required file was missing: {exc}")
                time.sleep(4) # overall sleep of 5 seconds with the sleep below
            except subprocess.CalledProcessError as exc:
                decky.logger.error(f"Error running setup script: {exc.output}")

            attempt += 1
            time.sleep(1)

        return False

    async def request_token(self, email):
        return ipc.request_token(email)

    async def verify_token(self, token):
        return ipc.verify_token(token)

    # Asyncio-compatible long-running code, executed in a task when the plugin is loaded
    async def _main(self):
        await self.write_control_flags({
            "request_features": ["sbs", "smooth_follow"]
        })

        if await self.is_breezy_install_pending():
            return
        
        self.mark_breezy_install_started()
        if await self.check_breezy_installed():
            self.clear_breezy_install_started()
            return
        
        await self.install_breezy()

    # Function called first during the unload process, utilize this to handle your plugin being removed
    async def _unload(self):
        pass

    # Migrations that should be performed before entering `_main()`.
    async def _migration(self):
        pass

    async def _uninstall(self):
        decky.logger.info(f"Uninstalling breezy for plugin version {decky.DECKY_PLUGIN_VERSION}")

        # Set the USER environment variable for this command
        env_copy = os.environ.copy()
        del env_copy["LD_LIBRARY_PATH"]
        env_copy["USER"] = decky.DECKY_USER

        try:
            subprocess.check_output([decky.DECKY_USER_HOME + "/.local/bin/breezy_vulkan_uninstall"], stderr=subprocess.STDOUT, env=env_copy)
            subprocess.check_output([decky.DECKY_USER_HOME + "/.local/bin/xr_driver_uninstall"], stderr=subprocess.STDOUT, env=env_copy)
            settings.setSetting(INSTALLED_VERSION_SETTING_KEY, None)
            settings.setSetting(MANIFEST_CHECKSUM_KEY, None)
            self.clear_breezy_install_started()
            self.breezy_installed = False
            return True
        except subprocess.CalledProcessError as exc:
            decky.logger.error(f"Error running uninstall script {exc.output}")
            return False
