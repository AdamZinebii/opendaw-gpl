import {unitValue} from "@opendaw/lib-std"

export type SampleLoaderState =
    | { type: "idle" }
    | { type: "progress", progress: unitValue }
    | { type: "error", reason: string }
    | { type: "loaded" }