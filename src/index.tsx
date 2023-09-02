import {
    definePlugin,
    PanelSection,
    PanelSectionRow,
    ServerAPI,
    ServerResponse,
    SliderField,
    Spinner,
    staticClasses,
    ToggleField,
} from "decky-frontend-lib";
// @ts-ignore
import React, {Fragment, useEffect, useState, VFC} from "react";
import {FaGlasses} from "react-icons/fa";
import {BiMessageError} from "react-icons/bi";

interface Config {
    disabled: boolean;
    use_joystick: boolean;
    mouse_sensitivity: number;
}

type InstallationStatus = "checking" | "inProgress" | "installed";

const Content: VFC<{ serverAPI: ServerAPI }> = ({serverAPI}) => {

    const [config, setConfig] = useState<Config>();
    const [installationStatus, setInstallationStatus] = useState<InstallationStatus>("checking");
    const [error, setError] = useState<string>();

    async function retrieveConfig() {
        const configRes: ServerResponse<Config> = await serverAPI.callPluginMethod<{}, Config>("retrieve_config", {});
        configRes.success ? setConfig(configRes.result) : setError(configRes.result);
    }

    async function checkInstallation() {
        const installedRes: ServerResponse<boolean> = await serverAPI.callPluginMethod<{}, boolean>("is_driver_installed", {});
        if (installedRes.success) {
            if (installedRes.result) {
                setInstallationStatus("installed")
            } else {
                setInstallationStatus("inProgress")
                const installDriverRes = await serverAPI.callPluginMethod<{}, boolean>("install_driver", {});
                if (installDriverRes.success && installDriverRes.result)
                    setInstallationStatus("installed")
                else
                    setError("Error installing the driver, check the logs")
            }
        } else {
            setError(installedRes.result);
        }
    }

    async function writeConfig(newConfig: Config) {
        const res = await serverAPI.callPluginMethod<{ config: Config }, void>("write_config", { config: newConfig });
        if (!res.success) {
            setError(res.result);
            await retrieveConfig();
        }
    }

    useEffect(() => {
        if (!config) retrieveConfig().catch((err) => setError(err));
        if (installationStatus == "checking") checkInstallation().catch((err) => setError(err));
    });

    const isDisabled = config?.disabled ?? false
    const useJoystick = config?.use_joystick ?? false
    const mouseSensitivity = config?.mouse_sensitivity ?? 20

    async function updateConfig(newConfig: Config) {
        await Promise.all([setConfig(newConfig), writeConfig(newConfig)])
    }

    return (
        <PanelSection title="Driver Configuration">
            {error && <PanelSectionRow
                style={{backgroundColor: "pink", borderColor: "red", color: "red"}}><BiMessageError/>{error}
            </PanelSectionRow>}
            {!error && <Fragment>
                {installationStatus == "installed" && config &&
                    <Fragment>
                        <PanelSectionRow>
                            <ToggleField checked={!isDisabled}
                                         label={"Enabled"}
                                         description={isDisabled && "Disabled: no head-tracking, Air glasses are display-only"}
                                         onChange={(enabled) => updateConfig({...config, disabled: !enabled})}/>
                        </PanelSectionRow>
                        {!isDisabled && <PanelSectionRow>
                            <ToggleField checked={!useJoystick}
                                         label={"Mouse mode"}
                                         description={useJoystick && "Joystick-mode enabled: see Settings/Controller when Air glasses are plugged in"}
                                         onChange={(useMouse) => updateConfig({
                                             ...config,
                                             use_joystick: !useMouse
                                         })}/>
                        </PanelSectionRow>}
                        {!isDisabled && !useJoystick && <PanelSectionRow>
                            <SliderField value={mouseSensitivity}
                                         min={5} max={100} showValue={true} notchTicksVisible={true} editableValue={true}
                                         label={"Mouse sensitivity"}
                                         onChange={(mouse_sensitivity) => updateConfig({
                                             ...config,
                                             mouse_sensitivity
                                         })}/>
                        </PanelSectionRow>}
                    </Fragment>
                }
                {(["checking", "inProgess"].includes(installationStatus) || !config) &&
                    <PanelSectionRow>
                        <Spinner style={{height: '48px'}}/>
                        {installationStatus == "inProgress" &&
                            <span>Installing driver...</span>
                        }
                    </PanelSectionRow>
                }

            </Fragment>}
        </PanelSection>
    );
};

export default definePlugin((serverApi: ServerAPI) => {
    return {
        title: <div className={staticClasses.Title}>XREAL Air Driver</div>,
        content: <Content serverAPI={serverApi}/>,
        icon: <FaGlasses/>
    };
});
