import { ButtonItem, Field, PanelSectionRow, gamepadDialogClasses, showModal } from "@decky/ui";
import { License, secondsRemaining, timeRemainingText, trialTimeRemaining } from "./license";
import { LuTimer } from "react-icons/lu";
import { RefreshLicenseResponse, SupporterTierModal } from "./SupporterTierModal";
import { Fragment, useRef } from "react";
import { BsFillSuitHeartFill } from "react-icons/bs";
import { BiSolidLock } from "react-icons/bi";

export interface SupporterTierDetails {
    licensePresent: boolean;
    active: boolean;
    confirmedToken: boolean;
    fundsNeeded?: number;
    lifetimeFundsNeeded?: number;
    lifetimeAccess: boolean;
    timeRemainingText?: string;
    trialTimeRemaining?: number;
    trialTimeRemainingText?: string;
}
export function supporterTierDetails(license?: License): SupporterTierDetails {
    const tierSecondsRemaining = license?.tiers?.supporter?.fundsToRenew ? Infinity : secondsRemaining(license?.tiers?.supporter?.endDate)
    const tierTrialTimeRemaining = trialTimeRemaining(license)
    const active = (license?.tiers?.supporter?.active && tierSecondsRemaining > 0) ?? false;
    const lifetime = active && license?.tiers?.supporter?.endDate === undefined;

    return {
        licensePresent: !!license,
        active: active,
        confirmedToken: license?.confirmedToken ?? false,
        fundsNeeded: license?.tiers?.supporter?.fundsNeededUSD,
        lifetimeFundsNeeded: license?.tiers?.supporter?.lifetimeFundsNeededUSD,
        lifetimeAccess: lifetime,
        timeRemainingText: timeRemainingText(tierSecondsRemaining),
        trialTimeRemaining: tierTrialTimeRemaining,
        trialTimeRemainingText: timeRemainingText(tierTrialTimeRemaining)
    }
}

interface Props {
    details: SupporterTierDetails;
    requestTokenFn: (email: string) => Promise<any>;
    verifyTokenFn: (token: string) => Promise<any>;
    refreshLicenseFn: () => Promise<RefreshLicenseResponse>;
}

// this has to be a React hook so we can use `useRef`
export function useShowSupporterTierDetails() {
    const supporterTierModalCloseRef = useRef<() => void>();

    return function(
        details: SupporterTierDetails,
        requestTokenFn: (email: string) => Promise<any>,
        verifyTokenFn: (token: string) => Promise<any>,
        refreshLicenseFn: () => Promise<RefreshLicenseResponse>
    ) {
        const modalResult = showModal(
            <SupporterTierModal {...details}
                                requestTokenFn={requestTokenFn}
                                verifyTokenFn={verifyTokenFn}
                                refreshLicenseFn={refreshLicenseFn}
                                supporterTierModalCloseRef={supporterTierModalCloseRef}
            />,
            window
        );
        supporterTierModalCloseRef.current = modalResult.Close;
    }
}

export function SupporterTierStatus({details, requestTokenFn, verifyTokenFn, refreshLicenseFn}: Props) {
    const showSupporterTierDetailsFn = useShowSupporterTierDetails();
    const showSupporterTierDetails = () => showSupporterTierDetailsFn(details, requestTokenFn, verifyTokenFn, refreshLicenseFn);
    return (
        <PanelSectionRow>
            {details.trialTimeRemaining && 
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
                        Supporter Tier: <span style={{fontWeight: 'bold', color: 'white'}}>
                            <LuTimer style={{position: 'relative', top: '1px', marginRight: '2px'}} />In trial
                        </span><br/>
                        {details.trialTimeRemainingText && <span className={gamepadDialogClasses.FieldDescription}>
                            Trial ends in {details.trialTimeRemainingText}<br/>
                            (only tagged <i>Supporter Tier</i> features will be locked)
                        </span>}
                    </div>
                    <ButtonItem layout="below" onClick={showSupporterTierDetails}
                                bottomSeparator={'none'} highlightOnFocus={false}>
                        Become a supporter
                    </ButtonItem>
                </Field> ||
                details.active && <Field
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
                        Supporter Tier: <span style={{fontWeight: 'bold', color: 'white'}}>{
                            details.lifetimeAccess ? "Lifetime" : "Unlocked"
                        }</span><br/>
                        <span className={gamepadDialogClasses.FieldDescription}>
                            {details.timeRemainingText ? `Access ends in ${details.timeRemainingText}` :
                                <Fragment><BsFillSuitHeartFill color={'red'}/> You rock! Thanks!</Fragment>}
                        </span>
                    </div>
                    {details.timeRemainingText && <ButtonItem layout="below"
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
    );
}