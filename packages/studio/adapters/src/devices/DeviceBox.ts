import {Pointers} from "@opendaw/studio-enums"
import {BooleanField, Box, Int32Field, PointerField, StringField} from "@opendaw/lib-box"

export type DeviceBox = {
    host: PointerField
    label: StringField
    enabled: BooleanField
    minimized: BooleanField
} & Box

export type InstrumentDeviceBox = {
    host: PointerField<Pointers.InstrumentHost>
} & DeviceBox

export type EffectDeviceBox = {
    host: PointerField<Pointers.AudioEffectHost | Pointers.MidiEffectHost>
    index: Int32Field
} & DeviceBox