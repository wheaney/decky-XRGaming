import React, {Fragment} from "react";
import {ConfirmModal, Focusable, PanelSection, showModal} from "@decky/ui";
import commonDisplayResolutionVideo from "../assets/tutorials/common/display-resolution.webp";
import commonGamePropertiesVideo from "../assets/tutorials/common/game-properties-resolution.webp";
import vdSidebarPerformanceVideo from "../assets/tutorials/virtual_display/sidebar-performance.webp";
import sbsScalingStretchVideo from "../assets/tutorials/sbs/scaling-mode-stretch.webp";

const videoStyle = {
    width: "400px",
    display: 'block',
    marginLeft: 'auto',
    marginRight: 'auto'
}

const navigationDetail = {
    fontStyle: 'italic'
}

const actionLabel = {
    fontWeight: 'bold'
}

const listItem = {
    paddingBottom: 30
}

function GamePropertiesResolutionListItem() {
    return <li style={listItem}>
        <p>In the <span style={navigationDetail}>Game details view</span>, click the <span
            style={navigationDetail}>Settings</span> icon, and set the resolution
            to <span style={actionLabel}>Native</span>.</p>
        <Focusable focusWithinClassName="gpfocuswithin" onActivate={() => {}} noFocusRing={true}>
            <img src={commonGamePropertiesVideo} alt="Setting the Game Resolution" style={videoStyle}/>
        </Focusable>
    </li>
}

function SteamDisplayResolutionListItem() {
    return <li style={listItem}>
        <p>In <span style={navigationDetail}>Settings-&gt;Display</span>, enable the <span
            style={actionLabel}>Automatically Set Resolution</span> toggle.</p>
        <Focusable focusWithinClassName="gpfocuswithin" onActivate={() => {}} noFocusRing={true}>
            <img src={commonDisplayResolutionVideo} alt="Setting the Display Resolution" style={videoStyle}/>
        </Focusable>
    </li>
}

function SteamDisplayResolutionGamescopeSBSListItem() {
    return <li style={listItem}>
        <p>In <span style={navigationDetail}>Settings-&gt;Display</span>, disable the <span
            style={actionLabel}>Automatically Set Resolution</span> toggle, and set the resolution to the
            highest value, typically a 32:9 aspect ratio like <span style={actionLabel}>3840x1080</span>.</p>
    </li>
}

type TutorialComponentProps = {
    deviceBrand: string,
    deviceModel: string
}
type TutorialComponent = React.FC<TutorialComponentProps>;

function VirtualDisplayTutorial() {
    return <Fragment>
        <Focusable focusWithinClassName="gpfocuswithin" onActivate={() => {}} noFocusRing={true}>
            <PanelSection title={"Limitations"}>
                <p>In Vulkan-only mode, the virtual display will only work under certain conditions:</p>
                <ul>
                    <li>ONLY on <b>in-game</b> content. Not on Steam itself.</li>
                    <li>ONLY when playing a <b>Vulkan game</b>.</li>
                    <li>ONLY when the game is running <b>on this device</b>. Streaming apps won't work for now.</li>
                    <li>Vulkan games installed through other apps or launchers may not work, such as the Heroic Flatpak app.</li>
                </ul>
                <p>If you're encountering a black screen, try using the Recenter button.</p>
            </PanelSection>
        </Focusable>
        <PanelSection title={"Optimizing Performance"}>
            <p>Virtual display works best with low input lag and higher game frame rates. Here are some recommended settings:</p>
            <ol>
                <SteamDisplayResolutionListItem />
                <GamePropertiesResolutionListItem />
                <li style={listItem}>
                    <p>In <span style={navigationDetail}>the Deck's ... Performance menu</span>, flip on <span
                        style={actionLabel}>Disable Frame Limit</span> and enable <span style={actionLabel}>Allow
                        Tearing</span>.</p>
                    <Focusable focusWithinClassName="gpfocuswithin" onActivate={() => {}} noFocusRing={true}>
                        <img src={vdSidebarPerformanceVideo} alt="Modifying performance settings" style={videoStyle}/>
                    </Focusable>
                </li>
                <li style={listItem}>
                    <Focusable focusWithinClassName="gpfocuswithin" onActivate={() => {}} noFocusRing={true}>
                        <p>After launching a game, go into the <span style={navigationDetail}>
                            graphics/video settings</span>, set the resolution to <span style={actionLabel}>
                            any 16:9 aspect ratio</span> (lower is better for performance, but keep the glasses'
                            aspect ratio), <span style={actionLabel}>disable VSync</span>, and tune your settings for
                            higher performance/lower quality.</p>
                    </Focusable>
                </li>
            </ol>
        </PanelSection>
    </Fragment>
}

const deviceBrandToSBSInstructions: {[brand: string]: string} = {
    "XREAL": "long-pressing the brightness/volume-up button for about 3 seconds",
    "VITURE": "long-pressing the mode (short) button for about 2 seconds",
    "TCL": "long-pressing the brightness-up button on the right arm",
    "RayNeo": "pressing the buttons on the left and right arms of the glasses simultaneously",
    "Rokid": "long-pressing the brightness (short) button for about 2 seconds"
}

function getSBSTutorialComponent(vulkanOnlyMode: boolean) {
    return function SBSTutorial(props: TutorialComponentProps) {
        return <Fragment>
            <PanelSection title={'Usage'}>
                <Focusable focusWithinClassName="gpfocuswithin" onActivate={() => {}} noFocusRing={true}>
                    <p>
                        <b>NOTE: This mode DOES NOT add stereoscopic depth to games that don't already support it natively.</b>
                    </p>
                    <p>
                        Enabling this toggle will switch your glasses to side-by-side mode, which will make it difficult to
                        navigate non-game content -- such as Steam{!vulkanOnlyMode && ' -- in some scenarios'}. {vulkanOnlyMode && 
                            'For the best experience, wait until after you\'ve launched a game to enable SBS mode, ' +
                            'and disable it before exiting the game.'}
                    </p>
                    <p>
                        This mode enables depth-based effects like moving how close or far the virtual display appears,
                        which may relieve eye strain for users that experience that with default settings. It can also
                        render stereoscopic 3D content in the virtual display for games that support it natively, or you
                        can try using a tool like ReShade to add 3D to games that don't support it natively.
                    </p>
                </Focusable>
            </PanelSection>
            <PanelSection title={'Recommended Settings'}>
                <p>The following settings are recommended for a consistent experience across games:</p>
                <ol>
                    {vulkanOnlyMode ? 
                        <SteamDisplayResolutionListItem /> : 
                        <SteamDisplayResolutionGamescopeSBSListItem />}
                    <GamePropertiesResolutionListItem />
                    {vulkanOnlyMode && <li style={listItem}>
                        <p>In <span style={navigationDetail}>the Deck's ... Performance menu</span>, move the <span
                            style={navigationDetail}>Scaling Mode</span> slider to <span style={actionLabel}>
                            Stretch</span>.</p>
                        <Focusable focusWithinClassName="gpfocuswithin" onActivate={() => {}} noFocusRing={true}>
                            <img src={sbsScalingStretchVideo} alt="Setting Scaling Mode to Stretch" style={videoStyle}/>
                        </Focusable>
                    </li>}
                </ol>
            </PanelSection>
            <PanelSection title={'Controls'}>
                <Focusable focusWithinClassName="gpfocuswithin" onActivate={() => {}} noFocusRing={true}>
                    <p>
                        You can enable or disable SBS mode directly from the glasses by {
                            deviceBrandToSBSInstructions[props.deviceBrand] ?? 'consulting the owner\'s manual'
                        }.
                        Or you can return to the plugin sidebar menu and disable it through the toggle.
                    </p>
                    <p>
                        You'll see some new controls in the plugin sidebar menu when SBS is enabled:
                        <ul>
                            <li><span style={actionLabel}>Display distance</span> uses stereoscopic depth perception to make
                                the screen appear farther or closer. Since items that are closer also appear larger, you'll
                                probably want to use the <span style={actionLabel}>Display size</span> setting in
                                conjunction with this. If you experience eye strain using your glasses typically, you may
                                find it more comfortable to move the screen closer, for example. If you're already
                                comfortable with the default screen distance, using this may introduce eye strain.</li>
                            {vulkanOnlyMode && <li><span style={actionLabel}>Content is stretched</span> indicates that your game is being
                                rendering using the full width of the screen. You should enable this if you followed the
                                recommendation to set Scaling Mode to Stretch. If the screen content appears to be getting
                                cut off or isn't lining up in each eye, you may find that toggling this fixes it.</li>}
                            <li><span style={actionLabel}>Content is 3D</span> indicates that the game is rendering as
                                stereoscopic, side-by-side 3D, either natively or using a tool that adds stereoscopic
                                depth.</li>
                        </ul>
                    </p>
                </Focusable>
            </PanelSection>
        </Fragment>
    }
}

type tutorial = {
    title: string,
    description?: string,
    component: TutorialComponent
}
export const tutorials: { [key: string]: tutorial } = {
    'headset_mode_virtual_display_vulkan_only': {
        title: 'Virtual Display',
        component: VirtualDisplayTutorial
    },
    'sbs_mode_enabled_true_vulkan_only': {
        title: 'Side-by-side mode',
        component: getSBSTutorialComponent(true)
    },
    'sbs_mode_enabled_true': {
        title: 'Side-by-side mode',
        component: getSBSTutorialComponent(false)
    }
}

export function onChangeTutorial(tutorialKey: string, deviceBrand: string, deviceModel:string, onConfirm: () => void,
                                 dontShowAgainKeys: string[], setDontShowAgain: (key: string) => Promise<void>) {
    if (dontShowAgainKeys.includes(tutorialKey) || !tutorials[tutorialKey]) {
        onConfirm();
    } else {
        const tutorial = tutorials[tutorialKey];
        const TutorialComponent = tutorial.component;
        showModal(<ConfirmModal
            strTitle={tutorial.title}
            strDescription={tutorial.description}
            strOKButtonText={"OK"}
            strMiddleButtonText={"Don't show again"}
            strCancelButtonText={"Cancel"}
            onMiddleButton={async () => {
                onConfirm();
                await setDontShowAgain(tutorialKey);
            }}
            onOK={onConfirm}><TutorialComponent deviceBrand={deviceBrand} deviceModel={deviceModel} /></ConfirmModal>);
    }
}