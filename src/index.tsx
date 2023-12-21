import {
    ButtonItem,
    definePlugin,
    Field,
    Menu,
    MenuItem,
    NotchLabel,
    PanelSection,
    PanelSectionRow,
    ServerAPI,
    ServerResponse,
    showContextMenu,
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
import beam from "../assets/beam.png";
import ButtonFieldSmall from "./ButtonFieldSmall";

interface Config {
    disabled: boolean;
    output_mode: OutputMode;
    external_mode: ExternalMode;
    mouse_sensitivity: number;
    display_zoom: number;
    look_ahead: number;
    sbs_display_size: number;
    sbs_display_distance: number;
    sbs_content: boolean;
    sbs_mode_stretched: boolean;
    sideview_position: SideviewPosition;
    sideview_display_size: number;
}

interface DriverState {
    heartbeat: number;
    connected_device_brand: string;
    connected_device_model: string;
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
type ExternalMode = 'virtual_display' | 'sideview' | 'none'
type HeadsetModeOption = "virtual_display" | "vr_lite" | "sideview" | "disabled"
type CalibrationSetup = "AUTOMATIC" | "INTERACTIVE"
type CalibrationState = "NOT_CALIBRATED" | "CALIBRATING" | "CALIBRATED" | "WAITING_ON_USER"
type SbsModeControl = "unset" | "enable" | "disable"
type SideviewPosition = "top_left" | "top_right" | "bottom_left" | "bottom_right"
const SideviewPositions: SideviewPosition[] = ["top_left", "top_right", "bottom_left", "bottom_right"]
const DirtyControlFlagsExpireMilliseconds = 3000

const HeadsetModeDescriptions: {[key in HeadsetModeOption]: string} = {
    "virtual_display": "Virtual display is only available in-game.",
    "vr_lite": "Use Head movements to look around in-game.",
    "sideview": "Move the screen to your peripheral.",
    "disabled": "Static display with no head-tracking."
};
const HeadsetModeOptions: HeadsetModeOption[] =  Object.keys(HeadsetModeDescriptions) as HeadsetModeOption[];

const SideviewPositionDescriptions: {[key in SideviewPosition]: string} = {
    "top_left": "Top\u00a0left",
    "top_right": "Top\u00a0right",
    "bottom_left": "Bottom\u00a0left",
    "bottom_right": "Bottom\u00a0right",
};

function headsetModeToConfig(headsetMode: HeadsetModeOption, joystickMode: boolean): Partial<Config> {
    switch (headsetMode) {
        case "virtual_display":
            return { disabled: false, output_mode: "external_only", external_mode: "virtual_display" }
        case "vr_lite":
            return { disabled: false, output_mode: joystickMode ? "joystick" : "mouse" }
        case "sideview":
            return { disabled: false, output_mode: "external_only", external_mode: "sideview" }
        case "disabled":
            return { disabled: true, external_mode: "none" }
    }
}

function configToHeadsetMode(config?: Config): HeadsetModeOption {
    if (!config || config.disabled || config.output_mode == "external_only" && config.external_mode == 'none') return "disabled"
    if (config.output_mode == "external_only" && config.external_mode != 'none') return config.external_mode
    return "vr_lite"
}

const ModeNotchLabels: NotchLabel[] = [
    {
        label: "Virtual display",
        notchIndex: 0
    },
    {
        label: "VR\u2011Lite",
        notchIndex: 1
    },
    {
        label: "Sideview",
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
    const [isJoystickMode, setJoystickMode] = useState<boolean>(false);
    const [driverState, setDriverState] = useState<DriverState>();
    const [dirtyControlFlags, setDirtyControlFlags] = useState<DirtyControlFlags>({});
    const [installationStatus, setInstallationStatus] = useState<InstallationStatus>("checking");
    const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
    const [error, setError] = useState<string>();

    async function retrieveConfig() {
        const configRes: ServerResponse<Config> = await serverAPI.callPluginMethod<{}, Config>("retrieve_config", {});
        if (configRes.success) {
            setConfig(configRes.result);
            if (configRes.result.output_mode == "joystick") setJoystickMode(true);
        } else {
            setError(configRes.result);
        }
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

    const deviceConnected = !!driverState?.connected_device_brand && !!driverState?.connected_device_model
    const deviceName = deviceConnected ? `${driverState?.connected_device_brand} ${driverState?.connected_device_model}` : "No device connected"
    const headsetMode: HeadsetModeOption = configToHeadsetMode(config)
    const isDisabled = !deviceConnected || headsetMode == "disabled"
    const isVirtualDisplayMode = !isDisabled && headsetMode == "virtual_display"
    const isSideviewMode = !isDisabled && headsetMode == "sideview"
    const isVrLiteMode = !isDisabled && headsetMode == "vr_lite"
    let sbsModeEnabled = driverState?.sbs_mode_enabled ?? false
    if (dirtyControlFlags?.sbs_mode && dirtyControlFlags?.sbs_mode !== 'unset') sbsModeEnabled = dirtyControlFlags.sbs_mode === 'enable'
    const calibrating = dirtyControlFlags.recalibrate || driverState?.calibration_state == "CALIBRATING";

    const enableSbsButton = <PanelSectionRow>
        <ToggleField
            checked={sbsModeEnabled}
            label={"Enable side-by-side mode"}
            description={!driverState?.sbs_mode_enabled && "Adjust virtual display depth. View 3D content."}
            onChange={(sbs_mode_enabled) => writeControlFlags(
                {
                    sbs_mode: sbs_mode_enabled ? 'enable' : 'disable'
                }
            )}/>
    </PanelSectionRow>;

    const joystickModeButton = <PanelSectionRow>
        <ToggleField
            checked={isJoystickMode}
            label={"Joystick mode"}
            description={"Try as a last resort if your game doesn't support mouse-look."}
            onChange={(joystickMode) => {
                if (config) {
                    updateConfig({
                        ...config,
                        ...headsetModeToConfig(headsetMode, joystickMode)
                    }).catch(e => setError(e))
                }
                setJoystickMode(joystickMode)
            }}/>
    </PanelSectionRow>;

    const advancedSettings = [
        isVrLiteMode && !isJoystickMode && joystickModeButton,
        isVirtualDisplayMode && driverState?.sbs_mode_supported && !driverState?.sbs_mode_enabled && enableSbsButton,
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

    function showMenu() {
        showContextMenu(
            <Menu label={"Sideview display position"}>
                {SideviewPositions.map((position) => (
                    <MenuItem
                        key={position}
                        onClick={() => {
                            if (config) {
                                updateConfig({
                                    ...config,
                                    sideview_position: position
                                }).catch(e => setError(e))
                            }
                        }}
                        selected={config?.sideview_position == position}
                    >
                        {SideviewPositionDescriptions[position]}
                    </MenuItem>
                ))}
            </Menu>
        );
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
                    <PanelSection>
                        <PanelSectionRow style={{fontSize: 'medium', textAlign: 'center'}}>
                            <Field padding={'none'} childrenContainerWidth={'max'}>
                                <span style={{color: deviceConnected ? 'white' : 'gray'}}>
                                    {deviceName}
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
                            <SliderField description={HeadsetModeDescriptions[headsetMode]}
                                         value={HeadsetModeOptions.indexOf(headsetMode)}
                                         notchTicksVisible={true}
                                         min={0} max={HeadsetModeOptions.length-1}
                                         notchLabels={ModeNotchLabels}
                                         notchCount={HeadsetModeOptions.length}
                                         onChange={(newMode) => {
                                             if (config) {
                                                 updateConfig({
                                                     ...config,
                                                     ...headsetModeToConfig(HeadsetModeOptions[newMode], isJoystickMode)
                                                 }).catch(e => setError(e))
                                             }
                                         }}
                            />
                        </PanelSectionRow>}
                        {isVrLiteMode && isJoystickMode && joystickModeButton}
                        {isVrLiteMode && !isJoystickMode && <PanelSectionRow>
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
                        {isSideviewMode && <Fragment>
                            <ButtonFieldSmall label={"Display position"} onClick={showMenu} buttonText={SideviewPositionDescriptions[config.sideview_position]} />
                            <PanelSectionRow>
                                <SliderField value={config.sideview_display_size}
                                             min={0.2} max={1.0}
                                             notchCount={2}
                                             notchTicksVisible={false}
                                             label={"Display size"}
                                             notchLabels={[
                                                 {label: "Smallest", notchIndex: 0},
                                                 {label: "Biggest", notchIndex: 1},
                                             ]}
                                             step={0.05}
                                             onChange={(sideview_display_size) => {
                                                 if (config) {
                                                     updateConfig({
                                                         ...config,
                                                         sideview_display_size
                                                     }).catch(e => setError(e))
                                                 }
                                             }}
                                />
                            </PanelSectionRow>
                        </Fragment>}
                        {isVirtualDisplayMode && <Fragment>
                            <PanelSectionRow>
                                <SliderField value={sbsModeEnabled ? config.sbs_display_size : config.display_zoom}
                                             min={0.25} max={2.5}
                                             notchCount={10}
                                             notchLabels={DisplayZoomNotchLabels}
                                             label={"Display size"}
                                             description={sbsModeEnabled && "Display distance setting also affects perceived display size."}
                                             step={0.05}
                                             editableValue={true}
                                             onChange={(zoom) => {
                                                 if (config) {
                                                     // Change different underlying properties depending on whether SBS is enabled.
                                                     // This makes it "remember" the last value used for each mode.
                                                     updateConfig({
                                                         ...config,
                                                         display_zoom: sbsModeEnabled ? config.display_zoom : zoom,
                                                         sbs_display_size: sbsModeEnabled ? zoom : config.sbs_display_size
                                                     }).catch(e => setError(e))
                                                 }
                                             }}
                                />
                            </PanelSectionRow>
                            {driverState?.sbs_mode_enabled && <PanelSectionRow>
                                <SliderField value={config.sbs_display_distance}
                                             min={0.25} max={2.5}
                                             notchCount={10}
                                             notchLabels={DisplayDisanceNotchLabels}
                                             label={"Display distance"}
                                             description={"Adjust perceived display depth for eye comfort."}
                                             step={0.05}
                                             editableValue={true}
                                             onChange={(sbs_display_distance) => {
                                                 if (config) {
                                                     updateConfig({
                                                         ...config,
                                                         sbs_display_distance
                                                     }).catch(e => setError(e))
                                                 }
                                             }}
                                />
                            </PanelSectionRow>}
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
                        {
                            // Always show this button if SBS is enabled, so that the user can disable it through the UI.
                            // Once disabled, it will disappear entirely if not in virtual display mode.
                            driverState?.sbs_mode_enabled && enableSbsButton
                        }
                        {isVirtualDisplayMode && driverState?.sbs_mode_enabled && <Fragment>
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
                        </Fragment>}
                        {!isDisabled && <Fragment>
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
                        </Fragment>}
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
                                {driverState.connected_device_brand === 'XREAL' && <Fragment>
                                    Didn't need to buy a Beam?
                                    <img
                                        src={beam}
                                        style={{
                                            position: 'relative',
                                            top: '6px',
                                            left: '4px',
                                            width: '15px',
                                            height: 'auto',
                                            alignSelf: 'center',
                                        }}
                                    />
                                    <br/>
                                    <span style={{color:'white', fontWeight: 'bold'}}>
                                        Give $20 in support. Keep $99.
                                    </span>
                                </Fragment> || <Fragment>
                                    Want more great stuff like this?<br/>
                                    <span style={{color:'white', fontWeight: 'bold'}}>
                                        Become a <SiKofi style={{position: 'relative', top: '2px'}} color={"red"} /> supporter!
                                    </span>
                                </Fragment>}
                            </span>
                        </QrButton>}
                        <QrButton icon={<SiDiscord />} url={"https://discord.gg/GRQcfR5h9c"}>
                            <span style={{fontSize: 'small'}}>
                                News. Discussions. Help.<br/>
                                <span style={{color:'white', fontWeight: 'bold'}}>Join the chat!</span>
                            </span>
                        </QrButton>
                    </PanelSection> ||
                    <PanelSection>
                        <PanelSectionRow>
                            <Spinner style={{height: '48px'}} />
                            {installationStatus == "inProgress" &&
                                <span>Installing...</span>
                            }
                        </PanelSectionRow>
                    </PanelSection>
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
