

export enum FeatureStatus {
    Off = "off",
    Trial = "trial",
    On = "on"
}

export type FeatureTierPeriodType = "monthly" | "yearly" | "lifetime";
export type TierPeriodFundsNeeded = { [type in FeatureTierPeriodType]?: number }

export interface LicenseFeature {
    status: FeatureStatus;
    endDate?: number;
}


// TODO - utilize fundsNeededByPeriod instead of fundsToRenew
export interface LicenseTier {
    active: boolean;
    endDate?: number;
    period?: FeatureTierPeriodType;

    // this tells us how much funds are needed to renew the tier (if it's not lifetime and is currently active), or upgrade
    // if it's not the active tier (or a step down)
    fundsNeededByPeriod?: TierPeriodFundsNeeded;

    // deprecated fields, check fundsNeededByPeriod instead
    fundsToRenew?: boolean;
    fundsNeededUSD?: number;
    lifetimeFundsNeededUSD?: number;
}

export interface License {
    hardwareId: string;
    confirmedToken?: boolean;
    tiers?: {
        [key: string]: LicenseTier;
    },
    features?: {
        [key: string]: LicenseFeature;
    };
}

export const SupporterTierFeatureNames = ["sbs", "smooth_follow"];

export function toSec(date: number) {
    return date / 1000;
}

export function secondsRemaining(date: number | undefined) {
    const now = toSec(Date.now());
    return (date ?? Infinity) - now;
}

export interface LicenseFeatureDetails {
    enabled: boolean;
    subtext?: string;
}
export function featureDetails(license: License | undefined, featureName: string): LicenseFeatureDetails {
    return {
        enabled: featureEnabled(license, featureName),
        subtext: featureSubtext(license, featureName)
    }
}

export function featureEnabled(license: License | undefined, featureName: string): boolean {
    const feature = license?.features?.[featureName];
    if (!feature) return false;

    const now = toSec(Date.now());
    const secondsRemaining = (feature.endDate ?? Infinity) - now;
    return (feature?.status === FeatureStatus.On || feature?.status === FeatureStatus.Trial) && secondsRemaining > 0;
}

export function trialTimeRemaining(license?: License): number | undefined {
    const features = Object.keys(license?.features ?? {}).filter(feature => {
        if (!SupporterTierFeatureNames.includes(feature)) return false;

        return license?.features?.[feature].status === FeatureStatus.Trial;
    });
    if (features.length === 0) return;

    const now = toSec(Date.now());
    let earliestExpiringTrialDate: number | undefined;
    for (let feature of features) {
        const featureEndDate = license?.features?.[feature].endDate;
        if (!featureEndDate || featureEndDate < now) continue;
        if (!earliestExpiringTrialDate || featureEndDate < earliestExpiringTrialDate) {
            earliestExpiringTrialDate = featureEndDate;
        }
    }

    if (!earliestExpiringTrialDate) return;
    return secondsRemaining(earliestExpiringTrialDate);
}

const SecondsPerHour = 60 * 60;
const SecondsPerDay = 24 * SecondsPerHour;
const EndDateWarnDays = 30;
const EndDateWarnHours = 24;
export function timeRemainingText(seconds?: number): string | undefined {
    if (!seconds) return;

    if (seconds < SecondsPerHour) {
        return `less than an hour`
    } else if (seconds / SecondsPerHour < EndDateWarnHours) {
        const timeRemaining = Math.floor(seconds / SecondsPerHour);
        return timeRemaining === 1 ? '1 hour' : `${timeRemaining} hours`
    } else if (seconds / SecondsPerDay < EndDateWarnDays) {
        const timeRemaining = Math.floor(seconds / SecondsPerDay);
        return timeRemaining === 1 ? '1 day' : `${timeRemaining} days`
    } else {
        return;
    }
}

export function featureSubtext(license: License | undefined, featureName: string): string | undefined {
    const now = toSec(Date.now());
    const feature = license?.features?.[featureName];
    if ((feature?.status ?? FeatureStatus.Off) === FeatureStatus.Off) return "Supporter Tier feature";

    const secondsRemaining = (feature?.endDate ?? Infinity) - now;
    if (secondsRemaining < 0) {
        switch (feature?.status) {
            case FeatureStatus.On:
                return "Supporter Tier expired";
            case FeatureStatus.Trial:
                return "Trial period expired";
        }
        return;
    }

    const timeRemaining = timeRemainingText(secondsRemaining);
    if (timeRemaining) {
        switch (feature?.status) {
            case FeatureStatus.On:
                return `Supporter Tier: ${timeRemaining} left`;
            case FeatureStatus.Trial:
                return `Trial feature: ${timeRemaining} left`;
        }
    }

    switch (feature?.status) {
        case FeatureStatus.On:
            return "Supporter Tier feature";
        case FeatureStatus.Trial:
            return "Supporter Tier trial feature";
    }
    return;
}