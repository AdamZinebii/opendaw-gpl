import {AudioUnitBox, TrackBox} from "@opendaw/studio-boxes"
import {InstrumentBox} from "./InstrumentBox"

export type InstrumentProduct = {
    audioUnitBox: AudioUnitBox
    instrumentBox: InstrumentBox
    trackBox: TrackBox
}