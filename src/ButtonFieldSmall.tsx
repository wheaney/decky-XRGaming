import {
    PanelSectionRow,
    DialogButton,
    Field,
    Focusable, gamepadDialogClasses,
} from 'decky-frontend-lib';
import { FC, ReactNode } from 'react';

const ButtonFieldSmall: FC<{
    label: ReactNode;
    onClick: (e: MouseEvent) => void;
    buttonText: string;
}> = ({ label, onClick, buttonText }) => {
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
                    className={gamepadDialogClasses.FieldLabel}
                >
                    {label}
                </div>
                <DialogButton
                    onClick={onClick}
                    style={{
                        flexShrink: 0,
                        alignSelf: 'center',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        padding: '10px',
                        maxWidth: '45%',
                        minWidth: 'auto',
                        marginLeft: '.5em'
                    }}
                >
                    {buttonText}
                </DialogButton>
            </Focusable>
        </Field>
    </PanelSectionRow>
};

export default ButtonFieldSmall;