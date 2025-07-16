import {AudioUnitBox, TrackBox} from "@opendaw/studio-boxes"

import {InstrumentBox} from "./InstrumentBox"

export type InstrumentProduct = {
    audioUnit: AudioUnitBox
    instrument: InstrumentBox
    track: TrackBox
}