import {
    ModalRoot,
    PanelSection,
    gamepadDialogClasses, 
    TextField, 
    Spinner, 
    DialogButtonPrimary, 
    DialogButtonSecondary, 
    Focusable, 
    Navigation
} from '@decky/ui';
import {FC, MutableRefObject, useEffect, useState} from "react";
import {QRCodeSVG} from "qrcode.react";

enum SupporterTierView {
    NoLicense,
    Enroll,
    Renew,
    Donate,
    VerifyToken,
    RequestToken,
    Done
}

function SupporterTierFeaturesList() {
    return <div style={{display: 'flex', flexDirection: 'row', justifyContent: 'space-between', gap: '40px'}}>
        <div style={{flex: 0.8}}>
            <div style={{textAlign: 'center', fontWeight: 'bold', paddingBottom: '3px', borderBottom: '2px outset white'}}>
                Side-by-side
            </div>
            <div style={{padding: '0 7px'}} className={gamepadDialogClasses.FieldDescription}>
                Change the display distance. View 3D content.
            </div>
        </div>
        <div style={{flex: 1}}>
            <div style={{textAlign: 'center', fontWeight: 'bold', paddingBottom: '3px', borderBottom: '2px outset white'}}>
                Smooth Follow
            </div>
            <div style={{padding: '0 7px'}} className={gamepadDialogClasses.FieldDescription}>
                Display follows you. Tracks movements with smooth accelerations.
            </div>
        </div>
        <div style={{flex: 1.2}}>
            <div style={{textAlign: 'center', fontWeight: 'bold', paddingBottom: '3px', borderBottom: '2px outset white'}}>
                Auto re-centering
            </div>
            <div style={{padding: '0 7px'}} className={gamepadDialogClasses.FieldDescription}>
                Virtual display automatically re-centers itself based on look-away distance or duration.
            </div>
        </div>
    </div>;
}

interface SupportTierModalDetails {
    licensePresent: boolean;
    confirmedToken?: boolean;
    timeRemainingText?: string;
    fundsNeeded?: number;
    lifetimeFundsNeeded?: number;
}

export interface RefreshLicenseResponse extends SupportTierModalDetails {
    isRenewed: boolean;
}

interface SupporterTierModalProps extends SupportTierModalDetails {
    requestTokenFn: (email: string) => Promise<boolean>;
    verifyTokenFn: (token: string) => Promise<boolean>;
    refreshLicenseFn: () => Promise<RefreshLicenseResponse>;
    supporterTierModalCloseRef: MutableRefObject<(() => void) | undefined>;
}

interface SupporterTierStepProps extends SupporterTierModalProps {
    changeViewFn: (view: SupporterTierView) => void;
}

interface SupporterTierAboutBlurbProps {
    timeRemainingText?: string;
    fundsNeeded?: number;
    lifetimeFundsNeeded?: number;
}

function SupporterTierAboutRenewBlurb(props: SupporterTierAboutBlurbProps) {
    return <p style={{textAlign: 'center'}}>
        Your <b>Supporter Tier</b> access ends in {props.timeRemainingText}. Donate ${props.fundsNeeded} USD more to
        renew for another year.
    </p>;
}

function SupporterTierAboutEnrollBlurb(props: SupporterTierAboutBlurbProps) {
    return <p style={{textAlign: 'center'}}>
        {props.timeRemainingText && <span>
                Your <b>Supporter Tier</b> trial ends in {props.timeRemainingText}.
            </span>} 
            Donate ${props.fundsNeeded} USD to get Supporter Tier access for 12 months, 
            or ${props.lifetimeFundsNeeded} USD for lifetime access.
    </p>
}

function getView(props: SupportTierModalDetails) {
    if (!props.licensePresent) return SupporterTierView.NoLicense;

    if (props.confirmedToken && props.timeRemainingText) {
        return SupporterTierView.Renew;
    } else {
        return SupporterTierView.Enroll;
    }
}

function SupporterTierNoLicense(props: SupporterTierStepProps) {
    const [isFetchingLicense, setFetchingLicense] = useState(false);

    function fetchLicense() {
        (async () => {
            setFetchingLicense(true);
            const res = await props.refreshLicenseFn();
            if (res.isRenewed) {
                props.supporterTierModalCloseRef.current?.();
            } else if (res.licensePresent) {
                props.changeViewFn(getView(res));
            }
            setFetchingLicense(false);
        })().catch(() => setFetchingLicense(false));
    }

    return <PanelSection title={'Supporter Tier - Device offline'}>
        <p style={{textAlign: 'center'}}>
            Your device needs to be connected to the internet to retrieve your Supporter Tier status.
        </p>
        <Focusable
            style={{
                paddingTop: '25px',
                display: 'flex',
                flexDirection: 'row-reverse',
                justifyContent: 'space-between',
                gap: '50px'
            }}
            flow-children={"horizontal"}
        >
            <DialogButtonPrimary  onClick={fetchLicense} disabled={isFetchingLicense}>
                {isFetchingLicense && <span>
                    <Spinner style={{height: '16px', marginRight: 10}}/>
                    Retrieving license
                </span> ||
                "I'm online now"}
            </DialogButtonPrimary>
        </Focusable>
    </PanelSection>
}

interface SupporterTierAboutProps extends SupporterTierStepProps {
    title: string;
    primaryButtonLabel: string;
    blurb: FC<SupporterTierAboutBlurbProps>;
}

function SupporterTierAbout(props: SupporterTierAboutProps) {
    const [isFetchingLicense, setFetchingLicense] = useState(false);
    const [showTryNewToken, setShowTryNewToken] = useState(false);
    const [timeRemainingText, setTimeRemainingText] = useState(props.timeRemainingText);
    const [fundsNeeded, setFundsNeeded] = useState(props.fundsNeeded);
    const [lifetimeFundsNeeded, setLifetimeFundsNeeded] = useState(props.lifetimeFundsNeeded);

    function fetchLicense() {
        (async () => {
            setFetchingLicense(true);
            const res = await props.refreshLicenseFn();
            if (res.isRenewed) {
                props.supporterTierModalCloseRef.current?.();
            } else {
                setTimeRemainingText(res.timeRemainingText);
                setFundsNeeded(res.fundsNeeded);
                setLifetimeFundsNeeded(res.lifetimeFundsNeeded);
                setShowTryNewToken(true);
            }
            setFetchingLicense(false);
        })().catch(() => setFetchingLicense(false));
    }

    const alreadyDonatedOnClick = props.confirmedToken ? fetchLicense : () => props.changeViewFn(SupporterTierView.VerifyToken);
    const Blurb = props.blurb;
    return <PanelSection title={props.title}>
        <Blurb timeRemainingText={timeRemainingText} fundsNeeded={fundsNeeded} lifetimeFundsNeeded={lifetimeFundsNeeded} />
        <SupporterTierFeaturesList/>
        <Focusable
            style={{
                paddingTop: '25px',
                display: 'flex',
                flexDirection: 'row-reverse',
                justifyContent: 'space-between',
                gap: '50px'
            }}
            flow-children={"horizontal"}
        >
            <DialogButtonPrimary onClick={() => props.changeViewFn(SupporterTierView.Donate)} disabled={isFetchingLicense}>{props.primaryButtonLabel}</DialogButtonPrimary>
            {showTryNewToken && <DialogButtonSecondary onClick={() => props.changeViewFn(SupporterTierView.VerifyToken)} disabled={isFetchingLicense}>
                Try a new token
            </DialogButtonSecondary> ||
            <DialogButtonSecondary onClick={alreadyDonatedOnClick} disabled={isFetchingLicense}>
                {isFetchingLicense && <span>
                    <Spinner style={{height: '16px', marginRight: 10}}/>
                    Refreshing license
                </span> ||
                "I've already donated"}
            </DialogButtonSecondary>}
        </Focusable>
    </PanelSection>
}

function SupporterTierEnroll(props: SupporterTierStepProps) {
    return <SupporterTierAbout title={'Supporter Tier'}
                               primaryButtonLabel={'Donate now'}
                               blurb={SupporterTierAboutEnrollBlurb}
                               {...props} />
}

function SupporterTierRenew(props: SupporterTierStepProps) {
    return <SupporterTierAbout title={'Supporter Tier - Renewal'}
                               primaryButtonLabel={'Renew now'}
                               blurb={SupporterTierAboutRenewBlurb}
                               {...props} />
}

const DonationURL = 'https://ko-fi.com/wheaney';

function SupporterTierDonate(props: SupporterTierStepProps) {
    const [isFetchingLicense, setFetchingLicense] = useState(false);
    const [fundsNeeded, setFundsNeeded] = useState(props.fundsNeeded);
    const [lifetimeFundsNeeded, setLifetimeFundsNeeded] = useState(props.lifetimeFundsNeeded);

    function fetchLicense() {
        (async () => {
            setFetchingLicense(true);
            const res = await props.refreshLicenseFn();
            if (res.isRenewed) {
                props.supporterTierModalCloseRef.current?.();
            } else {
                setFundsNeeded(res.fundsNeeded);
                setLifetimeFundsNeeded(res.lifetimeFundsNeeded);
            }
            setFetchingLicense(false);
        })().catch(() => setFetchingLicense(false));
    }

    const donatedOnClick = props.confirmedToken ? fetchLicense : () => props.changeViewFn(SupporterTierView.VerifyToken);
    return <PanelSection title={'Supporter Tier - Donate'}>
        <div style={{textAlign: 'center', marginBlockEnd: "1em"}}>
            Donate ${fundsNeeded} USD to get Supporter Tier access for 12 months, 
            or ${lifetimeFundsNeeded} USD for lifetime access.
        </div>
        <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            flexDirection: 'column'
        }}>
            <QRCodeSVG
                style={{margin: '0 auto'}}
                value={DonationURL}
                includeMargin
                size={125}
            />
            <div className={gamepadDialogClasses.FieldDescription} style={{marginBottom: "1em"}}>
                To scan the code, you can view this dialog with your glasses unplugged.
            </div>
            <a style={{textAlign: 'center', wordBreak: 'break-word'}} onClick={() => {
                props.supporterTierModalCloseRef.current?.();
                Navigation.NavigateToExternalWeb(DonationURL);
            }}>{DonationURL}</a>
        </div>
        <Focusable
            style={{
                paddingTop: '15px',
                display: 'flex',
                flexDirection: 'row',
                justifyContent: 'space-between',
                gap: '50px'
            }}
            flow-children={"horizontal"}
        >
            <div style={{flex: 0.5}}></div>
            <div style={{flex: 1}}>
                <DialogButtonPrimary onClick={donatedOnClick} disabled={isFetchingLicense}>
                    {isFetchingLicense && <span>
                        <Spinner style={{height: '16px', marginRight: 10}}/>
                        Refreshing license
                    </span> ||
                    "Okay, I've donated"}
                </DialogButtonPrimary>
            </div>
            <div style={{flex: 0.5}}></div>
        </Focusable>
    </PanelSection>
}

function SupporterTierVerifyToken(props: SupporterTierStepProps) {
    const [token, setToken] = useState('');
    const [checkingToken, setCheckingToken] = useState(false);
    const [fieldError, setFieldError] = useState<string | undefined>(undefined);
    const [isSuccess, setSuccess] = useState(false);

    useEffect(() => {
        (async () => {
            if (token.length === 6) {
                setCheckingToken(true);
                try {
                    const success = await props.verifyTokenFn(token);
                    setCheckingToken(false);
                    if (success) {
                        setSuccess(true);
                        await props.refreshLicenseFn();
                        setTimeout(() => props.supporterTierModalCloseRef.current?.(), 3000);
                    } else {
                        setFieldError('Token "' + token + '" is invalid, was requested from another device, ' + 
                            'or the server couldn\'t be reached. Please make sure your device is online, or request a new token.');
                        setToken('');
                    }
                } catch (e) {
                    setCheckingToken(false);
                    setFieldError('An error occurred. Please report this issue if it persists.');
                }
            } else if (token) {
                setFieldError(undefined);
            }
        })().catch(() => {
            setCheckingToken(false);
            setFieldError('An error occurred. Please report this issue if it persists.');
        });
    }, [token]);

    return <PanelSection title={'Supporter Tier - Verify Token'}>
        <p style={{textAlign: 'center'}}>
            Enter the token that was emailed to you at the email address you use as your Ko-fi login.
            If you don't receive it, double-check that you're using the correct email address, check your spam folder,
            or request a new one.
        </p>
        <div style={{display: 'flex', flexDirection: 'row', justifyContent: 'space-between'}}>
            <div style={{flex: 1.25}}></div>
            <div style={{flex: 1}}>
                <TextField disabled={checkingToken}
                           label={'Token'}
                           value={token}
                           onChange={newToken => setToken(newToken.currentTarget.value.toUpperCase())}
                           description={
                                fieldError && <span style={{color: 'red'}}>{fieldError}</span> ||
                                isSuccess && <span style={{color: 'green'}}>&#x2714;&nbsp;Success!</span>
                            }
                />
            </div>
            <div style={{flex: 1.25}}></div>
        </div>
        <Focusable
            style={{
                paddingTop: '25px',
                display: 'flex',
                flexDirection: 'row',
                justifyContent: 'space-between',
                gap: '50px'
            }}
            flow-children={"horizontal"}
        >
            <div style={{flex: 0.5}}></div>
            <div style={{flex: 1}}>
                <DialogButtonPrimary onClick={() => props.changeViewFn(SupporterTierView.RequestToken)}
                                     disabled={checkingToken || isSuccess}>
                    {checkingToken && <span>
                        <Spinner style={{height: '16px', marginRight: 10}}/>
                        Checking token
                    </span> ||
                        "I need a new token"}
                </DialogButtonPrimary>
            </div>
            <div style={{flex: 0.5}}></div>
        </Focusable>
    </PanelSection>
}

function SupporterTierRequestToken(props: SupporterTierStepProps) {
    const [email, setEmail] = useState('');
    const [requestingToken, setRequestingToken] = useState(false);
    const [fieldError, setFieldError] = useState<string | undefined>(undefined);
    const [isEmailError, setEmailError] = useState(true);

    function sendVerificationEmail() {
        (async () => {
            if (email) {
                setRequestingToken(true);
                try {
                    await props.requestTokenFn(email);
                    setRequestingToken(false);
                    props.changeViewFn(SupporterTierView.VerifyToken);
                } catch (e) {
                    setRequestingToken(false);
                    setFieldError('An error occurred. Please report this issue if it persists.');
                }
            } else {
                setRequestingToken(false);
                setFieldError(undefined);
            }
        })().catch(() => setFieldError('An error occurred. Please report this issue if it persists.'));
    }

    function isValidEmail(email: string) {
        return /^\w+([\.\-\+]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,})+$/.test(email)
    }

    return <PanelSection title={'Supporter Tier - Request Token'}>
        <p style={{textAlign: 'center'}}>
            Enter the same email address you use as your Ko-fi login.
        </p>
        <div style={{display: 'flex', flexDirection: 'row', justifyContent: 'space-between', gap: '50px'}}>
            <div style={{flex: 1.5}}>
                <TextField label={'Email'}
                           value={email}
                           mustBeEmail={true}
                           onChange={emailField => {
                               setEmail(emailField.currentTarget.value);
                               setEmailError(!isValidEmail(emailField.currentTarget.value));
                           }}
                           description={fieldError && <span style={{color: 'red'}}>{fieldError}</span>}
                />
            </div>
        </div>
        <Focusable
            style={{
                paddingTop: '25px',
                display: 'flex',
                flexDirection: 'row',
                justifyContent: 'space-between',
                gap: '50px'
            }}
            flow-children={"horizontal"}
        >
            <div style={{flex: 0.5}}></div>
            <div style={{flex: 1}}>
                <DialogButtonPrimary onClick={sendVerificationEmail} disabled={requestingToken || isEmailError}>
                    {requestingToken && <Spinner style={{height: '16px', marginRight: 10}}/>}Send verification
                </DialogButtonPrimary>
            </div>
            <div style={{flex: 0.5}}></div>
        </Focusable>
    </PanelSection>
}

export function SupporterTierModal(props: SupporterTierModalProps) {
    const [view, setView] = useState(getView(props));
    const stepProps: SupporterTierStepProps = {
        ...props,
        changeViewFn: setView
    };

    let View: FC<SupporterTierStepProps>;
    switch (view) {
        case SupporterTierView.NoLicense:
            View = SupporterTierNoLicense;
            break;
        case SupporterTierView.Renew:
            View = SupporterTierRenew;
            break;
        case SupporterTierView.Enroll:
            View = SupporterTierEnroll;
            break;
        case SupporterTierView.Donate:
            View = SupporterTierDonate;
            break;
        case SupporterTierView.VerifyToken:
            View = SupporterTierVerifyToken;
            break;
        case SupporterTierView.RequestToken:
            View = SupporterTierRequestToken;
            break;
        default:
            View = SupporterTierEnroll;
    }

    return <ModalRoot onCancel={() => props.supporterTierModalCloseRef.current?.()}
                      onEscKeypress={() => props.supporterTierModalCloseRef.current?.()}
    >
        <View {...stepProps} />
    </ModalRoot>
}