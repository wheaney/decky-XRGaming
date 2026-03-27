import React, {Fragment} from "react";
import {ConfirmModal, Focusable, PanelSection, showModal} from "@decky/ui";
import commonDisplayResolutionVideo from "../assets/tutorials/common/display-resolution.webp";
import commonGamePropertiesVideo from "../assets/tutorials/common/game-properties-resolution.webp";
import vdSidebarPerformanceVideo from "../assets/tutorials/virtual_display/sidebar-performance.webp";
import sbsScalingStretchVideo from "../assets/tutorials/sbs/scaling-mode-stretch.webp";
import { t } from "./i18n";

const videoStyle = {
    width: "400px",
    display: 'block',
    marginLeft: 'auto',
    marginRight: 'auto'
}

function GamePropertiesResolutionListItem() {
    return <li style={listItem}>
        <p dangerouslySetInnerHTML={{__html: t('tutorial.common.gamePropertiesInstruction')}} />
        <Focusable focusWithinClassName="gpfocuswithin" onActivate={() => {}} noFocusRing={true}>
            <img src={commonGamePropertiesVideo} alt={t('tutorial.common.gamePropertiesAlt')} style={videoStyle}/>
        </Focusable>
    </li>
}

function SteamDisplayResolutionListItem() {
    return <li style={listItem}>
        <p dangerouslySetInnerHTML={{__html: t('tutorial.common.displayResolutionEnableInstruction')}} />
        <Focusable focusWithinClassName="gpfocuswithin" onActivate={() => {}} noFocusRing={true}>
            <img src={commonDisplayResolutionVideo} alt={t('tutorial.common.displayResolutionAlt')} style={videoStyle}/>
        </Focusable>
    </li>
}

function SteamDisplayResolutionGamescopeSBSListItem() {
    return <li style={listItem}>
        <p dangerouslySetInnerHTML={{__html: t('tutorial.common.displayResolutionSbsInstruction')}} />
    </li>
}

const listItem = {
    paddingBottom: 30
}

type TutorialComponentProps = {
    deviceBrand: string,
    deviceModel: string
}
type TutorialComponent = React.FC<TutorialComponentProps>;

function VirtualDisplayTutorial() {
    return <Fragment>
        <Focusable focusWithinClassName="gpfocuswithin" onActivate={() => {}} noFocusRing={true}>
            <PanelSection title={t('tutorial.vd.limitationsTitle')}>
                <p>{t('tutorial.vd.vulkanOnlyIntro')}</p>
                <ul>
                    <li dangerouslySetInnerHTML={{__html: t('tutorial.vd.limitation1')}} />
                    <li dangerouslySetInnerHTML={{__html: t('tutorial.vd.limitation2')}} />
                    <li dangerouslySetInnerHTML={{__html: t('tutorial.vd.limitation3')}} />
                    <li>{t('tutorial.vd.limitation4')}</li>
                </ul>
                <p>{t('tutorial.vd.blackScreen')}</p>
            </PanelSection>
        </Focusable>
        <PanelSection title={t('tutorial.vd.optimizingTitle')}>
            <p>{t('tutorial.vd.optimizingIntro')}</p>
            <ol>
                <SteamDisplayResolutionListItem />
                <GamePropertiesResolutionListItem />
                <li style={listItem}>
                    <p dangerouslySetInnerHTML={{__html: t('tutorial.vd.performanceSettingsInstruction')}} />
                    <Focusable focusWithinClassName="gpfocuswithin" onActivate={() => {}} noFocusRing={true}>
                        <img src={vdSidebarPerformanceVideo} alt={t('tutorial.vd.performanceSettingsAlt')} style={videoStyle}/>
                    </Focusable>
                </li>
                <li style={listItem}>
                    <Focusable focusWithinClassName="gpfocuswithin" onActivate={() => {}} noFocusRing={true}>
                        <p dangerouslySetInnerHTML={{__html: t('tutorial.vd.graphicsSettings')}} />
                    </Focusable>
                </li>
            </ol>
        </PanelSection>
    </Fragment>
}

function getSBSTutorialComponent(vulkanOnlyMode: boolean) {
    return function SBSTutorial(props: TutorialComponentProps) {
        const sbsInstructionKeys: Record<string, string> = {
            'XREAL':  t('tutorial.sbs.instructions.XREAL'),
            'VITURE': t('tutorial.sbs.instructions.VITURE'),
            'TCL':    t('tutorial.sbs.instructions.TCL'),
            'RayNeo': t('tutorial.sbs.instructions.RayNeo'),
            'Rokid':  t('tutorial.sbs.instructions.Rokid'),
        };
        const sbsInstruction = sbsInstructionKeys[props.deviceBrand] ?? t('tutorial.sbs.defaultInstructions');
        return <Fragment>
            <PanelSection title={t('tutorial.sbs.usageTitle')}>
                <Focusable focusWithinClassName="gpfocuswithin" onActivate={() => {}} noFocusRing={true}>
                    <p>
                        <b>{t('tutorial.sbs.usageNote')}</b>
                    </p>
                    <p>
                        {vulkanOnlyMode
                            ? t('tutorial.sbs.toggleDescVulkan')
                            : t('tutorial.sbs.toggleDescGamescope')}
                    </p>
                    <p>
                        {t('tutorial.sbs.depthDesc')}
                    </p>
                </Focusable>
            </PanelSection>
            <PanelSection title={t('tutorial.sbs.recommendedTitle')}>
                <p>{t('tutorial.sbs.recommendedIntro')}</p>
                <ol>
                    {vulkanOnlyMode ? 
                        <SteamDisplayResolutionListItem /> : 
                        <SteamDisplayResolutionGamescopeSBSListItem />}
                    <GamePropertiesResolutionListItem />
                    {vulkanOnlyMode && <li style={listItem}>
                        <p dangerouslySetInnerHTML={{__html: t('tutorial.sbs.scalingModeInstruction')}} />
                        <Focusable focusWithinClassName="gpfocuswithin" onActivate={() => {}} noFocusRing={true}>
                            <img src={sbsScalingStretchVideo} alt={t('tutorial.sbs.scalingModeAlt')} style={videoStyle}/>
                        </Focusable>
                    </li>}
                </ol>
            </PanelSection>
            <PanelSection title={t('tutorial.sbs.controlsTitle')}>
                <Focusable focusWithinClassName="gpfocuswithin" onActivate={() => {}} noFocusRing={true}>
                    <p>
                        {t('tutorial.sbs.controlsEnable', { instructions: sbsInstruction })}
                    </p>
                    <p>
                        {t('tutorial.sbs.newControls')}
                        <ul>
                            <li dangerouslySetInnerHTML={{__html: t('tutorial.sbs.displayDistanceDesc')}} />
                            {vulkanOnlyMode && <li dangerouslySetInnerHTML={{__html: t('tutorial.sbs.stretchedControlDesc')}} />}
                            <li dangerouslySetInnerHTML={{__html: t('tutorial.sbs.is3dControlDesc')}} />
                        </ul>
                    </p>
                </Focusable>
            </PanelSection>
        </Fragment>
    }
}

type tutorial = {
    titleKey: string,
    description?: string,
    component: TutorialComponent
}
export const tutorials: { [key: string]: tutorial } = {
    'headset_mode_virtual_display_vulkan_only': {
        titleKey: 'tutorial.virtualDisplay.title',
        component: VirtualDisplayTutorial
    },
    'sbs_mode_enabled_true_vulkan_only': {
        titleKey: 'tutorial.sbsMode.title',
        component: getSBSTutorialComponent(true)
    },
    'sbs_mode_enabled_true': {
        titleKey: 'tutorial.sbsMode.title',
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
            strTitle={t(tutorial.titleKey)}
            strDescription={tutorial.description}
            strOKButtonText={t('tutorial.ok')}
            strMiddleButtonText={t('tutorial.dontShowAgain')}
            strCancelButtonText={t('tutorial.cancel')}
            onMiddleButton={async () => {
                onConfirm();
                await setDontShowAgain(tutorialKey);
            }}
            onOK={onConfirm}><TutorialComponent deviceBrand={deviceBrand} deviceModel={deviceModel} /></ConfirmModal>);
    }
}