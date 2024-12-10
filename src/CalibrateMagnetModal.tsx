import {
    ModalRoot,
    PanelSection,
    showModal,
    ProgressBarWithInfo,
    Focusable,
    DialogButtonPrimary
} from '@decky/ui';
import { MutableRefObject, useRef, useState } from "react";

export function useShowCalibrateMagnetModal() {
    const modalCloseRef = useRef<() => void>();

    return function(startCalibrationFn: () => void, alreadyUsingMagnet: boolean) {
        const modalResult = showModal(
            <CalibrateMagnetModal startCalibrationFn={startCalibrationFn}
                                  modalCloseRef={modalCloseRef}
                                  alreadyUsingMagnet={alreadyUsingMagnet}
            />,
            window
        );
        modalCloseRef.current = modalResult.Close;
    }
}

interface CalibratingMagnetometerProps {
    startCalibrationFn: () => void;
    modalCloseRef: MutableRefObject<(() => void) | undefined>;
    alreadyUsingMagnet: boolean;
}

const MagnetCalibrationSeconds = 10;
export function CalibrateMagnetModal(props: CalibratingMagnetometerProps) {
    const [calibratingSecondsRemaining, setCalibratingSecondsRemaining] = useState(0);

    if (calibratingSecondsRemaining > 0) {
        setTimeout(() => setCalibratingSecondsRemaining(calibratingSecondsRemaining - 1), 1000);
    }

    function ready() {
        setCalibratingSecondsRemaining(MagnetCalibrationSeconds);
        props.startCalibrationFn();
    }

    return <ModalRoot onCancel={() => props.modalCloseRef.current?.()}
                      onEscKeypress={() => props.modalCloseRef.current?.()}>
        {calibratingSecondsRemaining === 0 && <PanelSection title={'Magnetometer Calibration'}>
            <p>
                A well calibrated magnetometer can completely eliminate drift.
                A poorly calibrated magnetometer may result in worse drift than not using it at all.
            </p>
            <p>
                For the best calibration, read the following instructions carefully before beginning.
                <ul>
                    <li>
                        Wear your headset on your head exactly as you do during usage. Don't hold it in your hands.
                    </li>
                    <li>
                        Calibration is specific to where you are, especially indoors. Some environments may not be well suited
                        for magnetometer usage. If you're getting poor results, you can choose to disable the magnetometer.
                    </li>
                    <li>
                        If you move, even in the same room, it's best to rerun this calibration.
                    </li>
                    <li>
                        Calibration will take 10 seconds. During this time, you'll want to look all around you &mdash; up, down, left, 
                        right, center &mdash; or look around a large figure-eight motion as wide and tall as your neck comfortably allows.
                        There's no need to turn your body. The goal is to capture as many head positions as possible during the calibration.
                    </li>
                    <li>
                        When you're ready, click the "Ready" button to start the 10 second timer then begin looking around until it's complete.
                    </li>
                </ul>
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
                <DialogButtonPrimary onClick={ready}>Ready</DialogButtonPrimary>
                {props.alreadyUsingMagnet && <DialogButtonPrimary onClick={() => props.modalCloseRef.current?.()}>Cancel</DialogButtonPrimary>}
            </Focusable>
        </PanelSection> ||
        <PanelSection title={'Magnetometer Calibration - In progress'}>
            <ProgressBarWithInfo nProgress={(MagnetCalibrationSeconds - calibratingSecondsRemaining) / MagnetCalibrationSeconds}
                                 nTransitionSec={MagnetCalibrationSeconds}
                                 sOperationText={'Look around in all directions.'}
                                 sTimeRemaining={`${calibratingSecondsRemaining} seconds remaining`}
            />
        </PanelSection>
    }
    </ModalRoot>
}
