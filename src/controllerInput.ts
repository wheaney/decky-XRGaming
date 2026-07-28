// Detects a controller button combo via SteamClient.Input instead of reading raw evdev
// devices. Steam Input can exclusively grab the physical controller during gameplay, which
// made a backend evdev listener unreliable (invisible even to evtest). SteamClient.Input
// reflects Steam's own already-processed controller state, so it keeps working regardless of
// what Steam Input is doing with the device. Adapted from the technique used by
// https://github.com/steam3d/MagicBlackDecky/blob/main/src/input.tsx.

declare global {
    interface Window {
        SteamClient: any;
    }
}

// Bit positions within SteamClient's ulButtons/ulUpperButtons masks (lower 32 bits and upper
// 32 bits, respectively).
const L4 = 9 + 32;
const R4 = 10 + 32;

// Recenter triggers on holding both back-grip buttons together: rarely bound by games, and
// reachable without taking your thumbs off the sticks.
const RECENTER_COMBO = [L4, R4];

function decodeHeldButtons(change: any): number[] {
    const held: number[] = [];
    (change.ulButtons as number).toString(2).padStart(32, "0").split("").forEach((bit, index) => {
        if (bit === "1") held.push(31 - index);
    });
    (change.ulUpperButtons as number).toString(2).padStart(32, "0").split("").forEach((bit, index) => {
        if (bit === "1") held.push(63 - index);
    });
    return held;
}

export function isControllerInputSupported(): boolean {
    return (window as any).SteamClient?.Input?.RegisterForControllerStateChanges != null;
}

// Registers for controller state changes and invokes onComboPressed whenever every button in
// RECENTER_COMBO transitions from not-held to held (debounced by that edge, not by holding).
// Returns an unregister function, or null if SteamClient.Input isn't available.
export function registerRecenterComboListener(onComboPressed: () => void): (() => void) | null {
    if (!isControllerInputSupported()) {
        return null;
    }

    let comboHeld = false;
    const registration = (window as any).SteamClient.Input.RegisterForControllerStateChanges((changes: any[]) => {
        for (const change of changes) {
            const held = new Set(decodeHeldButtons(change));
            const comboNowHeld = RECENTER_COMBO.every((code) => held.has(code));
            if (comboNowHeld && !comboHeld) {
                onComboPressed();
            }
            comboHeld = comboNowHeld;
        }
    });

    return () => registration?.unregister();
}
