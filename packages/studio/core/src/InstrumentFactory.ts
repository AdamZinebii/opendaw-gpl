import {DeviceHost, IconSymbol, TrackType} from "@opendaw/studio-adapters"
import {BoxGraph} from "@opendaw/lib-box"

import {InstrumentBox} from "./InstrumentBox"

export interface InstrumentFactory {
    defaultName: string
    defaultIcon: IconSymbol
    description: string
    trackType: TrackType
    create: (boxGraph: BoxGraph, deviceHost: DeviceHost, name: string, icon: IconSymbol) => InstrumentBox
}