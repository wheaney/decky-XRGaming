import {
    ButtonItem,
    definePlugin,
    Field,
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
import React, {Fragment, useEffect, useState, VFC} from "react";
import {FaGlasses} from "react-icons/fa";
import {BiMessageError} from "react-icons/bi";
import { PiPlugsConnected } from "react-icons/pi";
import { TbPlugConnectedX } from "react-icons/tb";
import {SiDiscord, SiKofi} from 'react-icons/si';
import {LuHelpCircle} from 'react-icons/lu';
import QrButton from "./QrButton";

interface Config {
    disabled: boolean;
    output_mode: OutputMode;
    mouse_sensitivity: number;
    display_zoom: number;
    display_distance: number;
    look_ahead: number;
    sbs_content: boolean;
    sbs_mode_stretched: boolean;
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
const DirtyControlFlagsExpireMilliseconds = 3000

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

const DisplayZoomNotchLabels: NotchLabel[] = [
    {
        label: "Smallest",
        notchIndex: 0
    },
    {
        label: "Default",
        notchIndex: 3
    },
    {
        label: "Biggest",
        notchIndex: 9
    }
];

const DisplayDisanceNotchLabels: NotchLabel[] = [
    {
        label: "Closest",
        notchIndex: 0
    },
    {
        label: "Default",
        notchIndex: 3
    },
    {
        label: "Farthest",
        notchIndex: 9
    }
];

const LookAheadNotchLabels: NotchLabel[] = [
    {
        label: "Default",
        notchIndex: 0
    },
    {
        label: "Lower",
        notchIndex: 1
    },
    {
        label: "Higher",
        notchIndex: 5
    }
];

const Content: VFC<{ serverAPI: ServerAPI }> = ({serverAPI}) => {

    const [config, setConfig] = useState<Config>();
    const [driverState, setDriverState] = useState<DriverState>();
    const [dirtyControlFlags, setDirtyControlFlags] = useState<DirtyControlFlags>({});
    const [installationStatus, setInstallationStatus] = useState<InstallationStatus>("checking");
    const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
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
                    setError("There was an error during setup. Try restarting your Steam Deck. " +
                        "If the error persists, please file an issue in the decky-xrealAir GitHub repository.")
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
    const isVirtualDisplayMode = !isDisabled && config?.output_mode == "external_only"
    let sbsModeEnabled = driverState?.sbs_mode_enabled ?? false
    if (dirtyControlFlags?.sbs_mode && dirtyControlFlags?.sbs_mode !== 'unset') sbsModeEnabled = dirtyControlFlags.sbs_mode === 'enable'
    const calibrating = dirtyControlFlags.recalibrate || driverState?.calibration_state == "CALIBRATING";
    const enableSbsButton = <PanelSectionRow>
        <ToggleField
            checked={sbsModeEnabled}
            label={"Enable side-by-side mode"}
            description={"For adjusting screen depth, or viewing 3D content"}
            onChange={(sbs_mode_enabled) => writeControlFlags(
                {
                    sbs_mode: sbs_mode_enabled ? 'enable' : 'disable'
                }
            )}/>
    </PanelSectionRow>;

    const advancedSettings = [
        isVirtualDisplayMode && driverState?.sbs_mode_supported && !sbsModeEnabled && enableSbsButton,
        config && isVirtualDisplayMode && <PanelSectionRow>
            <SliderField value={config.look_ahead}
                         min={0} max={30} notchTicksVisible={true}
                         notchCount={6} notchLabels={LookAheadNotchLabels}
                         step={3}
                         label={"Movement look-ahead"}
                         description={config.look_ahead > 0 ? "Use Default unless screen is noticeably ahead or behind your movements. May introduce jitter at higher values." : undefined}
                         onChange={(look_ahead) => {
                             if (config) {
                                 updateConfig({
                                     ...config,
                                     look_ahead
                                 }).catch(e => setError(e))
                             }
                         }}
            />
        </PanelSectionRow>,
        <PanelSectionRow>
            <ButtonItem disabled={calibrating}
                        description={!calibrating ? "Or triple-tap your headset." : undefined}
                        layout="below"
                        onClick={() => writeControlFlags({recalibrate: true})} >
                {calibrating ?
                    <span><Spinner style={{height: '16px', marginRight: 10}} />Calibrating headset</span> :
                    "Recalibrate headset"
                }
            </ButtonItem>
        </PanelSectionRow>
    ].filter(Boolean);

    // if advanced settings contains more than 1 element, filter out falsey values
    const advancedButtonVisible = advancedSettings.length > 1;

    async function updateConfig(newConfig: Config) {
        await Promise.all([setConfig(newConfig), writeConfig(newConfig)])
    }

    return (
        <Fragment>
            {error && <PanelSection>
                <PanelSectionRow style={{backgroundColor: "pink", borderColor: "red", color: "red"}}>
                    <BiMessageError/>{error}
                </PanelSectionRow>
            </PanelSection>}
            {!error && <Fragment>
                {installationStatus == "installed" && driverState && config &&
                    <Fragment>
                        <PanelSection>
                            <PanelSectionRow style={{fontSize: 'medium', textAlign: 'center'}}>
                                <Field padding={'none'} childrenContainerWidth={'max'}>
                                    <span style={{color: deviceConnected ? 'white' : 'gray'}}>
                                        {deviceConnected ? driverState?.connected_device_name : "No device connected"}
                                    </span>
                                    {deviceConnected && <span style={{marginLeft: 5, color: 'green'}}>
                                        connected
                                    </span>}
                                    <span style={{marginLeft: 7, color: deviceConnected ? 'green' : 'red', position: 'relative', top: '3px'}}>
                                        {deviceConnected ? <PiPlugsConnected /> : <TbPlugConnectedX />}
                                    </span>
                                </Field>
                            </PanelSectionRow>
                            {deviceConnected && <PanelSectionRow>
                                <SliderField label={"Headset mode"}
                                             description={isVirtualDisplayMode ? "Virtual display is only available in-game." : undefined}
                                             value={isDisabled ? ModeValues.indexOf('disabled') : ModeValues.indexOf(config.output_mode)}
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
                                <SliderField value={config.mouse_sensitivity}
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
                            {isVirtualDisplayMode && <Fragment>
                                <PanelSectionRow>
                                    <SliderField value={config.display_zoom}
                                                 min={0.25} max={2.5}
                                                 notchCount={10}
                                                 notchLabels={DisplayZoomNotchLabels}
                                                 label={"Display size"}
                                                 step={0.05}
                                                 editableValue={true}
                                                 onChange={(display_zoom) => {
                                                     if (config) {
                                                         updateConfig({
                                                             ...config,
                                                             display_zoom
                                                         }).catch(e => setError(e))
                                                     }
                                                 }}
                                    />
                                </PanelSectionRow>
                                <PanelSectionRow>
                                    <ButtonItem disabled={calibrating || dirtyControlFlags.recenter_screen}
                                                description={!calibrating && !dirtyControlFlags.recenter_screen ? "Or double-tap your headset." : undefined}
                                                layout="below"
                                                onClick={() => writeControlFlags({recenter_screen: true})} >
                                        {calibrating ?
                                            <span><Spinner style={{height: '16px', marginRight: 10}} />Calibrating headset</span> :
                                            "Recenter display"
                                        }
                                    </ButtonItem>
                                </PanelSectionRow>
                            </Fragment>}
                        </PanelSection>
                        {isVirtualDisplayMode && driverState?.sbs_mode_enabled && <PanelSection title={"Side-by-side mode"}>
                            {enableSbsButton}
                            <PanelSectionRow>
                                <SliderField value={config.display_distance}
                                             min={0.25} max={2.5}
                                             notchCount={10}
                                             notchLabels={DisplayDisanceNotchLabels}
                                             label={"Display distance"}
                                             step={0.05}
                                             editableValue={true}
                                             onChange={(display_distance) => {
                                                 if (config) {
                                                     updateConfig({
                                                         ...config,
                                                         display_distance
                                                     }).catch(e => setError(e))
                                                 }
                                             }}
                                />
                            </PanelSectionRow>
                            <PanelSectionRow>
                                <ToggleField
                                    checked={config.sbs_mode_stretched}
                                    label={"Content is stretched"}
                                    description={"Enable if your content goes from the left edge to the right edge of the screen"}
                                    onChange={(sbs_mode_stretched) => {
                                        if (config) {
                                            updateConfig({
                                                ...config,
                                                sbs_mode_stretched
                                            }).catch(e => setError(e))
                                        }
                                    }}/>
                            </PanelSectionRow>
                            <PanelSectionRow>
                                <ToggleField
                                    checked={config.sbs_content}
                                    label={"Content is 3D"}
                                    description={"For when the source content is 3D SBS"}
                                    onChange={(sbs_content) => {
                                        if (config) {
                                            updateConfig({
                                                ...config,
                                                sbs_content,

                                                // assume 3d content is stretched to fill the screen
                                                sbs_mode_stretched: sbs_content ? true : config.sbs_mode_stretched
                                            }).catch(e => setError(e))
                                        }
                                    }}/>
                            </PanelSectionRow>
                        </PanelSection>}
                        {!isDisabled && <PanelSection title={"Advanced"}>
                            {!showAdvanced && advancedButtonVisible && <PanelSectionRow>
                                <ButtonItem layout="below" onClick={() => setShowAdvanced(true)} >
                                    Show advanced settings
                                </ButtonItem>
                            </PanelSectionRow>}
                            {showAdvanced && advancedSettings}
                            {showAdvanced && advancedButtonVisible && <PanelSectionRow>
                                <ButtonItem layout="below" onClick={() => setShowAdvanced(false)} >
                                    Hide advanced settings
                                </ButtonItem>
                            </PanelSectionRow>}
                        </PanelSection>}
                        <PanelSection>
                            {isVirtualDisplayMode &&
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
                                </QrButton> ||
                                <QrButton icon={<LuHelpCircle />}
                                          url={"https://github.com/wheaney/decky-xrealAir#xreal-air-driver"}
                                          followLink={true}
                                >
                                    Need help?
                                </QrButton>
                            }
                            {deviceConnected && <QrButton icon={<SiKofi />} url={"https://ko-fi.com/wheaney"}>
                                <span style={{fontSize: 'small'}}>
                                    Want more great stuff like this?<br/>
                                    <span style={{color:'white', fontWeight: 'bold'}}>Become a <SiKofi style={{position: 'relative', top: '3px'}} color={"red"} /> supporter!</span>
                                </span>
                            </QrButton>}
                            <QrButton icon={<SiDiscord />} url={"https://discord.gg/GRQcfR5h9c"}>
                                <span style={{fontSize: 'small'}}>
                                    News. Discussions. Help.<br/>
                                    <span style={{color:'white', fontWeight: 'bold'}}>Join the chat!</span>
                                </span>
                            </QrButton>
                        </PanelSection>
                    </Fragment> ||
                    <PanelSectionRow>
                        <Spinner style={{height: '48px'}} />
                        {installationStatus == "inProgress" &&
                            <span>Installing...</span>
                        }
                    </PanelSectionRow>
                }
            </Fragment>}
        </Fragment>
    );
};

export default definePlugin((serverApi: ServerAPI) => {
    return {
        title: <div className={staticClasses.Title}>XREAL Air Driver</div>,
        content: <Content serverAPI={serverApi}/>,
        icon: <FaGlasses/>
    };
});
