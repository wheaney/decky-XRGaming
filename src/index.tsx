import {
    ButtonItem,
    definePlugin, 
    DropdownItem,
    Field,
    NotchLabel,
    PanelSection,
    PanelSectionRow,
    SliderField,
    Spinner,
    staticClasses,
    ToggleField
} from "@decky/ui";
import {call} from "@decky/api";
// @ts-ignore
import React, {
    Fragment,
    useEffect,
    useState,
    VFC
} from "react";
import {FaGlasses} from "react-icons/fa";
import {BiMessageError} from "react-icons/bi";
import { PiPlugsConnected } from "react-icons/pi";
import { TbPlugConnectedX } from "react-icons/tb";
import {SiDiscord} from 'react-icons/si';
import {LuHelpCircle} from 'react-icons/lu';
import QrButton from "./QrButton";
import {onChangeTutorial} from "./tutorials";
import {useStableState} from "./stableState";
import {featureDetails, License, secondsRemaining, timeRemainingText} from "./license";
import {RefreshLicenseResponse} from "./SupporterTierModal";
import { useShowSupporterTierDetails, supporterTierDetails, SupporterTierStatus } from "./SupporterTierStatus";
import { SupporterTierFeatureLabel } from "./SupporterTierFeatureLabel";

interface Config {
    disabled: boolean;
    gamescope_reshade_wayland_disabled: boolean;
    output_mode: OutputMode;
    external_mode: ExternalMode[];
    vr_lite_invert_x: boolean;
    vr_lite_invert_y: boolean;
    mouse_sensitivity: number;
    display_zoom: number;
    look_ahead: number;
    sbs_display_size: number;
    sbs_display_distance: number;
    sbs_content: boolean;
    sbs_mode_stretched: boolean;
    sideview_position: SideviewPosition;
    sideview_display_size: number;
    virtual_display_smooth_follow_enabled: boolean;
    sideview_smooth_follow_enabled: boolean;
    sideview_follow_threshold: number;
    curved_display: boolean;
    multi_tap_enabled: boolean;
    smooth_follow_track_roll: boolean;
    smooth_follow_track_pitch: boolean;
    smooth_follow_track_yaw: boolean;
    ui_view: {
        headset_mode: HeadsetModeOption;
        is_joystick_mode: boolean;
    }
}

interface DriverState {
    heartbeat: number;
    connected_device_brand: string;
    connected_device_model: string;
    calibration_setup: CalibrationSetup;
    calibration_state: CalibrationState;
    sbs_mode_enabled: boolean;
    sbs_mode_supported: boolean;
    firmware_update_recommended: boolean;
    is_gamescope_reshade_ipc_connected: boolean;
    device_license: License;
}

interface ControlFlags {
    recenter_screen: boolean;
    recalibrate: boolean;
    sbs_mode: SbsModeControl;
    refresh_device_license: boolean
}

type DirtyControlFlags = {
    last_updated?: number;
} & Partial<ControlFlags>

type InstallationStatus = "checking" | "inProgress" | "installed";
type OutputMode = "mouse" | "joystick" | "external_only";
type ExternalMode = 'virtual_display' | 'sideview' | 'none';
type HeadsetModeOption = "virtual_display" | "vr_lite" | "sideview" | "disabled";
type CalibrationSetup = "AUTOMATIC" | "INTERACTIVE";
type CalibrationState = "NOT_CALIBRATED" | "CALIBRATING" | "CALIBRATED" | "WAITING_ON_USER";
type SbsModeControl = "unset" | "enable" | "disable";
type SideviewPosition = "center" | "top_left" | "top_right" | "bottom_left" | "bottom_right";
const ManagedExternalModes: ExternalMode[] = ['virtual_display', 'sideview', 'none'];
const SideviewPositions: SideviewPosition[] = ["center", "top_left", "top_right", "bottom_left", "bottom_right"];
const DirtyControlFlagsExpireMilliseconds = 3000;

const HeadsetModeDescriptions: {[key in HeadsetModeOption]: string} = {
    "virtual_display": "Virtual display is only available in-game.",
    "vr_lite": "Use Head movements to look around in-game.",
    "sideview": "Display follow, sizing, and positioning.",
    "disabled": "Static display with no head-tracking."
};
const HeadsetModeOptions: HeadsetModeOption[] =  Object.keys(HeadsetModeDescriptions) as HeadsetModeOption[];

const SideviewPositionDescriptions: {[key in SideviewPosition]: string} = {
    "center": "Center",
    "top_left": "Top\u00a0left",
    "top_right": "Top\u00a0right",
    "bottom_left": "Bottom\u00a0left",
    "bottom_right": "Bottom\u00a0right"
};

const HeadsetModeConfirmationTimeoutMs = 1000

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
        label: "Follow",
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
        notchIndex: 8
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
        notchIndex: 8
    }
];

const LookAheadNotchLabels: NotchLabel[] = [
    {
        label: "Default",
        notchIndex: 0
    },
    {
        label: "Lower",
        notchIndex: 2
    },
    {
        label: "Higher",
        notchIndex: 9
    }
];

const FollowThresholdUpperNotchLabels: NotchLabel[] = [
    {label: "0.5", notchIndex: 0, value: 0.5},
    {label: "5", notchIndex: 1, value: 5},
    {label: "10", notchIndex: 2, value: 10},
    {label: "15", notchIndex: 3, value: 15},
    {label: "20", notchIndex: 4, value: 20},
    {label: "25", notchIndex: 5, value: 25},
    {label: "30", notchIndex: 6, value: 30},
    {label: "35", notchIndex: 7, value: 35},
    {label: "40", notchIndex: 8, value: 40},
    {label: "45", notchIndex: 9, value: 45}
];
const WidescreenFollowThresholdUpperNotchLabels: NotchLabel[] = [
    {label: "-20", notchIndex: 0, value: -20},
    {label: "-10", notchIndex: 1, value: -10},
    {label: "0", notchIndex: 2, value: 0},
    {label: "10", notchIndex: 3, value: 10},
    {label: "20", notchIndex: 4, value: 20},
    {label: "30", notchIndex: 5, value: 30},
    {label: "40", notchIndex: 6, value: 40}
];

const Content: VFC = () => {
    const [config, setConfig] = useState<Config>();
    const [isJoystickMode, setJoystickMode] = useState<boolean>(false);
    const [driverState, setDriverState] = useState<DriverState>();
    const [dirtyControlFlags, setDirtyControlFlags] = useState<DirtyControlFlags>({});
    const [installationStatus, setInstallationStatus] = useState<InstallationStatus>("checking");
    const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
    const [error, setError] = useState<string>();
    const [dontShowAgainKeys, setDontShowAgainKeys] = useState<string[]>([]);
    const [dirtyHeadsetMode, stableHeadsetMode, setDirtyHeadsetMode] = useStableState<HeadsetModeOption | undefined>(undefined, HeadsetModeConfirmationTimeoutMs);

    async function refreshConfig() {
        try {
            const configRes = await call<[], Config>("retrieve_config");
            setConfig(configRes);
            if (configRes.output_mode == "joystick") setJoystickMode(true);
        } catch (e) {
            setError((e as Error).message);
        }
    }

    async function retrieveDriverState(): Promise<DriverState> {
        return call<[], DriverState>("retrieve_driver_state");
    }

    // have this function call itself every second to keep the UI up to date
    async function refreshDriverState() {
        try {
            setDriverState(await retrieveDriverState());
        } catch (e) {
            setError((e as Error).message);
        }

        setTimeout(() => {
            refreshDriverState().catch((err) => setError(err));
        }, 1000);
    }

    async function refreshDontShowAgainKeys() {
        try {
            setDontShowAgainKeys(await call<[], string[]>("retrieve_dont_show_again_keys"));
        } catch (e) {
            setError((e as Error).message);
        }
    }

    async function checkInstallation() {
        setInstallationStatus("inProgress");
        try {
            if (!await call<[], boolean>("is_breezy_installed_and_running")) {
                setInstallationStatus("inProgress")
                if (!await call<[], boolean>("install_breezy")) {
                    throw Error("There was an error during setup. Try restarting your Steam Deck. If " +
                                "the error persists, please file an issue in the decky-XRGaming GitHub " + 
                                "repository.");
                }
            }
            setInstallationStatus("installed");
        } catch (e) {
            setError((e as Error).message);
        }
    }

    async function writeConfig(newConfig: Config) {
        try {
            setConfig(await call<[ config: Config ], Config>("write_config", newConfig));
        } catch (e) {
            setError((e as Error).message);
            return refreshConfig();
        }
    }

    async function writeControlFlags(flags: Partial<ControlFlags>) {
        try {
            await call<[ control_flags: Partial<ControlFlags> ], void>("write_control_flags", flags);
            setDirtyControlFlags({...flags, last_updated: Date.now()})
        } catch (e) {
            setError((e as Error).message);
        }
    }

    async function setDontShowAgain(key: string) {
        try {
            await call<[ key: string ], boolean>("set_dont_show_again", key);
            setDontShowAgainKeys([...dontShowAgainKeys, key]);
        } catch (e) {
            setError((e as Error).message);
        }
    }

    async function resetDontShowAgain() {
        try {
            await call<[], boolean>("reset_dont_show_again");
            setDontShowAgainKeys([]);
        } catch (e) {
            setError((e as Error).message);
        }
    }

    async function requestToken(email: string): Promise<boolean> {
        try {
            return call<[ email: string ], boolean>("request_token", email);
        } catch (e) {
            setError((e as Error).message);
        }

        return false;
    }

    async function verifyToken(token: string): Promise<boolean> {
        try {
            return call<[ token: string ], boolean>("verify_token", token);
        } catch (e) {
            setError((e as Error).message);
        }

        return false;
    }

    async function refreshLicense(): Promise<RefreshLicenseResponse> {
        await writeControlFlags({
            refresh_device_license: true
        });

        return new Promise((resolve, reject) => {
            setTimeout(async () => {
                try {
                    const latestState = await retrieveDriverState();
                    const remaining = latestState?.device_license?.tiers?.supporter?.fundsToRenew ? Infinity : secondsRemaining(latestState?.device_license?.tiers?.supporter?.endDate);
                    const remainingText = timeRemainingText(remaining);
                    resolve({
                        licensePresent: !!latestState?.device_license,
                        confirmedToken: latestState?.device_license?.confirmedToken,
                        timeRemainingText: remainingText,
                        fundsNeeded: latestState?.device_license?.tiers?.supporter?.fundsNeededUSD,
                        lifetimeFundsNeeded: latestState?.device_license?.tiers?.supporter?.lifetimeFundsNeededUSD,
                        isRenewed: (latestState?.device_license?.tiers?.supporter?.active ?? false) && !remainingText
                    })
                } catch (e) {
                    reject((e as Error).message)
                }
            }, 3000)
        })
    }

    // these asynchronous calls should execute ONLY one time, hence the empty array as the second argument
    useEffect(() => {
        refreshConfig().catch((err) => setError(err));
        checkInstallation().catch((err) => setError(err));
        refreshDriverState().catch((err) => setError(err));
        refreshDontShowAgainKeys().catch((err) => setError(err));
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

    // this effect will be triggered after headsetMode has been stable for a certain period of time
    useEffect(() => {
        if (stableHeadsetMode && config && driverState) {
            onChangeTutorial(`headset_mode_${stableHeadsetMode}${isVulkanOnlyMode ? '_vulkan_only' : ''}`, driverState.connected_device_brand,
                driverState.connected_device_model, () => {
                updateConfig({
                    ...config,
                    ui_view: {
                        headset_mode: stableHeadsetMode,
                        is_joystick_mode: isJoystickMode
                    }
                }).catch(e => setError(e))
            }, dontShowAgainKeys, setDontShowAgain);
        }
    }, [stableHeadsetMode])

    const showSupporterTierDetailsFn = useShowSupporterTierDetails();

    const deviceConnected = !!driverState?.connected_device_brand && !!driverState?.connected_device_model
    const deviceName = deviceConnected ? `${driverState?.connected_device_brand} ${driverState?.connected_device_model}` : "No device connected"
    const headsetMode: HeadsetModeOption = dirtyHeadsetMode ?? config?.ui_view.headset_mode ?? "disabled"
    const isDisabled = !deviceConnected || headsetMode === "disabled"
    const isVirtualDisplayMode = !isDisabled && headsetMode === "virtual_display"
    const isSideviewMode = !isDisabled && headsetMode === "sideview"
    const isShaderMode = isVirtualDisplayMode || isSideviewMode;
    const isVrLiteMode = !isDisabled && headsetMode === "vr_lite"
    const otherExternalModes = (config?.external_mode ?? []).filter(mode => !ManagedExternalModes.includes(mode));
    const isOtherMode = deviceConnected && isDisabled && !(config?.disabled ?? true) && otherExternalModes.length > 0;
    const isOtherModeDisabled = deviceConnected && isDisabled && (config?.disabled ?? true) && otherExternalModes.length > 0;
    let sbsModeEnabled = driverState?.sbs_mode_enabled ?? false;
    if (dirtyControlFlags?.sbs_mode && dirtyControlFlags?.sbs_mode !== 'unset') sbsModeEnabled = dirtyControlFlags.sbs_mode === 'enable';
    const isVulkanOnlyMode = !driverState?.is_gamescope_reshade_ipc_connected;
    const isWidescreen = driverState?.sbs_mode_enabled && !isVulkanOnlyMode; // gamescope SBS mode is always widescreen
    const calibrating = dirtyControlFlags.recalibrate || driverState?.calibration_state === "CALIBRATING";
    const supporterTier = supporterTierDetails(driverState?.device_license);

    const smoothFollowFeature = featureDetails(driverState?.device_license, "smooth_follow");
    const smoothFollowEnabled = (config?.sideview_smooth_follow_enabled && smoothFollowFeature.enabled) ?? false;
    const sbsFeature = featureDetails(driverState?.device_license, "sbs");

    const sbsFirmwareUpdateNeeded = !driverState?.sbs_mode_supported && driverState?.firmware_update_recommended;
    let sbsDescription = "";
    if (sbsFirmwareUpdateNeeded) {
        sbsDescription = "Update your glasses' firmware to enable side-by-side mode.";
    } else if (!driverState?.sbs_mode_supported) {
        sbsDescription = "Your glasses do not currently support side-by-side mode.";
    } else if (!driverState?.sbs_mode_enabled) {
        sbsDescription = "Adjust display distance. View 3D content.";
    }
    const sbsLabel = "Enable side-by-side mode";
    const enableSbsButton = driverState && <PanelSectionRow>
        <ToggleField
            checked={sbsModeEnabled}
            disabled={!driverState?.sbs_mode_enabled && !driverState?.sbs_mode_supported}
            label={driverState?.sbs_mode_supported && 
                <SupporterTierFeatureLabel label={sbsLabel} feature={sbsFeature} /> ||
                sbsLabel}
            description={sbsDescription}
            onChange={(sbs_mode_enabled) => {
                if (sbs_mode_enabled && !sbsFeature.enabled) {
                    showSupporterTierDetailsFn(supporterTier, requestToken, verifyToken, refreshLicense);
                } else {
                    onChangeTutorial(`sbs_mode_enabled_${sbs_mode_enabled}${isVulkanOnlyMode ? '_vulkan_only' : ''}`, driverState!.connected_device_brand,
                        driverState!.connected_device_model, () => {
                            writeControlFlags(
                                {
                                    sbs_mode: sbs_mode_enabled ? 'enable' : 'disable'
                                }
                            )
                        }, dontShowAgainKeys, setDontShowAgain
                    )
                }
            }}
        />
    </PanelSectionRow>;

    const sbsDisplayDistanceSlider = <PanelSectionRow>
        <SliderField value={config?.sbs_display_distance ?? 1.0}
                    min={0.1} max={2.5}
                    notchCount={9}
                    notchLabels={DisplayDisanceNotchLabels}
                    label={"Display distance"}
                    description={"Adjust perceived display depth for eye comfort."}
                    step={0.01}
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
                        ui_view: {
                            headset_mode: "vr_lite",
                            is_joystick_mode: joystickMode
                        }
                    }).catch(e => setError(e))
                }
                setJoystickMode(joystickMode)
            }}/>
    </PanelSectionRow>;

    const advancedSettings = [
        isVrLiteMode && !isJoystickMode && joystickModeButton,
        isSideviewMode && <Fragment>
            <PanelSectionRow>
                <ToggleField
                    checked={config?.smooth_follow_track_yaw ?? true}
                    label={"Horizontal follow"}
                    description={"Smooth follow will track horizontal movements."}
                    onChange={(smooth_follow_track_yaw) => {
                        if (config) {
                            updateConfig({
                                ...config,
                                smooth_follow_track_yaw
                            }).catch(e => setError(e))
                        }
                    }}
                />
            </PanelSectionRow>
            <PanelSectionRow>
                <ToggleField
                    checked={config?.smooth_follow_track_pitch ?? true}
                    label={"Vertical follow"}
                    description={"Smooth follow will track vertical movements."}
                    onChange={(smooth_follow_track_pitch) => {
                        if (config) {
                            updateConfig({
                                ...config,
                                smooth_follow_track_pitch
                            }).catch(e => setError(e))
                        }
                    }}
                />
            </PanelSectionRow>
            <PanelSectionRow>
                <ToggleField
                    checked={config?.smooth_follow_track_roll ?? false}
                    label={"Tilt/roll follow"}
                    description={"Smooth follow will track roll/tilt movements."}
                    onChange={(smooth_follow_track_roll) => {
                        if (config) {
                            updateConfig({
                                ...config,
                                smooth_follow_track_roll
                            }).catch(e => setError(e))
                        }
                    }}
                />
            </PanelSectionRow>
        </Fragment>,
        isShaderMode && !driverState?.sbs_mode_enabled && enableSbsButton,
        isVirtualDisplayMode && <PanelSectionRow>
            <SliderField value={config?.look_ahead ?? 0}
                         min={0} max={45} notchTicksVisible={true}
                         notchCount={10} notchLabels={LookAheadNotchLabels}
                         step={3}
                         label={"Movement look-ahead"}
                         description={(config?.look_ahead ?? 0) > 0 ? "Use Default unless screen is noticeably ahead or behind your movements. May introduce jitter at higher values." : undefined}
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
            <ToggleField
                checked={config?.multi_tap_enabled ?? false}
                label={"Multi-tap enabled"}
                description={"Enable double-tap to recenter and triple-tap to recalibrate."}
                onChange={(multi_tap_enabled) => {
                    if (config) {
                        updateConfig({
                            ...config,
                            multi_tap_enabled
                        }).catch(e => setError(e))
                    }
                }}
            />
        </PanelSectionRow>,
        <PanelSectionRow>
            <ButtonItem disabled={calibrating}
                        description={config?.multi_tap_enabled ? "Or triple-tap your headset." : undefined}
                        layout="below"
                        onClick={() => writeControlFlags({recalibrate: true})} >
                {calibrating ?
                    <span><Spinner style={{height: '16px', marginRight: 10}} />Calibrating headset</span> :
                    "Recalibrate headset"
                }
            </ButtonItem>
        </PanelSectionRow>,
        isShaderMode && <PanelSectionRow>
            <ToggleField
                checked={config?.gamescope_reshade_wayland_disabled ?? false}
                label={"Disable gamescope integration"}
                description={"XR effects will only apply to Vulkan games"}
                onChange={(disabled) => {
                    if (config) {
                        updateConfig({
                            ...config,
                            gamescope_reshade_wayland_disabled: disabled
                        }).catch(e => setError(e))
                    }
                }}
            />
        </PanelSectionRow>,
        isShaderMode && dontShowAgainKeys.length && <PanelSectionRow>
            <ButtonItem description={"Clear your \"Don't show again\" settings."} layout="below" onClick={() => resetDontShowAgain()}>
                Show all guides
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
                <PanelSectionRow>
                    <div style={{backgroundColor: "pink", borderColor: "red", color: "red"}}>
                        <BiMessageError/>{error}
                    </div>
                </PanelSectionRow>
            </PanelSection>}
            {!error && <Fragment>
                {installationStatus == "installed" && driverState && config &&
                    <PanelSection>
                        <PanelSectionRow>
                            <Field padding={'none'} childrenContainerWidth={'max'}>
                                <div  style={{fontSize: 'medium', textAlign: 'center'}}>
                                    <span style={{color: deviceConnected ? 'white' : 'gray'}}>
                                        {deviceName}
                                    </span>
                                    {deviceConnected && <span style={{marginLeft: 5, color: 'green'}}>
                                        connected
                                    </span>}
                                    <span style={{marginLeft: 7, color: deviceConnected ? 'green' : 'red', position: 'relative', top: '3px'}}>
                                        {deviceConnected ? <PiPlugsConnected /> : <TbPlugConnectedX />}
                                    </span>
                                </div>
                            </Field>
                        </PanelSectionRow>
                        {deviceConnected && <PanelSectionRow>
                            <SliderField description={HeadsetModeDescriptions[headsetMode]}
                                         value={HeadsetModeOptions.indexOf(headsetMode)}
                                         notchTicksVisible={true}
                                         min={0} max={HeadsetModeOptions.length-1}
                                         notchLabels={ModeNotchLabels}
                                         notchCount={HeadsetModeOptions.length}
                                         onChange={(newMode) => setDirtyHeadsetMode(HeadsetModeOptions[newMode])}
                            />
                        </PanelSectionRow>}
                        {isShaderMode && isVulkanOnlyMode && <PanelSectionRow>
                            <Field padding={'none'} childrenContainerWidth={'max'}>
                                <div style={{textAlign: 'center'}}>
                                    <span style={{color: "#946d00", fontWeight: "bold"}}>
                                        Vulkan-only mode
                                    </span><br/>
                                    XR effects will only apply in-game
                                </div>
                            </Field>
                        </PanelSectionRow>}
                        {isOtherMode && <Fragment>
                            <PanelSectionRow>
                                <Field padding={'none'} childrenContainerWidth={'max'}>
                                    An external application may be using your headset data: <b>{otherExternalModes.join(", ")}</b>.
                                </Field>
                            </PanelSectionRow>
                            <PanelSectionRow>
                                <ButtonItem description={"Disables external access to headset data"}
                                            layout="below"
                                            onClick={() => writeConfig({ 
                                                ...config, 
                                                disabled: true
                                            })} >
                                    Disable data broadcast
                                </ButtonItem>
                            </PanelSectionRow>
                        </Fragment> || isOtherModeDisabled && <Fragment>
                            <PanelSectionRow>
                                <Field padding={'none'} childrenContainerWidth={'max'}>
                                    An external application may be trying to use your headset data: <b>{otherExternalModes.join(", ")}</b>.
                                </Field>
                            </PanelSectionRow>
                            <PanelSectionRow>
                                <ButtonItem description={"Allows for external access to headset data"}
                                            layout="below"
                                            onClick={() => writeConfig({ 
                                                ...config, 
                                                disabled: false
                                            })} >
                                    Enable data broadcast
                                </ButtonItem>
                            </PanelSectionRow>
                        </Fragment>}
                        {!isDisabled && isVrLiteMode && isJoystickMode && joystickModeButton}
                        {!isDisabled && isVrLiteMode && !isJoystickMode && <PanelSectionRow>
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
                        {!isDisabled && isVrLiteMode && <PanelSectionRow>
                            <ToggleField
                                checked={config?.vr_lite_invert_x ?? false}
                                label={"Invert X-axis"}
                                description={"Inverts X-axis movements in VR-Lite mode."}
                                onChange={(vr_lite_invert_x) => {
                                    if (config) {
                                        updateConfig({
                                            ...config,
                                            vr_lite_invert_x
                                        }).catch(e => setError(e))
                                    }
                                }}
                            />
                        </PanelSectionRow>}
                        {!isDisabled && isVrLiteMode && <PanelSectionRow>
                            <ToggleField
                                checked={config?.vr_lite_invert_y ?? false}
                                label={"Invert Y-axis"}
                                description={"Inverts Y-axis movements in VR-Lite mode."}
                                onChange={(vr_lite_invert_y) => {
                                    if (config) {
                                        updateConfig({
                                            ...config,
                                            vr_lite_invert_y
                                        }).catch(e => setError(e))
                                    }
                                }}
                            />
                        </PanelSectionRow>}
                        {isSideviewMode && <Fragment>
                            <PanelSectionRow>
                                <DropdownItem label={"Display position"}
                                              rgOptions={SideviewPositions.map((position) => ({
                                                  label: SideviewPositionDescriptions[position],
                                                  data: position
                                              }))}
                                              onChange={(selection) => {
                                                  if (config) {
                                                      const position = selection.data;
                                                      let displaySize = config.sideview_display_size;
                                                      if (position != "center" && displaySize == 1.0) {
                                                          displaySize = 0.5;
                                                      }
                                                      updateConfig({
                                                          ...config,
                                                          sideview_position: position,
                                                          sideview_display_size: displaySize
                                                      }).catch(e => setError(e))
                                                  }
                                              }}
                                              menuLabel={SideviewPositionDescriptions[config?.sideview_position]}
                                              selectedOption={config?.sideview_position} />
                            </PanelSectionRow>
                            <PanelSectionRow>
                                <ToggleField
                                    checked={smoothFollowEnabled}
                                    label={<SupporterTierFeatureLabel label="Smooth follow" 
                                                                      feature={smoothFollowFeature} />}
                                    description={"Display movements are more elastic"}
                                    onChange={(sideview_smooth_follow_enabled) => {
                                        if (!smoothFollowFeature.enabled) {
                                            showSupporterTierDetailsFn(supporterTier, requestToken, verifyToken, refreshLicense);
                                        } else if (config) {
                                            updateConfig({
                                                ...config,
                                                sideview_smooth_follow_enabled
                                            }).catch(e => setError(e))
                                        }
                                    }}/>
                            </PanelSectionRow>
                            {smoothFollowEnabled && <PanelSectionRow>
                                <SliderField value={Math.max(isWidescreen ? -20 : 0.5, config.sideview_follow_threshold)}
                                             min={isWidescreen ? -20 : 0.5} max={isWidescreen ? 40 : 45}
                                             notchCount={isWidescreen ? 
                                                WidescreenFollowThresholdUpperNotchLabels.length : 
                                                FollowThresholdUpperNotchLabels.length}
                                             notchTicksVisible={false}
                                             label={"Smooth follow threshold"}
                                             description={"How closely the display follows you"}
                                             notchLabels={isWidescreen ? 
                                                WidescreenFollowThresholdUpperNotchLabels : 
                                                FollowThresholdUpperNotchLabels}
                                             step={0.5}
                                             editableValue={true}
                                             onChange={(sideview_follow_threshold) => {
                                                 if (config) {
                                                     updateConfig({
                                                         ...config,
                                                         sideview_follow_threshold
                                                     }).catch(e => setError(e))
                                                 }
                                             }}
                                />
                            </PanelSectionRow>}
                            <PanelSectionRow>
                                <SliderField value={config.sideview_display_size}
                                             min={0.1} max={smoothFollowEnabled ? 2.5 : 1.0}
                                             notchCount={smoothFollowEnabled ? 9 : 2}
                                             notchTicksVisible={smoothFollowEnabled}
                                             editableValue={smoothFollowEnabled}
                                             label={"Display size"}
                                             notchLabels={smoothFollowEnabled ? 
                                                DisplayZoomNotchLabels : 
                                                [
                                                    {label: "Smallest", notchIndex: 0},
                                                    {label: "Biggest", notchIndex: 1},
                                                ]
                                             }
                                             step={0.01}
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
                            {driverState?.sbs_mode_enabled && sbsDisplayDistanceSlider}
                        </Fragment>}
                        {isVirtualDisplayMode && <Fragment>
                            <PanelSectionRow>
                                <ToggleField
                                    checked={config.virtual_display_smooth_follow_enabled && smoothFollowFeature.enabled}
                                    label={<SupporterTierFeatureLabel label="Automatic recentering" 
                                                                      feature={smoothFollowFeature} />}
                                    description={"Recenter under certain conditions"}
                                    onChange={(virtual_display_smooth_follow_enabled) => {
                                        if (!smoothFollowFeature.enabled) {
                                            showSupporterTierDetailsFn(supporterTier, requestToken, verifyToken, refreshLicense);
                                        } else if (config) {
                                            updateConfig({
                                                ...config,
                                                virtual_display_smooth_follow_enabled
                                            }).catch(e => setError(e))
                                        }
                                    }}/>
                            </PanelSectionRow>
                            <PanelSectionRow>
                                <SliderField value={sbsModeEnabled ? config.sbs_display_size : config.display_zoom}
                                             min={0.1} max={2.5}
                                             notchCount={9}
                                             notchLabels={DisplayZoomNotchLabels}
                                             label={"Display size"}
                                             description={sbsModeEnabled && "Display distance setting also affects perceived display size."}
                                             step={0.01}
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
                            {driverState?.sbs_mode_enabled && sbsDisplayDistanceSlider}
                        </Fragment>}
                        {(isVirtualDisplayMode || isSideviewMode && smoothFollowEnabled) && <PanelSectionRow>
                            <ButtonItem disabled={calibrating || dirtyControlFlags.recenter_screen}
                                        description={!dirtyControlFlags.recenter_screen && config?.multi_tap_enabled ? "Or double-tap your headset." : undefined}
                                        layout="below"
                                        onClick={() => writeControlFlags({recenter_screen: true})} >
                                {calibrating ?
                                    <span><Spinner style={{height: '16px', marginRight: 10}} />Calibrating headset</span> :
                                    "Recenter display"
                                }
                            </ButtonItem>
                        </PanelSectionRow>}
                        {isShaderMode && <PanelSectionRow>
                            <ToggleField
                                checked={config?.curved_display ?? false}
                                label={"Curved display"}
                                description={"Wrap the display around your field of view."}
                                onChange={(curved_display) => {
                                    if (config) {
                                        updateConfig({
                                            ...config,
                                            curved_display
                                        }).catch(e => setError(e))
                                    }
                                }}/>
                        </PanelSectionRow>}
                        {
                            // Always show this button if SBS is enabled, so that the user can disable it through the UI.
                            // Once disabled, it will disappear entirely if not in virtual display mode.
                            driverState?.sbs_mode_enabled && enableSbsButton
                        }
                        {driverState?.sbs_mode_enabled && <Fragment>
                            {isVulkanOnlyMode && <PanelSectionRow>
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
                            </PanelSectionRow>}
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
                        <SupporterTierStatus details={supporterTier} 
                                             requestTokenFn={requestToken}
                                             verifyTokenFn={verifyToken}
                                             refreshLicenseFn={refreshLicense} />
                        {isVirtualDisplayMode &&
                            <QrButton icon={<LuHelpCircle/>}
                                      url={"https://github.com/wheaney/decky-XRGaming#virtual-display-help"}
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
                                      url={"https://github.com/wheaney/decky-XRGaming#xr-gaming-plugin"}
                                      followLink={true}
                            >
                                Need help?
                            </QrButton>
                        }
                        <QrButton icon={<SiDiscord color={"#7289da"}/>} url={"https://discord.gg/GRQcfR5h9c"}>
                            <span style={{fontSize: 'small'}}>
                                News. Discussions. Help.<br/>
                                <span style={{color: 'white', fontWeight: 'bold'}}>Join the chat!</span>
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

export default definePlugin(() => {
    return {
        title: <div className={staticClasses.Title}>XR Gaming</div>,
        content: <Content />,
        icon: <FaGlasses/>
    };
});
