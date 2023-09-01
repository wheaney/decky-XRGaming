import {
    ButtonItem,
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

const DEFAULT_CONFIG = {disabled: false, use_joystick: false, mouse_sensitivity: 20}

const Content: VFC<{ serverAPI: ServerAPI }> = ({serverAPI}) => {

    const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
    const [installationStatus, setInstallationStatus] = useState<InstallationStatus>("checking");
    const [error, setError] = useState<string>();

    async function retrieveConfig() {
        const configRes: ServerResponse<Config> = await serverAPI!.callPluginMethod<null, Config>("retrieve_config", null);
        configRes.success ? setConfig(configRes.result) : setError(configRes.result);
    }

    async function checkInstallation() {
        const installedRes: ServerResponse<boolean> = await serverAPI!.callPluginMethod<null, boolean>("is_driver_installed", null);
        if (installedRes.success) {
            if (installedRes.result) {
                setInstallationStatus("installed")
            } else {
                setInstallationStatus("inProgress")
                const installDriverRes = await serverAPI!.callPluginMethod<null, boolean>("install_driver", null);
                if (installDriverRes.success && installDriverRes.result)
                    setInstallationStatus("installed")
                else
                    setError("Error installing the driver, check the logs")
            }
        } else {
            setError(installedRes.result);
        }
    }

    async function writeConfig() {
        const res = await serverAPI!.callPluginMethod<Config, void>("write_config", config);
        if (!res.success) {
            setError(res.result);
            await retrieveConfig();
        }
    }

    useEffect(() => {
        retrieveConfig().catch((err) => setError(err));
        checkInstallation().catch((err) => setError(err));
    });

    return (
        <PanelSection title="XREAL Air Driver">
            {error && <PanelSectionRow
                style={{backgroundColor: "pink", borderColor: "red", color: "red"}}><BiMessageError/>{error}
            </PanelSectionRow>}
            {!error && <PanelSectionRow>
                {installationStatus == "installed" && config &&
                    <Fragment>
                        <ToggleField checked={config['disabled']}
                                     label={"Disable"}
                                     description={"No head-tracking, Air glasses are display-only"}
                                     onChange={(disabled) => setConfig({...config, disabled})}/>
                        <ToggleField checked={config['use_joystick']}
                                     disabled={config['disabled']} label={"Output as joystick"}
                                     description={"Defaults to mouse movements"}
                                     onChange={(use_joystick) => setConfig({...config, use_joystick})}/>
                        <SliderField value={config['mouse_sensitivity']}
                                     disabled={config['use_joystick'] || config['disabled']} label={"Mouse Sensitivity"}
                                     onChange={(mouse_sensitivity) => setConfig({...config, mouse_sensitivity})}/>
                        <ButtonItem label={"Save"} onClick={writeConfig}/>
                    </Fragment>
                }
                {(["checking", "inProgess"].includes(installationStatus) || !config) &&
                    <Spinner style={{height: '48px'}}/>
                }
                {installationStatus == "inProgress" &&
                    <span>Installing driver...</span>
                }
            </PanelSectionRow>}
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
