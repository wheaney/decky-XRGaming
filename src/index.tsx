import {
    definePlugin, NotchLabel,
    PanelSection,
    PanelSectionRow,
    ServerAPI,
    ServerResponse,
    SliderField,
    Spinner,
    staticClasses
} from "decky-frontend-lib";
// @ts-ignore
import React, {Fragment, useEffect, useState, VFC} from "react";
import {FaGlasses} from "react-icons/fa";
import {BiMessageError} from "react-icons/bi";
import { QRCodeSVG } from 'qrcode.react';
import {
    SiKofi
} from 'react-icons/si';

interface Config {
    disabled: boolean;
    output_mode: OutputMode;
    mouse_sensitivity: number;
    external_zoom: number;
    look_ahead: number;
}

type InstallationStatus = "checking" | "inProgress" | "installed";
type OutputMode = "mouse" | "joystick" | "external_only"
type ModeValue = "disabled" | OutputMode
const ModeValues: ModeValue[] = ['external_only', 'mouse', 'joystick', 'disabled'];
function modeValueIsOutputMode(value: ModeValue): value is OutputMode {
    return value != "disabled"
}

const ModeNotchLabels: NotchLabel[] = [
    {
        label: "Virtual display",
        notchIndex: 0
    },
    {
        label: "Mouse",
        notchIndex: 1
    },
    {
        label: "Joystick",
        notchIndex: 2
    },
    {
        label: "Disabled",
        notchIndex: 3
    },
];

const ZoomNotchLabels: NotchLabel[] = [
    {
        label: "Smallest",
        notchIndex: 0
    },
    {
        label: "1",
        notchIndex: 3
    },
    {
        label: "Biggest",
        notchIndex: 9
    }
];

const LookAheadNotchLabels: NotchLabel[] = [
    {
        label: "Default",
        notchIndex: 0
    },
    {
        label: "Min",
        notchIndex: 1
    },
    {
        label: "Max",
        notchIndex: 5
    }
];

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
    const outputMode = config?.output_mode ?? 'mouse'
    const mouseSensitivity = config?.mouse_sensitivity ?? 20
    const lookAhead = config?.look_ahead ?? 0
    const externalZoom = config?.external_zoom ?? 1

    async function updateConfig(newConfig: Config) {
        await Promise.all([setConfig(newConfig), writeConfig(newConfig)])
    }

    return (
        <PanelSection>
            {error && <PanelSectionRow
                style={{backgroundColor: "pink", borderColor: "red", color: "red"}}><BiMessageError/>{error}
            </PanelSectionRow>}
            {!error && <Fragment>
                {installationStatus == "installed" && config &&
                    <Fragment>
                        <PanelSectionRow>
                            <SliderField label={"Headset mode"}
                                         value={isDisabled ? ModeValues.indexOf('disabled') : ModeValues.indexOf(outputMode)}
                                         notchTicksVisible={true}
                                         min={0} max={ModeValues.length-1}
                                         notchLabels={ModeNotchLabels}
                                         notchCount={ModeValues.length}
                                         onChange={(newMode) => {
                                             const newValue = ModeValues[newMode]
                                             if (modeValueIsOutputMode(newValue)) {
                                                 updateConfig({
                                                     ...config,
                                                     output_mode: newValue,
                                                     disabled: false
                                                 }).catch(e => setError(e))
                                             } else {
                                                 updateConfig({
                                                     ...config,
                                                     disabled: true
                                                 }).catch(e => setError(e))
                                             }
                                         }}
                            />
                        </PanelSectionRow>
                        {!isDisabled && config.output_mode == "mouse" && <PanelSectionRow>
                            <SliderField value={mouseSensitivity}
                                         min={5} max={100} showValue={true} notchTicksVisible={true}
                                         label={"Mouse sensitivity"}
                                         onChange={(mouse_sensitivity) => updateConfig({
                                             ...config,
                                             mouse_sensitivity
                                         })}/>
                        </PanelSectionRow>}
                        {!isDisabled && config.output_mode == "external_only" && <Fragment>
                            <PanelSectionRow>
                                <SliderField value={externalZoom}
                                             min={0.25} max={2.5}
                                             notchCount={10}
                                             notchLabels={ZoomNotchLabels}
                                             label={"Display size"}
                                             step={0.25}
                                             editableValue={true}
                                             onChange={(external_zoom) => updateConfig({
                                                 ...config,
                                                 external_zoom
                                             })}/>
                            </PanelSectionRow>
                            <PanelSectionRow>
                                <SliderField value={lookAhead}
                                             min={0} max={50} notchTicksVisible={true}
                                             notchCount={6} notchLabels={LookAheadNotchLabels}
                                             step={10}
                                             label={"Movement look-ahead"}
                                             description={lookAhead > 0 ? "Use Default unless screen is noticeably ahead or behind your movements. May introduce jitter at higher values." : undefined}
                                             onChange={(look_ahead) => updateConfig({
                                                 ...config,
                                                 look_ahead
                                             })}/>
                            </PanelSectionRow>
                        </Fragment>}
                        <PanelSectionRow style={{display: "flex", justifyContent: "space-around", alignItems: "center"}}>
                            <p style={{textAlign: "center"}}>
                                Want more stuff like this?<br/>
                                Become a <SiKofi style={{position: 'relative', top: '3px'}} color={"red"} /> supporter!
                            </p>
                            <p style={{textAlign: "center"}}>
                                <QRCodeSVG value={"https://ko-fi.com/wheaney"}
                                           size={110}
                                           bgColor={"#06111e"}
                                           fgColor={"#ffffff"}
                                />
                            </p>
                        </PanelSectionRow>
                    </Fragment>
                }
                {(["checking", "inProgess"].includes(installationStatus) || !config) &&
                    <PanelSectionRow>
                        <Spinner style={{height: '48px'}}/>
                        {installationStatus == "inProgress" &&
                            <span>Installing...</span>
                        }
                    </PanelSectionRow>
                }

            </Fragment>}
        </PanelSection>
    );
};

export default definePlugin((serverApi: ServerAPI) => {
    return {
        title: <div className={staticClasses.Title}>XREAL Air Gaming</div>,
        content: <Content serverAPI={serverApi}/>,
        icon: <FaGlasses/>
    };
});
