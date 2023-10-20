import {
    PanelSectionRow,
    DialogButton,
    Field,
    Focusable,
} from 'decky-frontend-lib';
import { FC, ReactNode } from 'react';
import showQrModal from "./showQrModal";

/**
 * Panel row with a button next to an icon.
 */
const QrButton: FC<{
    icon: ReactNode;
    url: string;
}> = ({ icon, children, url }) => {
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
                    onOKActionDescription={'Show Link QR'}
                    onClick={() => showQrModal(url)}
                    style={{
                        flexShrink: 0,
                        alignSelf: 'center',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        padding: '10px',
                        maxWidth: '40px',
                        minWidth: 'auto',
                        marginLeft: '.5em',
                    }}
                >
                    {icon}
                </DialogButton>
            </Focusable>
        </Field>
    </PanelSectionRow>
};

export default QrButton;