import asyncio
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

RECENTER_BUTTON_ENABLED_KEY = "recenter_button_enabled"
RECENTER_BUTTON_COMBO_KEY = "recenter_button_combo"
DEFAULT_RECENTER_BUTTON_COMBO = "l4+r4"
VALVE_HID_VENDOR_ID = "28DE"
FALLBACK_HIDRAW_DEVICE = "/dev/hidraw2"

# valid --combo button names, mirrored from contrib/button_listener.sh's BUTTON_VARS
BUTTON_NAMES = {
    "a", "b", "x", "y", "l1", "r1", "l2", "r2", "l3", "r3", "l4", "r4",
    "dup", "ddown", "dleft", "dright", "select", "start", "steam", "quick",
    "lstick", "rstick", "lstouch", "rstouch",
    "lpadtouch", "lpadpress", "rpadtouch", "rpadpress"
}

settings = SettingsManager(name="settings", settings_directory=decky.DECKY_PLUGIN_SETTINGS_DIR)
settings.read()

ipc = XRDriverIPC(logger = decky.logger, 
                  config_home = os.path.join(decky.DECKY_USER_HOME, ".config"),
                  supported_output_modes = ['virtual_display', 'sideview'])

class Plugin:
    def __init__(self):
        self.breezy_installed = False
        self._button_listener_proc = None

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

    async def get_recenter_button_config(self):
        return {
            "enabled": settings.getSetting(RECENTER_BUTTON_ENABLED_KEY, False),
            "combo": settings.getSetting(RECENTER_BUTTON_COMBO_KEY, DEFAULT_RECENTER_BUTTON_COMBO)
        }

    async def set_recenter_button_combo(self, combo):
        if not self._is_valid_combo(combo):
            decky.logger.error(f"Rejected invalid recenter button combo: {combo}")
            return False

        settings.setSetting(RECENTER_BUTTON_COMBO_KEY, combo)
        if settings.getSetting(RECENTER_BUTTON_ENABLED_KEY, False):
            self._restart_button_listener(combo)

        return True

    async def set_recenter_button_enabled(self, enabled):
        settings.setSetting(RECENTER_BUTTON_ENABLED_KEY, enabled)
        if enabled:
            combo = settings.getSetting(RECENTER_BUTTON_COMBO_KEY, DEFAULT_RECENTER_BUTTON_COMBO)
            self._restart_button_listener(combo)
        else:
            self._stop_button_listener()

        return True

    def _is_valid_combo(self, combo):
        return bool(combo) and all(button in BUTTON_NAMES for button in combo.split("+"))

    def _detect_controller_hidraw_device(self):
        try:
            hidraw_base = "/sys/class/hidraw"
            for entry in sorted(os.listdir(hidraw_base)):
                uevent_path = os.path.join(hidraw_base, entry, "device", "uevent")
                try:
                    with open(uevent_path, "r") as f:
                        uevent = f.read()
                except OSError:
                    continue

                for line in uevent.splitlines():
                    if line.startswith("HID_ID="):
                        if f":{VALVE_HID_VENDOR_ID}:" in line.upper():
                            return f"/dev/{entry}"
        except OSError as e:
            decky.logger.error(f"Error detecting controller hidraw device: {e}")

        return FALLBACK_HIDRAW_DEVICE

    def _recenter_command(self):
        return "su -l -c '{}/.local/bin/xr_driver_cli --recenter' {}".format(
            decky.DECKY_USER_HOME, decky.DECKY_USER)

    def _restart_button_listener(self, combo):
        self._stop_button_listener()
        self._start_button_listener(combo)

    def _start_button_listener(self, combo):
        script_path = os.path.join(decky.DECKY_PLUGIN_DIR, "contrib", "button_listener.sh")
        if not os.path.isfile(script_path):
            decky.logger.error(f"button_listener.sh not found at {script_path}")
            return

        os.chmod(script_path, 0o755)
        device = self._detect_controller_hidraw_device()

        try:
            self._button_listener_proc = subprocess.Popen(
                [script_path, "--device", device, "--combo", combo, "--command", self._recenter_command(),
                 "--cooldown", "1"],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
        except OSError as e:
            decky.logger.error(f"Error starting button_listener.sh: {e}")

    def _stop_button_listener(self):
        proc = self._button_listener_proc
        self._button_listener_proc = None

        if proc is None or proc.poll() is not None:
            return

        try:
            proc.terminate()
            proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            proc.kill()

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
        self.loop.create_task(self._install_breezy())

        return True

    async def _install_breezy(self):
        decky.logger.info(f"Installing breezy for plugin version {decky.DECKY_PLUGIN_VERSION}")
        self.mark_breezy_install_started()

        # Set the USER environment variable for this command
        env_copy = os.environ.copy()
        del env_copy["LD_LIBRARY_PATH"]
        env_copy["USER"] = decky.DECKY_USER

        setup_script_path = os.path.dirname(__file__) + "/bin/breezy_vulkan_setup"
        binaries_dir = os.path.dirname(__file__) + "/bin/"

        if not os.path.isfile(setup_script_path):
            decky.logger.error(f"Breezy setup script not found at {setup_script_path}")
            self.clear_breezy_install_started()
            return False

        await self.write_control_flags({
            "request_features": ["sbs", "smooth_follow"]
        })

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

                    decky.logger.info(f"Breezy install succeeded on attempt {attempt}")
                    
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
        self.loop = asyncio.get_event_loop()

        if settings.getSetting(RECENTER_BUTTON_ENABLED_KEY, False):
            combo = settings.getSetting(RECENTER_BUTTON_COMBO_KEY, DEFAULT_RECENTER_BUTTON_COMBO)
            self._start_button_listener(combo)

    # Function called first during the unload process, utilize this to handle your plugin being removed
    async def _unload(self):
        self._stop_button_listener()

    # Migrations that should be performed before entering `_main()`.
    async def _migration(self):
        pass

    async def _uninstall(self):
        decky.logger.info(f"Uninstalling breezy for plugin version {decky.DECKY_PLUGIN_VERSION}")

        self._stop_button_listener()

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
