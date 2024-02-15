import { gamepadDialogClasses } from "decky-frontend-lib";
import { Fragment } from "react";
import { BiSolidLock } from "react-icons/bi";
import { LicenseFeatureDetails } from "./license";

export interface Props {
    label: string;
    feature: LicenseFeatureDetails;
}

export function SupporterTierFeatureLabel({label, feature}: Props) {
    return <span>
        {label}{feature.subtext && <Fragment><br/>
            <span className={gamepadDialogClasses.FieldDescription} style={{fontStyle: 'italic'}}>
                {!feature.enabled && <BiSolidLock style={{position: 'relative', top: '1px', left: '-3px'}} />}
                {feature.subtext}
            </span>
        </Fragment>}
    </span>
}