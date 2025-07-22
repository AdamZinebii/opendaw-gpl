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

@Xml.Class("MetaData")
export class MetaDataSchema {
    @Xml.Attribute("name", Xml.StringRequired)
    readonly name!: string
}

@Xml.Class("Application")
export class ApplicationSchema {
    @Xml.Attribute("name", Xml.StringRequired)
    readonly name!: string

    @Xml.Attribute("version", Xml.StringRequired)
    readonly version!: string
}

@Xml.Class("BooleanParameter")
export class BooleanParameterSchema {
    @Xml.Attribute("value", Xml.BoolRequired)
    readonly value?: boolean

    @Xml.Attribute("id")
    readonly id?: string

    @Xml.Attribute("name")
    readonly name?: string
}

@Xml.Class("RealParameter")
export class RealParameterSchema {
    @Xml.Attribute("value", Xml.NumberOptional)
    readonly value?: number

    @Xml.Attribute("unit")
    readonly unit!: Unit

    @Xml.Attribute("min", Xml.NumberOptional)
    readonly min?: number

    @Xml.Attribute("max", Xml.NumberOptional)
    readonly max?: number
}

@Xml.Class("TimeSignature")
export class TimeSignatureParameterSchema {
    @Xml.Attribute("nominator", Xml.NumberOptional)
    readonly nominator?: number

    @Xml.Attribute("denominator", Xml.NumberOptional)
    readonly denominator?: number
}

@Xml.Class("Parameter")
export class ParameterSchema implements Referenceable {
    @Xml.Attribute("id")
    readonly id?: string

    @Xml.Attribute("name")
    readonly name?: string

    @Xml.Attribute("value", Xml.NumberOptional)
    readonly value?: number

    @Xml.Attribute("unit")
    readonly unit?: Unit

    @Xml.Attribute("min", Xml.NumberOptional)
    readonly min?: number

    @Xml.Attribute("max", Xml.NumberOptional)
    readonly max?: number
}

@Xml.Class("State")
export class StateSchema {
    @Xml.Attribute("path")
    readonly path?: string
}

@Xml.Class("Send")
export class SendSchema {
    @Xml.Attribute("id")
    readonly id?: string

    @Xml.Attribute("name")
    readonly name?: string

    @Xml.Element("Value", RealParameterSchema)
    readonly value!: RealParameterSchema
}

@Xml.Class("Plugin")
export class PluginSchema implements Referenceable {
    @Xml.Attribute("id")
    readonly id?: string

    @Xml.Attribute("deviceID")
    readonly deviceID?: string

    @Xml.Attribute("deviceName")
    readonly deviceName?: string

    @Xml.Attribute("deviceRole")
    readonly deviceRole?: string

    @Xml.Attribute("loaded", Xml.BoolOptional)
    readonly loaded?: boolean

    @Xml.Attribute("name")
    readonly name?: string

    @Xml.Element("Parameters", ParameterSchema)
    readonly parameters?: ParameterSchema[]

    @Xml.Element("State", StateSchema)
    readonly state?: StateSchema

    @Xml.Element("Enabled", BooleanParameterSchema)
    readonly enabled?: BooleanParameterSchema
}

@Xml.Class("Devices")
export class DevicesSchema {
    @Xml.Element("Vst3Plugin", PluginSchema)
    readonly vst3plugin?: PluginSchema

    @Xml.Element("ClapPlugin", PluginSchema)
    readonly clapplugin?: PluginSchema

    @Xml.Element("AuPlugin", PluginSchema)
    readonly auplugin?: PluginSchema
}

@Xml.Class("Channel")
export class ChannelSchema implements Referenceable {
    @Xml.Attribute("id")
    readonly id?: string

    @Xml.Attribute("role")
    readonly role?: string

    @Xml.Attribute("audioChannels", Xml.NumberOptional)
    readonly audioChannels?: int

    @Xml.Attribute("destination")
    readonly destination?: string

    @Xml.Attribute("solo", Xml.BoolOptional)
    readonly solo?: boolean

    @Xml.Element("Devices", DevicesSchema)
    readonly devices?: DevicesSchema

    @Xml.Element("Volume", RealParameterSchema)
    readonly volume?: RealParameterSchema

    @Xml.Element("Pan", RealParameterSchema)
    readonly pan?: RealParameterSchema

    @Xml.Element("Mute", BooleanParameterSchema)
    readonly mute?: BooleanParameterSchema

    @Xml.Element("Send", SendSchema)
    readonly sends?: SendSchema[]
}

@Xml.Class("Transport")
export class TransportSchema {
    @Xml.Element("Tempo", RealParameterSchema)
    readonly tempo?: RealParameterSchema

    @Xml.Element("TimeSignature", TimeSignatureParameterSchema)
    readonly timeSignature?: TimeSignatureParameterSchema
}

@Xml.Class("Track")
export class TrackSchema implements Referenceable {
    @Xml.Attribute("id")
    readonly id?: string

    @Xml.Attribute("contentType")
    readonly contentType?: string

    @Xml.Attribute("name")
    readonly name?: string

    @Xml.Attribute("color")
    readonly color?: string

    @Xml.Attribute("loaded", Xml.BoolOptional)
    readonly loaded?: boolean

    @Xml.Element("Channel", ChannelSchema)
    readonly channel?: ChannelSchema

    @Xml.Element("Track", Array)
    readonly tracks?: ReadonlyArray<TrackSchema>
}

@Xml.Class("Lane")
export class LaneSchema implements Referenceable {
    @Xml.Attribute("id")
    readonly id?: string
}

@Xml.Class("Timeline")
export class TimelineSchema implements Referenceable {
    @Xml.Attribute("id")
    readonly id?: string

    @Xml.Attribute("timeUnit")
    readonly timeUnit?: string

    @Xml.Attribute("track")
    readonly track?: string
}

@Xml.Class("Note")
export class NoteSchema {
    @Xml.Attribute("time", Xml.NumberRequired)
    readonly time!: string

    @Xml.Attribute("duration", Xml.NumberRequired)
    readonly duration!: string

    @Xml.Attribute("channel", Xml.NumberRequired)
    readonly channel!: int

    @Xml.Attribute("key", Xml.NumberRequired)
    readonly key!: int

    @Xml.Attribute("vel", Xml.NumberOptional)
    readonly vel?: string

    @Xml.Attribute("rel", Xml.NumberOptional)
    readonly rel?: string
}

@Xml.Class("Notes")
export class NotesSchema extends TimelineSchema {
    @Xml.Element("Note", Array)
    readonly notes?: ReadonlyArray<NoteSchema>
}

@Xml.Class("Clip")
export class ClipSchema implements Nameable {
    @Xml.Attribute("name")
    readonly name?: string

    @Xml.Attribute("color")
    readonly color?: string

    @Xml.Attribute("comment")
    readonly comment?: string

    @Xml.Attribute("time", Xml.NumberOptional)
    readonly time!: number

    @Xml.Attribute("duration", Xml.NumberOptional)
    readonly duration?: number

    @Xml.Attribute("contentTimeUnit")
    readonly contentTimeUnit?: string

    @Xml.Attribute("playStart", Xml.NumberOptional)
    readonly playStart?: number

    @Xml.Attribute("playStop", Xml.NumberOptional)
    readonly playStop?: number

    @Xml.Attribute("loopStart", Xml.NumberOptional)
    readonly loopStart?: number

    @Xml.Attribute("loopEnd", Xml.NumberOptional)
    readonly loopEnd?: number

    @Xml.Attribute("fadeTimeUnit")
    readonly fadeTimeUnit?: string

    @Xml.Attribute("fadeInTime", Xml.NumberOptional)
    readonly fadeInTime?: number

    @Xml.Attribute("fadeOutTime", Xml.NumberOptional)
    readonly fadeOutTime?: number

    @Xml.Attribute("enable", Xml.BoolOptional)
    readonly enable?: boolean

    @Xml.Attribute("reference")
    readonly reference?: string
}

@Xml.Class("Clips")
export class ClipsSchema extends TimelineSchema {
    @Xml.Element("Clip", Array)
    readonly clips!: ReadonlyArray<ClipSchema>
}

@Xml.Class("ClipSlot")
export class ClipSlotSchema extends TimelineSchema {
    @Xml.Element("Clip", ClipSchema)
    readonly clip?: ClipSchema

    @Xml.Attribute("hasStop", Xml.BoolOptional)
    readonly hasStop?: boolean
}

@Xml.Class("Marker")
export class MarkerSchema implements Referenceable {
    @Xml.Attribute("id")
    readonly id?: string

    @Xml.Attribute("name")
    readonly name?: string

    @Xml.Attribute("color")
    readonly color?: string

    @Xml.Attribute("comment")
    readonly comment?: string

    @Xml.Attribute("time", Xml.NumberRequired)
    readonly time!: number
}

@Xml.Class("Markers")
export class MarkersSchema {
    @Xml.Element("Marker", Array)
    readonly marker!: ReadonlyArray<MarkerSchema>
}

@Xml.Class("Warp")
export class WarpSchema {
    @Xml.Attribute("time", Xml.NumberRequired)
    readonly time!: number

    @Xml.Attribute("contentTime", Xml.NumberRequired)
    readonly contentTime!: number
}

@Xml.Class("Warps")
export class WarpsSchema extends TimelineSchema {
    @Xml.Element("Warp", Array)
    readonly warps!: ReadonlyArray<WarpSchema>

    @Xml.Attribute("contentTimeUnit")
    readonly contentTimeUnit!: string
}

@Xml.Class("File")
export class FileReferenceSchema {
    @Xml.Attribute("path")
    readonly path!: string

    @Xml.Attribute("external", Xml.BoolOptional)
    readonly external?: boolean
}

@Xml.Class("MediaFile")
export class MediaFileSchema extends TimelineSchema {
    @Xml.Element("File", FileReferenceSchema)
    readonly file!: FileReferenceSchema

    @Xml.Attribute("duration", Xml.NumberRequired)
    readonly duration!: number
}

@Xml.Class("Audio")
export class AudioSchema extends MediaFileSchema {
    @Xml.Attribute("algorithm")
    readonly algorithm?: string

    @Xml.Attribute("channels", Xml.NumberRequired)
    readonly channels!: int

    @Xml.Attribute("sampleRate", Xml.NumberRequired)
    readonly sampleRate!: int
}

@Xml.Class("Video")
export class VideoSchema extends MediaFileSchema {
    @Xml.Attribute("algorithm")
    readonly algorithm?: string

    @Xml.Attribute("channels", Xml.NumberRequired)
    readonly channels!: int

    @Xml.Attribute("sampleRate", Xml.NumberRequired)
    readonly sampleRate!: int
}

@Xml.Class("AutomationTarget")
export class AutomationTargetSchema {
    @Xml.Attribute("parameter")
    readonly parameter?: string

    @Xml.Attribute("expression")
    readonly expression?: string

    @Xml.Attribute("channel", Xml.NumberOptional)
    readonly channel?: int

    @Xml.Attribute("key", Xml.NumberOptional)
    readonly key?: int

    @Xml.Attribute("controller", Xml.NumberOptional)
    readonly controller?: int
}

@Xml.Class("Point")
export class PointSchema {
    @Xml.Attribute("time")
    readonly time!: string

    @Xml.Attribute("value")
    readonly value?: any

    @Xml.Attribute("interpolation")
    readonly interpolation?: Interpolation
}

@Xml.Class("Points")
export class PointsSchema extends TimelineSchema {
    @Xml.Element("Target", AutomationTargetSchema)
    readonly target?: AutomationTargetSchema

    @Xml.Element("Point", Array)
    readonly points?: ReadonlyArray<PointSchema>

    @Xml.Attribute("unit")
    readonly unit?: Unit
}

@Xml.Class("Lanes")
export class LanesSchema implements Referenceable {
    @Xml.Attribute("id")
    readonly id?: string

    @Xml.Element("Timeline", Array)
    readonly timelines?: ReadonlyArray<TimelineSchema>

    @Xml.Element("Lanes", Array)
    readonly subLanes?: LanesSchema[]

    @Xml.Element("Notes", Array)
    readonly notes?: NotesSchema[]

    @Xml.Element("Clips", Array)
    readonly clips?: ClipsSchema[]

    @Xml.Element("ClipSlot", Array)
    readonly clipSlots?: ClipSlotSchema[]

    @Xml.Element("markers", Array)
    readonly markerTracks?: MarkersSchema[]

    @Xml.Element("Warps", Array)
    readonly warps?: WarpsSchema[]

    @Xml.Element("Audio", Array)
    readonly audio?: AudioSchema[]

    @Xml.Element("Video", Array)
    readonly video?: VideoSchema[]

    @Xml.Element("Points", Array)
    readonly automation?: PointsSchema[]
}

@Xml.Class("Arrangement")
export class ArrangementSchema implements Referenceable {
    @Xml.Attribute("id")
    readonly id?: string

    @Xml.Element("Lanes", LanesSchema)
    readonly lanes?: LanesSchema

    @Xml.Element("Markers", Array)
    readonly markers?: MarkerSchema[]

    @Xml.Element("TempoAutomation", PointsSchema)
    readonly tempoAutomation?: PointsSchema

    @Xml.Element("TimeSignatureAutomation", PointsSchema)
    readonly timeSignatureAutomation?: PointsSchema
}

@Xml.Class("Scene")
export class SceneSchema implements Referenceable {
    @Xml.Attribute("id")
    readonly id?: string

    @Xml.Element("Timeline", TimelineSchema)
    readonly timeline?: TimelineSchema

    @Xml.Element("Lanes", LanesSchema)
    readonly lanes?: LanesSchema

    @Xml.Element("Notes", NotesSchema)
    readonly notes?: NotesSchema

    @Xml.Element("Clips", ClipsSchema)
    readonly clips?: ClipsSchema

    @Xml.Element("ClipSlot", ClipSlotSchema)
    readonly clipSlot?: ClipSlotSchema

    @Xml.Element("markers", MarkersSchema)
    readonly markers?: MarkersSchema

    @Xml.Element("Warps", WarpsSchema)
    readonly warps?: WarpsSchema

    @Xml.Element("Audio", AudioSchema)
    readonly audio?: AudioSchema

    @Xml.Element("Video", VideoSchema)
    readonly video?: VideoSchema

    @Xml.Element("Points", PointsSchema)
    readonly points?: PointsSchema
}

@Xml.Class("Project")
export class ProjectSchema {
    @Xml.Attribute("version", Xml.StringRequired)
    readonly version!: "1.0"

    @Xml.Element("Application", ApplicationSchema)
    readonly application!: ApplicationSchema

    @Xml.Element("Transport", TransportSchema)
    readonly transport?: TransportSchema

    @Xml.Element("Structure", Array)
    readonly structure!: ReadonlyArray<LaneSchema>

    @Xml.Element("Arrangement", ArrangementSchema)
    readonly arrangement?: ArrangementSchema

    @Xml.Element("Scenes", Array)
    readonly scenes?: ReadonlyArray<SceneSchema>
}