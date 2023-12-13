import {
    ButtonItem,
    definePlugin,
    NotchLabel,
    PanelSection,
    PanelSectionRow,
    ServerAPI,
    ServerResponse,
    SliderField,
    Spinner,
    staticClasses,
    ToggleField
} from "decky-frontend-lib";
// @ts-ignore
import React, {CSSProperties, Fragment, useEffect, useState, VFC} from "react";
import {FaGlasses} from "react-icons/fa";
import {BiMessageError} from "react-icons/bi";
import {BsUsbC, BsUsbCFill} from "react-icons/bs";
import {SiKofi} from 'react-icons/si';
import {LuHelpCircle} from 'react-icons/lu';
import QrButton from "./QrButton";

interface Config {
    disabled: boolean;
    output_mode: OutputMode;
    mouse_sensitivity: number;
    external_zoom: number;
    look_ahead: number;
}

interface DriverState {
    heartbeat: number;
    connected_device_name: string;
    calibration_setup: CalibrationSetup;
    calibration_state: CalibrationState;
    sbs_mode_enabled: boolean;
    sbs_mode_supported: boolean;
}

interface ControlFlags {
    recenter_screen: boolean;
    recalibrate: boolean;
    sbs_mode: SbsModeControl;
}

type DirtyControlFlags = {
    last_updated?: number;
} & Partial<ControlFlags>

type InstallationStatus = "checking" | "inProgress" | "installed";
type OutputMode = "mouse" | "joystick" | "external_only"
type ModeValue = "disabled" | OutputMode
const ModeValues: ModeValue[] = ['external_only', 'mouse', 'joystick', 'disabled'];
type CalibrationSetup = "AUTOMATIC" | "INTERACTIVE"
type CalibrationState = "NOT_CALIBRATED" | "CALIBRATING" | "CALIBRATED" | "WAITING_ON_USER"
type SbsModeControl = "unset" | "enable" | "disable"
const DirtyControlFlagsExpireMilliseconds = 2000

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
        notchIndex: 6
    }
];

const Content: VFC<{ serverAPI: ServerAPI }> = ({serverAPI}) => {

    const [config, setConfig] = useState<Config>();
    const [driverState, setDriverState] = useState<DriverState>();
    const [dirtyControlFlags, setDirtyControlFlags] = useState<DirtyControlFlags>({});
    const [installationStatus, setInstallationStatus] = useState<InstallationStatus>("checking");
    const [error, setError] = useState<string>();

    async function retrieveConfig() {
        const configRes: ServerResponse<Config> = await serverAPI.callPluginMethod<{}, Config>("retrieve_config", {});
        configRes.success ? setConfig(configRes.result) : setError(configRes.result);
    }

    // have this function call itself every second to keep the UI up to date
    async function retrieveDriverState() {
        const driverStateRes: ServerResponse<DriverState> = await serverAPI.callPluginMethod<{}, DriverState>("retrieve_driver_state", {});
        driverStateRes.success ? setDriverState(driverStateRes.result) : setError(driverStateRes.result);

        setTimeout(() => {
            retrieveDriverState().catch((err) => setError(err));
        }, 1000);
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

    async function writeControlFlags(flags: Partial<ControlFlags>) {
        const res = await serverAPI.callPluginMethod<{ control_flags: Partial<ControlFlags>}, void>("write_control_flags", { control_flags: flags });
        res.success ? setDirtyControlFlags({...flags, last_updated: Date.now()}) : setError(res.result);
    }

    // these asynchronous calls should execute ONLY one time, hence the empty array as the second argument
    useEffect(() => {
        retrieveConfig().catch((err) => setError(err));
        checkInstallation().catch((err) => setError(err));
        retrieveDriverState().catch((err) => setError(err));
    }, []);

    useEffect(() => {
        // clear the dirty control flags if they're reflected in the state, or stale
        if (dirtyControlFlags.last_updated &&
            (Date.now() - dirtyControlFlags.last_updated) > DirtyControlFlagsExpireMilliseconds ||
            driverState && (
                dirtyControlFlags.sbs_mode == 'enable' && driverState.sbs_mode_enabled ||
                dirtyControlFlags.sbs_mode == 'disable' && !driverState.sbs_mode_enabled
            )
        ) {
            setDirtyControlFlags({})
        }
    }, [driverState])

    const deviceConnected = !!driverState?.connected_device_name
    const isDisabled = !deviceConnected || (config?.disabled ?? false)
    const outputMode = config?.output_mode ?? 'mouse'
    const mouseSensitivity = config?.mouse_sensitivity ?? 20
    const lookAhead = config?.look_ahead ?? 0
    const externalZoom = config?.external_zoom ?? 1
    let sbsModeEnabled = driverState?.sbs_mode_enabled ?? false
    if (dirtyControlFlags?.sbs_mode && dirtyControlFlags?.sbs_mode !== 'unset') sbsModeEnabled = dirtyControlFlags.sbs_mode === 'enable'
    const calibrating = dirtyControlFlags.recalibrate || driverState?.calibration_state == "CALIBRATING";

    async function updateConfig(newConfig: Config) {
        await Promise.all([setConfig(newConfig), writeConfig(newConfig)])
    }

    return (
        <PanelSection>
            {error && <PanelSectionRow
                style={{backgroundColor: "pink", borderColor: "red", color: "red"}}><BiMessageError/>{error}
            </PanelSectionRow>}
            {!error && <Fragment>
                {installationStatus == "installed" && driverState && config &&
                    <Fragment>
                        <PanelSectionRow style={{fontSize: 'medium', textAlign: 'center'}}>
                            <div style={{padding: 0}}>
                                <span style={{color: deviceConnected ? 'white' : 'gray', position: 'relative', top: '3px'}}>
                                    {deviceConnected ? <BsUsbCFill/> : <BsUsbC/>}
                                </span>
                                <span style={{marginLeft: 10, color: deviceConnected ? 'white' : 'gray'}}>
                                    {deviceConnected ? driverState?.connected_device_name : "No device connected"}
                                </span>
                                {deviceConnected && <span style={{marginLeft: 5, color: 'green'}}>
                                    connected
                                </span>}
                            </div>
                        </PanelSectionRow>
                        {deviceConnected && <PanelSectionRow>
                            <SliderField label={"Headset mode"}
                                         value={isDisabled ? ModeValues.indexOf('disabled') : ModeValues.indexOf(outputMode)}
                                         notchTicksVisible={true}
                                         min={0} max={ModeValues.length-1}
                                         notchLabels={ModeNotchLabels}
                                         notchCount={ModeValues.length}
                                         onChange={(newMode) => {
                                             if (config) {
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
                                             }
                                         }}
                            />
                        </PanelSectionRow>}
                        {!isDisabled && config.output_mode == "mouse" && <PanelSectionRow>
                            <SliderField value={mouseSensitivity}
                                         min={5} max={100} showValue={true} notchTicksVisible={true}
                                         label={"Mouse sensitivity"}
                                         onChange={(mouse_sensitivity) => {
                                             if (config) {
                                                 updateConfig({
                                                     ...config,
                                                     mouse_sensitivity
                                                 }).catch(e => setError(e))
                                             }
                                         }}
                            />
                        </PanelSectionRow>}
                        {!isDisabled && config.output_mode == "external_only" && <Fragment>
                            <PanelSectionRow>
                                <SliderField value={externalZoom}
                                             min={0.25} max={2.5}
                                             notchCount={10}
                                             notchLabels={ZoomNotchLabels}
                                             label={"Display size"}
                                             step={0.05}
                                             editableValue={true}
                                             onChange={(external_zoom) => {
                                                 if (config) {
                                                     updateConfig({
                                                         ...config,
                                                         external_zoom
                                                     }).catch(e => setError(e))
                                                 }
                                             }}
                                />
                            </PanelSectionRow>
                            <PanelSectionRow>
                                <SliderField value={lookAhead}
                                             min={0} max={30} notchTicksVisible={true}
                                             notchCount={7} notchLabels={LookAheadNotchLabels}
                                             step={5}
                                             label={"Movement look-ahead"}
                                             description={lookAhead > 0 ? "Use Default unless screen is noticeably ahead or behind your movements. May introduce jitter at higher values." : undefined}
                                             onChange={(look_ahead) => {
                                                 if (config) {
                                                     updateConfig({
                                                         ...config,
                                                         look_ahead
                                                     }).catch(e => setError(e))
                                                 }
                                             }}
                                />
                            </PanelSectionRow>
                            {driverState?.sbs_mode_supported && <PanelSectionRow>
                                <ToggleField
                                    checked={sbsModeEnabled}
                                    label={"Enable SBS mode"}
                                    onChange={(sbs_mode_enabled) => writeControlFlags(
                                        {
                                            sbs_mode: sbs_mode_enabled ? 'enable' : 'disable'
                                        }
                                    )}/>
                            </PanelSectionRow>}
                            <PanelSectionRow>
                                <ButtonItem disabled={calibrating || dirtyControlFlags.recenter_screen}
                                            bottomSeparator="none"
                                            layout="below"
                                            onClick={() => writeControlFlags({recenter_screen: true})} >
                                    Recenter display
                                </ButtonItem>
                            </PanelSectionRow>
                            <PanelSectionRow>
                                <ButtonItem disabled={calibrating}
                                            bottomSeparator="none"
                                            layout="below"
                                            onClick={() => writeControlFlags({recalibrate: true})} >
                                    {calibrating ?
                                        <span><Spinner style={{height: '16px', marginRight: 10}} />Calibrating</span> :
                                        "Recalibrate"
                                    }
                                </ButtonItem>
                            </PanelSectionRow>
                        </Fragment>}
                        {!isDisabled && config.output_mode == "external_only" &&
                            <QrButton icon={<LuHelpCircle />}
                                      url={"https://github.com/wheaney/decky-xrealAir#virtual-display-help"}
                                      followLink={true}
                            >
                                <span style={{fontSize: 'large'}}><span style={{
                                    fontWeight: 'bold',
                                    background: 'linear-gradient(to right, red, orange, yellow, green, blue, indigo, violet)',
                                    WebkitBackgroundClip: 'text',
                                    color: 'transparent'
                                }}>Virtual display</span> help</span>
                            </QrButton>
                        }
                        {deviceConnected && <QrButton icon={<SiKofi />} url={"https://ko-fi.com/wheaney"}>
                            <span style={{fontSize: 'small'}}>
                                Want more great stuff like this?<br/>
                                <b>Become a <SiKofi style={{position: 'relative', top: '3px'}} color={"red"} /> supporter!</b>
                            </span>
                        </QrButton>}
                    </Fragment> ||
                    <PanelSectionRow>
                        <Spinner style={{height: '48px'}} />
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
        title: <div className={staticClasses.Title}>XREAL Air Driver</div>,
        content: <Content serverAPI={serverApi}/>,
        icon: <FaGlasses/>
    };
});
