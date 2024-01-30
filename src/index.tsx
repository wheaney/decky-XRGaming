import {
    ButtonItem,
    definePlugin, DropdownItem,
    Field,
    gamepadDialogClasses,
    NotchLabel,
    PanelSection,
    PanelSectionRow,
    ServerAPI,
    ServerResponse,
    showModal,
    SliderField,
    Spinner,
    staticClasses,
    ToggleField
} from "decky-frontend-lib";
// @ts-ignore
import React, {
    Fragment, MutableRefObject,
    useEffect,
    useRef,
    useState,
    VFC
} from "react";
import {FaGlasses} from "react-icons/fa";
import {BiMessageError, BiSolidLock} from "react-icons/bi";
import { PiPlugsConnected } from "react-icons/pi";
import { TbPlugConnectedX } from "react-icons/tb";
import {SiDiscord} from 'react-icons/si';
import {LuHelpCircle, LuTimer} from 'react-icons/lu';
import QrButton from "./QrButton";
import {onChangeTutorial} from "./tutorials";
import {useStableState} from "./stableState";
import {featureEnabled, featureSubtext, License, secondsRemaining, timeRemainingText, trialTimeRemaining} from "./license";
import {BsFillSuitHeartFill} from "react-icons/bs";
import {RefreshLicenseResponse, SupporterTierModal} from "./SupporterTierModal";

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
    firmware_update_recommended: boolean;
    device_license: License
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
type OutputMode = "mouse" | "joystick" | "external_only"
type ExternalMode = 'virtual_display' | 'sideview' | 'none'
type HeadsetModeOption = "virtual_display" | "vr_lite" | "sideview" | "disabled"
type CalibrationSetup = "AUTOMATIC" | "INTERACTIVE"
type CalibrationState = "NOT_CALIBRATED" | "CALIBRATING" | "CALIBRATED" | "WAITING_ON_USER"
type SbsModeControl = "unset" | "enable" | "disable"
type SideviewPosition = "top_left" | "top_right" | "bottom_left" | "bottom_right" | "center"
const SideviewPositions: SideviewPosition[] = ["top_left", "top_right", "bottom_left", "bottom_right", "center"]
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
    "center": "Center"
};

function headsetModeToConfig(headsetMode: HeadsetModeOption, joystickMode: boolean): Partial<Config> {
    switch (headsetMode) {
        case "virtual_display":
            return { disabled: false, output_mode: "external_only", external_mode: "virtual_display" }
        case "vr_lite":
            return { disabled: false, output_mode: joystickMode ? "joystick" : "mouse", external_mode: "none" }
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
        notchIndex: 7
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
        notchIndex: 7
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

const Content: VFC<{ serverAPI: ServerAPI }> = ({serverAPI}) => {

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
        const configRes: ServerResponse<Config> = await serverAPI.callPluginMethod<{}, Config>("retrieve_config", {});
        if (configRes.success) {
            setConfig(configRes.result);
            if (configRes.result.output_mode == "joystick") setJoystickMode(true);
        } else {
            setError(configRes.result);
        }
    }

    async function retrieveDriverState(): Promise<DriverState> {
        const driverStateRes: ServerResponse<DriverState> = await serverAPI.callPluginMethod<{}, DriverState>("retrieve_driver_state", {});
        if (driverStateRes.success) {
            return driverStateRes.result;
        } else {
            throw Error(driverStateRes.result);
        }
    }

    // have this function call itself every second to keep the UI up to date
    async function refreshDriverState() {
        try {
            const driverState = await retrieveDriverState();
            setDriverState(driverState);
        } catch (e) {
            setError((e as Error).message);
        }

        setTimeout(() => {
            refreshDriverState().catch((err) => setError(err));
        }, 1000);
    }

    async function refreshDontShowAgainKeys() {
        const dontShowAgainKeysRes: ServerResponse<string[]> = await serverAPI.callPluginMethod<{}, string[]>("retrieve_dont_show_again_keys", {});
        if (dontShowAgainKeysRes.success) {
            setDontShowAgainKeys(dontShowAgainKeysRes.result);
        } else {
            setError(dontShowAgainKeysRes.result);
        }
    }

    async function checkInstallation() {
        setInstallationStatus("inProgress");
        const installedRes: ServerResponse<boolean> = await serverAPI.callPluginMethod<{}, boolean>("is_breezy_installed_and_running", {});
        if (installedRes.success) {
            if (installedRes.result) {
                setInstallationStatus("installed")
            } else {
                setInstallationStatus("inProgress")
                const installBreezyRes = await serverAPI.callPluginMethod<{}, boolean>("install_breezy", {});
                if (installBreezyRes.success && installBreezyRes.result)
                    setInstallationStatus("installed")
                else
                    setError("There was an error during setup. Try restarting your Steam Deck. " +
                        "If the error persists, please file an issue in the decky-XRGaming GitHub repository.")
            }
        } else {
            setError(installedRes.result);
        }
    }

    async function writeConfig(newConfig: Config) {
        const res = await serverAPI.callPluginMethod<{ config: Config }, void>("write_config", { config: newConfig });
        if (!res.success) {
            setError(res.result);
            await refreshConfig();
        }
    }

    async function writeControlFlags(flags: Partial<ControlFlags>) {
        const res = await serverAPI.callPluginMethod<{ control_flags: Partial<ControlFlags>}, void>("write_control_flags", { control_flags: flags });
        res.success ? setDirtyControlFlags({...flags, last_updated: Date.now()}) : setError(res.result);
    }

    async function setDontShowAgain(key: string) {
        const res = await serverAPI.callPluginMethod<{ key: string }, void>("set_dont_show_again", { key });
        if (res.success) {
            setDontShowAgainKeys([...dontShowAgainKeys, key]);
        } else {
            setError(res.result);
        }
    }

    async function resetDontShowAgain() {
        const res = await serverAPI.callPluginMethod<{}, void>("reset_dont_show_again", {});
        if (res.success) {
            setDontShowAgainKeys([]);
        } else {
            setError(res.result);
        }
    }

    async function requestToken(email: string) {
        const res = await serverAPI.callPluginMethod<{ email: string }, void>("request_token", { email });
        if (!res.success) {
            throw Error(res.result);
        } else {
            return res.result
        }
    }

    async function verifyToken(token: string) {
        const res = await serverAPI.callPluginMethod<{ token: string }, void>("verify_token", { token });
        if (!res.success) {
            throw Error(res.result);
        } else {
            return res.result
        }
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
                        confirmedToken: latestState?.device_license?.confirmedToken,
                        timeRemainingText: remainingText,
                        fundsNeeded: latestState?.device_license?.tiers?.supporter?.fundsNeededUSD,
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
            onChangeTutorial(`headset_mode_${stableHeadsetMode}`, driverState.connected_device_brand,
                driverState.connected_device_model, () => {
                updateConfig({
                    ...config,
                    ...headsetModeToConfig(stableHeadsetMode, isJoystickMode)
                }).catch(e => setError(e))
            }, dontShowAgainKeys, setDontShowAgain);
        }
    }, [stableHeadsetMode])

    const deviceConnected = !!driverState?.connected_device_brand && !!driverState?.connected_device_model
    const deviceName = deviceConnected ? `${driverState?.connected_device_brand} ${driverState?.connected_device_model}` : "No device connected"
    const headsetMode: HeadsetModeOption = dirtyHeadsetMode ?? configToHeadsetMode(config)
    const isDisabled = !deviceConnected || headsetMode == "disabled"
    const isVirtualDisplayMode = !isDisabled && headsetMode == "virtual_display"
    const isSideviewMode = !isDisabled && headsetMode == "sideview"
    const isVrLiteMode = !isDisabled && headsetMode == "vr_lite"
    let sbsModeEnabled = driverState?.sbs_mode_enabled ?? false
    if (dirtyControlFlags?.sbs_mode && dirtyControlFlags?.sbs_mode !== 'unset') sbsModeEnabled = dirtyControlFlags.sbs_mode === 'enable'
    const calibrating = dirtyControlFlags.recalibrate || driverState?.calibration_state == "CALIBRATING";
    const supporterTierSecondsRemaining = driverState?.device_license?.tiers?.supporter?.fundsToRenew ? Infinity : secondsRemaining(driverState?.device_license?.tiers?.supporter?.endDate);
    const supporterTierTimeRemainingText = timeRemainingText(supporterTierSecondsRemaining);
    const supporterTrialTimeRemaining = trialTimeRemaining(driverState?.device_license);
    const supporterTrialTimeRemainingText = timeRemainingText(supporterTrialTimeRemaining);
    const supporterTierActive = driverState?.device_license?.tiers?.supporter?.active && supporterTierSecondsRemaining > 0;

    const sbsFirmwareUpdateNeeded = !driverState?.sbs_mode_supported && driverState?.firmware_update_recommended;
    const sbsFeatureEnabled = featureEnabled(driverState?.device_license, "sbs");
    const sbsSubtext = featureSubtext(driverState?.device_license, "sbs");
    const enableSbsButton = driverState && <PanelSectionRow>
        <ToggleField
            checked={sbsModeEnabled}
            disabled={!driverState?.sbs_mode_enabled && (!driverState?.sbs_mode_supported)}
            label={<span>
                Enable side-by-side mode{sbsSubtext && <Fragment><br/>
                    <span className={gamepadDialogClasses.FieldDescription} style={{fontStyle: 'italic'}}>
                        {!sbsFeatureEnabled && <BiSolidLock style={{position: 'relative', top: '1px', left: '-3px'}} />}
                        {sbsSubtext}
                    </span>
                </Fragment>}
            </span>}
            description={sbsFirmwareUpdateNeeded ? "Update your glasses' firmware to enable side-by-side mode." :
                (!driverState?.sbs_mode_enabled && "Adjust display distance. View 3D content.")}
            onChange={(sbs_mode_enabled) => {
                if (sbs_mode_enabled && !sbsFeatureEnabled) {
                    showSupporterTierDetails();
                } else {
                    onChangeTutorial(`sbs_mode_enabled_${sbs_mode_enabled}`, driverState!.connected_device_brand,
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
        isVirtualDisplayMode && !driverState?.sbs_mode_enabled && enableSbsButton,
        config && isVirtualDisplayMode && <PanelSectionRow>
            <SliderField value={config.look_ahead}
                         min={0} max={45} notchTicksVisible={true}
                         notchCount={10} notchLabels={LookAheadNotchLabels}
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
        </PanelSectionRow>,
        isVirtualDisplayMode && dontShowAgainKeys.length && <PanelSectionRow>
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

    const supporterTierModalCloseRef: MutableRefObject<(() => void) | undefined> = useRef<() => void>();
    function showSupporterTierDetails() {
        const modalResult = showModal(
            <SupporterTierModal confirmedToken={driverState?.device_license?.confirmedToken}
                                timeRemainingText={supporterTierTimeRemainingText}
                                fundsNeeded={driverState?.device_license?.tiers?.supporter?.fundsNeededUSD}
                                requestTokenFn={requestToken}
                                verifyTokenFn={verifyToken}
                                refreshLicenseFn={refreshLicense}
                                supporterTierModalCloseRef={supporterTierModalCloseRef}
            />,
            window
        );
        supporterTierModalCloseRef.current = modalResult.Close;
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
                                         onChange={(newMode) => setDirtyHeadsetMode(HeadsetModeOptions[newMode])}
                            />
                        </PanelSectionRow>}
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
                        {isSideviewMode && <Fragment>
                            <PanelSectionRow>
                                <DropdownItem label={"Display position"}
                                              rgOptions={SideviewPositions.map((position) => ({
                                                    label: SideviewPositionDescriptions[position],
                                                    data: position
                                              }))}
                                              onChange={(selection) => {
                                                    if (config) {
                                                        updateConfig({
                                                            ...config,
                                                            sideview_position: selection.data
                                                        }).catch(e => setError(e))
                                                    }
                                              }}
                                              menuLabel={SideviewPositionDescriptions[config?.sideview_position]}
                                              selectedOption={config?.sideview_position} />
                            </PanelSectionRow>
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
                                             min={0.1} max={2.2}
                                             notchCount={8}
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
                                             min={0.1} max={2.2}
                                             notchCount={8}
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
                        <PanelSectionRow>
                            {supporterTrialTimeRemaining && <Field
                                    icon={null}
                                    label={null}
                                    childrenLayout={undefined}
                                    inlineWrap="keep-inline"
                                    padding="none"
                                    spacingBetweenLabelAndChild="none"
                                    childrenContainerWidth="max">
                                    <div style={{ textAlign: 'center',
                                        alignSelf: 'center',
                                        marginRight: '.5em',
                                        flexGrow: 1 }}>
                                        Supporter Tier: <span style={{fontWeight: 'bold', color: 'white'}}>
                                            <LuTimer style={{position: 'relative', top: '1px', marginRight: '2px'}} />In trial
                                        </span><br/>
                                        {supporterTrialTimeRemainingText && <span className={gamepadDialogClasses.FieldDescription}>
                                            Trial ends in {supporterTrialTimeRemainingText}
                                        </span>}
                                    </div>
                                    <ButtonItem layout="below" onClick={showSupporterTierDetails}
                                                bottomSeparator={'none'} highlightOnFocus={false}>
                                        Become a supporter
                                    </ButtonItem>
                                </Field> ||
                                supporterTierActive && <Field
                                    icon={null}
                                    label={null}
                                    childrenLayout={undefined}
                                    inlineWrap="keep-inline"
                                    padding="none"
                                    spacingBetweenLabelAndChild="none"
                                    childrenContainerWidth="max">
                                    <div style={{ textAlign: 'center',
                                                  alignSelf: 'center',
                                                  marginRight: '.5em',
                                                  flexGrow: 1 }}>
                                        Supporter Tier: <span style={{fontWeight: 'bold', color: 'white'}}>Unlocked</span><br/>
                                        <span className={gamepadDialogClasses.FieldDescription}>
                                            {supporterTierTimeRemainingText ? `Access ends in ${supporterTierTimeRemainingText}` :
                                                <Fragment><BsFillSuitHeartFill color={'red'}/> You rock! Thanks!</Fragment>}
                                        </span>
                                    </div>
                                    {supporterTierTimeRemainingText && <ButtonItem layout="below"
                                                                                   onClick={showSupporterTierDetails}
                                                                                   bottomSeparator={'none'}
                                                                                   highlightOnFocus={false}>
                                        Renew now
                                    </ButtonItem>}
                                </Field> ||
                                <Field
                                    icon={null}
                                    label={null}
                                    childrenLayout={undefined}
                                    inlineWrap="keep-inline"
                                    padding="none"
                                    spacingBetweenLabelAndChild="none"
                                    childrenContainerWidth="max">
                                    <div style={{
                                        textAlign: 'center',
                                        alignSelf: 'center',
                                        marginRight: '.5em',
                                        flexGrow: 1
                                    }}>
                                        Supporter Tier:
                                        <span style={{fontWeight: 'bold', color: 'white'}}>
                                            <BiSolidLock style={{position: 'relative', top: '1px', margin: '0 2px'}} />Locked
                                        </span>
                                    </div>
                                    <ButtonItem layout="below" onClick={showSupporterTierDetails}
                                                bottomSeparator={'none'} highlightOnFocus={false}>
                                        Unlock now
                                    </ButtonItem>
                                </Field>
                            }
                        </PanelSectionRow>
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

export default definePlugin((serverApi: ServerAPI) => {
    return {
        title: <div className={staticClasses.Title}>XR Gaming</div>,
        content: <Content serverAPI={serverApi}/>,
        icon: <FaGlasses/>
    };
});
