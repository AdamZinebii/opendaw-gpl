// noinspection JSUnusedGlobalSymbols

import {Xml} from "@opendaw/lib-xml"
import type {int} from "@opendaw/lib-std"

interface Nameable {
    name?: string
    color?: string
    comment?: string
}

interface Referenceable extends Nameable {
    id?: string
}

//--- ENUMS ---//

export enum Unit {
    LINEAR = "linear",
    NORMALIZED = "normalized",
    PERCENT = "percent",
    DECIBEL = "decibel",
    HERTZ = "hertz",
    SEMITONES = "semitones",
    SECONDS = "seconds",
    BEATS = "beats",
    BPM = "bpm"
}

export enum Interpolation {
    HOLD = "hold",
    LINEAR = "linear"
}

//--- CLASSES ---//

export class ProjectSchema {
    @Xml.Attribute("version", version => version === "1.0")
    readonly version: "1.0" = "1.0"

    @Xml.Element("Application")
    readonly application!: ApplicationSchema

    @Xml.Element("Transport")
    readonly transport?: TransportSchema

    @Xml.Element("Structure")
    readonly structure!: ReadonlyArray<LaneSchema>

    @Xml.Element("Arrangement")
    readonly arrangement?: ArrangementSchema

    @Xml.Element("Scenes")
    readonly scenes?: SceneSchema[]
}

export class ApplicationSchema {
    @Xml.Attribute("name")
    readonly name!: string

    @Xml.Attribute("version")
    readonly version!: string
}

export class TransportSchema {
    @Xml.Element("Tempo")
    readonly tempo?: RealParameterSchema

    @Xml.Element("TimeSignature")
    readonly timeSignature?: TimeSignatureParameterSchema
}

export class RealParameterSchema {
    @Xml.Attribute("value")
    readonly value?: number

    @Xml.Attribute("unit")
    readonly unit!: Unit

    @Xml.Attribute("min")
    readonly min?: number

    @Xml.Attribute("max")
    readonly max?: number
}

export class TimeSignatureParameterSchema {
    @Xml.Attribute("nominator")
    readonly nominator?: number

    @Xml.Attribute("denominator")
    readonly denominator?: number
}

@Xml.RootElement("Lane")
export class LaneSchema implements Referenceable {
    @Xml.Attribute("id")
    readonly id?: string
}

@Xml.RootElement("Track")
export class TrackSchema implements Referenceable {
    @Xml.Attribute("id")
    readonly id?: string

    @Xml.Attribute("contentType")
    readonly contentType?: string

    @Xml.Attribute("name")
    readonly name?: string

    @Xml.Attribute("color")
    readonly color?: string

    @Xml.Attribute("loaded")
    readonly loaded?: boolean

    @Xml.Element("Channel")
    readonly channel?: ChannelSchema

    @Xml.Element("Track")
    readonly tracks?: ReadonlyArray<TrackSchema>
}

@Xml.RootElement("Channel")
export class ChannelSchema implements Referenceable {
    @Xml.Attribute("id") readonly id?: string
    @Xml.Attribute("role") readonly role?: string
    @Xml.Attribute("audioChannels") readonly audioChannels?: int
    @Xml.Attribute("destination") readonly destination?: string
    @Xml.Attribute("solo") readonly solo?: boolean

    @Xml.Element("Devices")
    readonly devices?: DevicesSchema

    @Xml.Element("Volume")
    readonly volume?: RealParameterSchema

    @Xml.Element("Pan")
    readonly pan?: RealParameterSchema

    @Xml.Element("Mute")
    readonly mute?: BooleanParameterSchema

    @Xml.Element("Send")
    readonly sends?: SendSchema[]
}

export class DevicesSchema {
    @Xml.Element("Vst3Plugin")
    readonly vst3plugin?: PluginSchema

    @Xml.Element("ClapPlugin")
    readonly clapplugin?: PluginSchema

    @Xml.Element("AuPlugin")
    readonly auplugin?: PluginSchema
}

export class PluginSchema implements Referenceable {
    @Xml.Attribute("id") readonly id?: string
    @Xml.Attribute("deviceID") readonly deviceID?: string
    @Xml.Attribute("deviceName") readonly deviceName?: string
    @Xml.Attribute("deviceRole") readonly deviceRole?: string
    @Xml.Attribute("loaded") readonly loaded?: boolean
    @Xml.Attribute("name") readonly name?: string

    @Xml.Element("Parameters")
    readonly parameters?: ParameterSchema[]

    @Xml.Element("State")
    readonly state?: StateSchema

    @Xml.Element("Enabled")
    readonly enabled?: BooleanParameterSchema
}

export class ParameterSchema implements Referenceable {
    @Xml.Attribute("id") readonly id?: string
    @Xml.Attribute("name") readonly name?: string
    @Xml.Attribute("value") readonly value?: number
    @Xml.Attribute("unit") readonly unit?: Unit
    @Xml.Attribute("min") readonly min?: number
    @Xml.Attribute("max") readonly max?: number
}

export class StateSchema {
    @Xml.Attribute("path") readonly path?: string
}

export class BooleanParameterSchema {
    @Xml.Attribute("value") readonly value?: boolean
    @Xml.Attribute("id") readonly id?: string
    @Xml.Attribute("name") readonly name?: string
}

export class SendSchema {
    @Xml.Attribute("id") readonly id?: string
    @Xml.Attribute("name") readonly name?: string

    @Xml.Element("Value")
    readonly value!: RealParameterSchema
}

export class ArrangementSchema implements Referenceable {
    @Xml.Attribute("id") readonly id?: string

    @Xml.Element("Lanes")
    readonly lanes?: LanesSchema

    @Xml.Element("Markers")
    readonly markers?: MarkerSchema[]

    @Xml.Element("TempoAutomation")
    readonly tempoAutomation?: PointsSchema

    @Xml.Element("TimeSignatureAutomation")
    readonly timeSignatureAutomation?: PointsSchema
}

export class LanesSchema implements Referenceable {
    @Xml.Attribute("id") readonly id?: string

    @Xml.Element("Timeline") readonly timelines?: TimelineSchema[]
    @Xml.Element("Lanes") readonly subLanes?: LanesSchema[]
    @Xml.Element("Notes") readonly notes?: NotesSchema[]
    @Xml.Element("Clips") readonly clips?: ClipsSchema[]
    @Xml.Element("ClipSlot") readonly clipSlots?: ClipSlotSchema[]
    @Xml.Element("markers") readonly markerTracks?: MarkersSchema[]
    @Xml.Element("Warps") readonly warps?: WarpsSchema[]
    @Xml.Element("Audio") readonly audio?: AudioSchema[]
    @Xml.Element("Video") readonly video?: VideoSchema[]
    @Xml.Element("Points") readonly automation?: PointsSchema[]
}

export class MarkerSchema implements Referenceable {
    @Xml.Attribute("id") readonly id?: string
    @Xml.Attribute("name") readonly name?: string
    @Xml.Attribute("color") readonly color?: string
    @Xml.Attribute("comment") readonly comment?: string
    @Xml.Attribute("time") readonly time!: number
}

export class MarkersSchema {
    @Xml.Element("Marker") readonly marker!: MarkerSchema[]
}

export class SceneSchema implements Referenceable {
    @Xml.Attribute("id") readonly id?: string
    @Xml.Element("Timeline") readonly timeline?: TimelineSchema
    @Xml.Element("Lanes") readonly lanes?: LanesSchema
    @Xml.Element("Notes") readonly notes?: NotesSchema
    @Xml.Element("Clips") readonly clips?: ClipsSchema
    @Xml.Element("ClipSlot") readonly clipSlot?: ClipSlotSchema
    @Xml.Element("markers") readonly markers?: MarkersSchema
    @Xml.Element("Warps") readonly warps?: WarpsSchema
    @Xml.Element("Audio") readonly audio?: AudioSchema
    @Xml.Element("Video") readonly video?: VideoSchema
    @Xml.Element("Points") readonly points?: PointsSchema
}

export class TimelineSchema implements Referenceable {
    @Xml.Attribute("id") readonly id?: string
    @Xml.Attribute("timeUnit") readonly timeUnit?: string
    @Xml.Attribute("track") readonly track?: string
}

export class NotesSchema extends TimelineSchema {
    @Xml.Element("Note") readonly notes?: NoteSchema[]
}

export class NoteSchema {
    @Xml.Attribute("time") readonly time!: string
    @Xml.Attribute("duration") readonly duration!: string
    @Xml.Attribute("channel") readonly channel!: int
    @Xml.Attribute("key") readonly key!: int
    @Xml.Attribute("vel") readonly vel?: string
    @Xml.Attribute("rel") readonly rel?: string
}

export class ClipsSchema extends TimelineSchema {
    @Xml.Element("Clip") readonly clips!: ClipSchema[]
}

export class ClipSchema implements Nameable {
    @Xml.Attribute("name") readonly name?: string
    @Xml.Attribute("color") readonly color?: string
    @Xml.Attribute("comment") readonly comment?: string
    @Xml.Attribute("time") readonly time!: number
    @Xml.Attribute("duration") readonly duration?: number
    @Xml.Attribute("contentTimeUnit") readonly contentTimeUnit?: string
    @Xml.Attribute("playStart") readonly playStart?: number
    @Xml.Attribute("playStop") readonly playStop?: number
    @Xml.Attribute("loopStart") readonly loopStart?: number
    @Xml.Attribute("loopEnd") readonly loopEnd?: number
    @Xml.Attribute("fadeTimeUnit") readonly fadeTimeUnit?: string
    @Xml.Attribute("fadeInTime") readonly fadeInTime?: number
    @Xml.Attribute("fadeOutTime") readonly fadeOutTime?: number
    @Xml.Attribute("enable") readonly enable?: boolean
    @Xml.Attribute("reference") readonly reference?: string
}

export class ClipSlotSchema extends TimelineSchema {
    @Xml.Element("Clip") readonly clip?: ClipSchema
    @Xml.Attribute("hasStop") readonly hasStop?: boolean
}

export class WarpsSchema extends TimelineSchema {
    @Xml.Element("Warp") readonly warps!: WarpSchema[]
    @Xml.Attribute("contentTimeUnit") readonly contentTimeUnit!: string
}

export class WarpSchema {
    @Xml.Attribute("time") readonly time!: number
    @Xml.Attribute("contentTime") readonly contentTime!: number
}

export class MediaFileSchema extends TimelineSchema {
    @Xml.Element("File") readonly file!: FileReferenceSchema
    @Xml.Attribute("duration") readonly duration!: number
}

export class AudioSchema extends MediaFileSchema {
    @Xml.Attribute("algorithm") readonly algorithm?: string
    @Xml.Attribute("channels") readonly channels!: int
    @Xml.Attribute("sampleRate") readonly sampleRate!: int
}

export class VideoSchema extends MediaFileSchema {
    @Xml.Attribute("algorithm") readonly algorithm?: string
    @Xml.Attribute("channels") readonly channels!: int
    @Xml.Attribute("sampleRate") readonly sampleRate!: int
}

export class FileReferenceSchema {
    @Xml.Attribute("path") readonly path!: string
    @Xml.Attribute("external") readonly external?: boolean
}

export class PointsSchema extends TimelineSchema {
    @Xml.Element("Target") readonly target?: AutomationTargetSchema
    @Xml.Element("Point") readonly points?: PointSchema[]
    @Xml.Attribute("unit") readonly unit?: Unit
}

export class AutomationTargetSchema {
    @Xml.Attribute("parameter") readonly parameter?: string
    @Xml.Attribute("expression") readonly expression?: string
    @Xml.Attribute("channel") readonly channel?: int
    @Xml.Attribute("key") readonly key?: int
    @Xml.Attribute("controller") readonly controller?: int
}

export class PointSchema {
    @Xml.Attribute("time") readonly time!: string
    @Xml.Attribute("value") readonly value?: any
    @Xml.Attribute("interpolation") readonly interpolation?: Interpolation
}
