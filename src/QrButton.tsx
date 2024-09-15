import {
    PanelSectionRow,
    DialogButton,
    Field,
    Focusable,
    Navigation,
} from '@decky/ui';
import { FC, ReactNode } from 'react';
import showQrModal from "./showQrModal";

const navLink = (url: string) => {
    Navigation.CloseSideMenus();
    Navigation.NavigateToExternalWeb(url);
};

const QrButton: FC<{
    icon: ReactNode;
    url: string;
    followLink?: boolean;
    children: ReactNode;
}> = ({ icon, children, url, followLink }) => {
    const clickAction = followLink ? () => navLink(url) : () => showQrModal(url);
    return <PanelSectionRow>
        <Field
            icon={null}
            label={null}
            childrenLayout={undefined}
            inlineWrap="keep-inline"
            padding="none"
            spacingBetweenLabelAndChild="none"
            childrenContainerWidth="max"
        >
            <Focusable style={{display: 'flex', justifyContent: 'space-between'}}>
                <div
                    style={{
                        textAlign: 'center',
                        alignSelf: 'center',
                        marginRight: '.5em',
                        flexGrow: 1
                    }}
                >
                    {children}
                </div>
                <DialogButton
                    onOKActionDescription={followLink ? 'Follow Link' : 'Show Link QR'}
                    onClick={clickAction}
                    style={{
                        flexShrink: 0,
                        alignSelf: 'center',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        padding: '10px',
                        maxWidth: '40px',
                        minWidth: 'auto',
                        marginLeft: '.5em'
                    }}
                >
                    {icon}
                </DialogButton>
            </Focusable>
        </Field>
    </PanelSectionRow>
};

export default QrButton;