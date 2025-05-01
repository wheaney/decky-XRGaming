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

settings = SettingsManager(name="settings", settings_directory=decky.DECKY_PLUGIN_SETTINGS_DIR)
settings.read()

ipc = XRDriverIPC(logger = decky.logger, 
                  config_home = os.path.join(decky.DECKY_USER_HOME, ".config"),
                  supported_output_modes = ['virtual_display', 'sideview'])

class Plugin:
    def __init__(self):
        self.breezy_installed = False
        self.breezy_installing = False
    
    async def retrieve_config(self):
        return ipc.retrieve_config()
    
    async def write_config(self, config):
        return ipc.write_config(config)

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
        waitSecs = 0
        while self.breezy_installing and waitSecs < 3:
            time.sleep(1)
            waitSecs += 1

        return self.breezy_installed and await self.is_driver_running()

    async def is_driver_running(self):
        try:
            output = subprocess.check_output(['su', '-l', '-c', 'XDG_RUNTIME_DIR=/run/user/1000 systemctl --user is-active xr-driver', decky.DECKY_USER], stderr=subprocess.STDOUT)
            return output.strip() == b'active'
        except subprocess.CalledProcessError as exc:
            if exc.output.strip() != b'inactive':
                decky.logger.error(f"Error checking driver status {exc.output}")
            return False

    async def is_breezy_installed(self):
        try:
            if not await self.is_driver_running():
                return False

            installed_from_plugin_version = settings.getSetting(INSTALLED_VERSION_SETTING_KEY)
            if not installed_from_plugin_version == decky.DECKY_PLUGIN_VERSION:
                return False

            if (await self.get_breezy_manifest_checksum()) != settings.getSetting(MANIFEST_CHECKSUM_KEY):
                return False

            output = subprocess.check_output([decky.DECKY_USER_HOME + "/.local/bin/breezy_vulkan_verify"], stderr=subprocess.STDOUT)
            success = output.strip() == b"Verification succeeded"
            if not success:
                decky.logger.error(f"Error verifying breezy installation {output}")
            return success
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
        binary_path = os.path.dirname(__file__) + "/bin/breezyVulkan-x86_64.tar.gz"
        attempt = 0
        while attempt < 3:
            try:
                subprocess.check_output([
                    setup_script_path,
                    "-v",
                    decky.DECKY_PLUGIN_VERSION.replace("-", "_"),
                    binary_path
                ], stderr=subprocess.STDOUT, env=env_copy)
                if await self.is_driver_running():
                    settings.setSetting(INSTALLED_VERSION_SETTING_KEY, decky.DECKY_PLUGIN_VERSION)
                    settings.setSetting(MANIFEST_CHECKSUM_KEY, await self.get_breezy_manifest_checksum())
                    return True
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
        self.write_control_flags({
            "request_features": ["sbs", "smooth_follow"]
        })
        
        self.breezy_installing = True
        self.breezy_installed = await self.is_breezy_installed()

        if self.breezy_installed:
            self.breezy_installing = False
            return

        self.breezy_installed = await self.install_breezy()
        self.breezy_installing = False


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
            return True
        except subprocess.CalledProcessError as exc:
            decky.logger.error(f"Error running uninstall script {exc.output}")
            return False
