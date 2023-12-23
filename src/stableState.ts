import {Dispatch, SetStateAction, useEffect, useState} from "react";

// allows for setting a dirty state that doesn't take effect (as a stable state) until a delay has passed without change
export function useStableState<T>(initialState: T, delay: number) : [T, T, Dispatch<SetStateAction<T>>] {
    const [dirtyState, setDirtyState] = useState(initialState);
    const [stableState, setStableState] = useState(initialState);

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            setStableState(dirtyState);
        }, delay);

        return () => clearTimeout(timeoutId);
    }, [dirtyState, delay]);

    return [dirtyState, stableState, setDirtyState];
}