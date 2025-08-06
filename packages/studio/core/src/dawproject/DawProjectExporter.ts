import {asDefined, asInstanceOf, Color, ifDefined, int, isInstanceOf, Nullish, Option, UUID} from "@opendaw/lib-std"
import {Xml} from "@opendaw/lib-xml"
import {dbToGain, PPQN} from "@opendaw/lib-dsp"
import {
    ApplicationSchema,
    ArrangementSchema,
    AudioAlgorithm,
    AudioSchema,
    BooleanParameterSchema,
    BuiltinDeviceSchema,
    ChannelRole,
    ChannelSchema,
    ClipSchema,
    ClipsSchema,
    DeviceRole,
    DeviceSchema,
    FileReferenceSchema,
    LanesSchema,
    NoteSchema,
    NotesSchema,
    ParameterEncoder,
    ProjectSchema,
    RealParameterSchema,
    TimelineSchema,
    TimeSignatureParameterSchema,
    TimeUnit,
    TrackSchema,
    TransportSchema,
    Unit,
    WarpSchema,
    WarpsSchema
} from "@opendaw/lib-dawproject"
import {AddressIdEncoder, BooleanField, Field} from "@opendaw/lib-box"
import {AudioUnitType} from "@opendaw/studio-enums"
import {
    AudioFileBox,
    AudioRegionBox,
    AudioUnitBox,
    BoxVisitor,
    NoteEventBox,
    NoteEventCollectionBox,
    NoteRegionBox,
    TrackBox,
    ValueEventCollectionBox,
    ValueRegionBox
} from "@opendaw/studio-boxes"
import {readLabel} from "./utils"
import {Project} from "../Project"
import {AudioUnitExportLayout} from "./AudioUnitExportLayout"
import {Colors} from "../Colors"
import {ColorCodes} from "../ColorCodes"
import {Html} from "@opendaw/lib-dom"

export namespace DawProjectExporter {
    export interface ResourcePacker {
        write(path: string, buffer: ArrayBuffer): FileReferenceSchema
    }

    export const write = (project: Project, resources: ResourcePacker) => {
        const ids = new AddressIdEncoder()
        const {timelineBox, rootBox, boxGraph, sampleManager} = project
        const audioUnits: ReadonlyArray<AudioUnitBox> = rootBox.audioUnits.pointerHub.incoming()
            .map(({box}) => asInstanceOf(box, AudioUnitBox))
            .sort((a, b) => a.index.getValue() - b.index.getValue())

        const writeTransport = (): TransportSchema => Xml.element({
            tempo: Xml.element({
                id: ids.getOrCreate(timelineBox.bpm.address),
                value: timelineBox.bpm.getValue(),
                unit: Unit.BPM
            }, RealParameterSchema),
            timeSignature: Xml.element({
                numerator: timelineBox.signature.nominator.getValue(),
                denominator: timelineBox.signature.denominator.getValue()
            }, TimeSignatureParameterSchema)
        }, TransportSchema)

        const writeDevices = (field: Field, deviceRole: string): ReadonlyArray<DeviceSchema> => field.pointerHub
            .incoming().map(({box}) => {
                const enabled: Nullish<BooleanParameterSchema> = ("enabled" in box && isInstanceOf(box.enabled, BooleanField)
                    ? Option.wrap(box.enabled)
                    : Option.None)
                    .mapOr(field => ParameterEncoder.bool(ids.getOrCreate(field.address), field.getValue(),
                        "On/Off"), undefined)
                const deviceID = UUID.toString(box.address.uuid)
                const deviceName = box.name
                const deviceVendor = "openDAW"
                const id = ids.getOrCreate(box.address)
                const name = readLabel(box)
                return Xml.element({
                    id,
                    name,
                    deviceID,
                    deviceRole,
                    deviceName,
                    deviceVendor,
                    enabled,
                    loaded: true,
                    automatedParameters: [],
                    state: undefined /*resources.write(`presets/${UUID.toString(box.address.uuid)}`, arrayBuffer as ArrayBuffer)*/
                }, BuiltinDeviceSchema)
            })

        const colorForAudioType = (unitType: AudioUnitType): string => {
            const cssColor = ColorCodes.forAudioType(unitType)
            if (cssColor === "") {return "red"}
            const [r, g, b] = Html.readCssVarColor(ColorCodes.forAudioType(unitType))[0]
            const RR = Math.round(r * 255).toString(16)
            const GG = Math.round(g * 255).toString(16)
            const BB = Math.round(b * 255).toString(16)
            return `#${RR}${GG}${BB}`
        }

        const writeStructure = (): ReadonlyArray<TrackSchema> => {
            const tracks = AudioUnitExportLayout.layout(audioUnits)
            const writeAudioUnitBox = (audioUnitBox: AudioUnitBox,
                                       tracks?: ReadonlyArray<TrackSchema>): TrackSchema => {
                const unitType = audioUnitBox.type.getValue() as AudioUnitType
                const color = colorForAudioType(unitType)
                console.debug("", unitType, color, Colors.orange)
                const isPrimary = unitType === AudioUnitType.Output
                const inputBox = audioUnitBox.input.pointerHub.incoming().at(0)?.box
                return Xml.element({
                    id: ids.getOrCreate(audioUnitBox.address),
                    name: readLabel(inputBox),
                    loaded: true,
                    color,
                    contentType: isPrimary
                        ? "audio notes" // we copied that value from bitwig
                        : (() =>
                        // TODO Another location to remember to put devices in...?
                        //  We could also read the first track type?
                        inputBox?.accept<BoxVisitor<string>>({
                            visitTapeDeviceBox: () => "audio",
                            visitVaporisateurDeviceBox: () => "notes",
                            visitNanoDeviceBox: () => "notes",
                            visitPlayfieldDeviceBox: () => "notes",
                            visitAudioBusBox: () => "tracks"
                        }))() ?? undefined,
                    channel: Xml.element({
                        id: ifDefined(inputBox, ({address}) => ids.getOrCreate(address)),
                        destination: isPrimary
                            ? undefined
                            : audioUnitBox.output.targetVertex.mapOr(({box}) => ids.getOrCreate(box.address), undefined),
                        role: (() => {
                            switch (unitType) {
                                case AudioUnitType.Instrument:
                                    return ChannelRole.REGULAR
                                case AudioUnitType.Aux:
                                    return ChannelRole.EFFECT
                                case AudioUnitType.Output:
                                    return ChannelRole.MASTER
                            }
                            return undefined
                        })(),
                        devices: [
                            ...(writeDevices(audioUnitBox.midiEffects, DeviceRole.NOTE_FX)),
                            ...(writeDevices(audioUnitBox.input, DeviceRole.INSTRUMENT)),
                            ...(writeDevices(audioUnitBox.audioEffects, DeviceRole.AUDIO_FX))
                        ],
                        volume: ParameterEncoder.linear(ids.getOrCreate(audioUnitBox.volume.address),
                            dbToGain(audioUnitBox.volume.getValue()), 0.0, 2.0,
                            "Volume"),
                        pan: ParameterEncoder.normalized(ids.getOrCreate(audioUnitBox.panning.address),
                            (audioUnitBox.panning.getValue() + 1.0) / 2.0, 0.0, 1.0,
                            "Pan")
                    }, ChannelSchema),
                    tracks
                }, TrackSchema)
            }
            const writeTracks = (tracks: ReadonlyArray<AudioUnitExportLayout.Track>, depth: int): ReadonlyArray<TrackSchema> => {
                return tracks.map((track: AudioUnitExportLayout.Track) => {
                    console.debug(`${" ".repeat(depth)}write`, readLabel(track.audioUnit.input.pointerHub.incoming().at(0)?.box))
                    return writeAudioUnitBox(track.audioUnit, writeTracks(track.children, depth + 1))
                })
            }
            return writeTracks(tracks, 0)
        }

        const writeAudioRegion = (region: AudioRegionBox): ClipsSchema => {
            const audioFileBox = asInstanceOf(region.file.targetVertex.unwrap("No file at region").box, AudioFileBox)
            const audioElement = sampleManager.getOrCreate(audioFileBox.address.uuid).data
                .map(({numberOfFrames, sampleRate, numberOfChannels}) => Xml.element({
                    duration: numberOfFrames / sampleRate,
                    channels: numberOfChannels,
                    sampleRate,
                    algorithm: AudioAlgorithm.REPITCH,
                    file: Xml.element({
                        path: `samples/${audioFileBox.fileName.getValue()}.wav`,
                        external: false
                    }, FileReferenceSchema)
                }, AudioSchema)).unwrap("Could not load sample.")
            const duration = region.duration.getValue() / PPQN.Quarter
            return Xml.element({
                clips: [Xml.element({
                    time: region.position.getValue() / PPQN.Quarter,
                    duration,
                    contentTimeUnit: TimeUnit.BEATS,
                    playStart: 0.0,
                    loopStart: 0.0,
                    loopEnd: region.loopDuration.getValue() / PPQN.Quarter,
                    enable: !region.mute.getValue(),
                    name: region.label.getValue(),
                    color: Color.hslToHex(region.hue.getValue(), 1.0, 0.60),
                    content: [Xml.element({
                        content: [audioElement],
                        contentTimeUnit: "beats",
                        warps: [
                            Xml.element({
                                time: 0.0,
                                contentTime: 0.0
                            }, WarpSchema),
                            Xml.element({
                                time: duration,
                                contentTime: audioElement.duration
                            }, WarpSchema)
                        ]
                    }, WarpsSchema)]
                }, ClipSchema)]
            }, ClipsSchema)
        }

        const writeNoteRegion = (region: NoteRegionBox): ClipsSchema => {
            const collectionBox = asInstanceOf(region.events.targetVertex
                .unwrap("No notes in region").box, NoteEventCollectionBox)
            return Xml.element({
                clips: [Xml.element({
                    time: region.position.getValue() / PPQN.Quarter,
                    duration: region.duration.getValue() / PPQN.Quarter,
                    contentTimeUnit: TimeUnit.BEATS,
                    playStart: 0.0,
                    loopStart: 0.0,
                    loopEnd: region.loopDuration.getValue() / PPQN.Quarter,
                    enable: !region.mute.getValue(),
                    name: region.label.getValue(),
                    color: Color.hslToHex(region.hue.getValue(), 1.0, 0.60),
                    content: [Xml.element({
                        notes: collectionBox.events.pointerHub.incoming()
                            .map(({box}) => asInstanceOf(box, NoteEventBox))
                            .map(box => Xml.element({
                                time: box.position.getValue() / PPQN.Quarter,
                                duration: box.duration.getValue() / PPQN.Quarter,
                                key: box.pitch.getValue(),
                                channel: 0,
                                vel: box.velocity.getValue(),
                                rel: box.velocity.getValue()
                            }, NoteSchema))
                    }, NotesSchema)]
                }, ClipSchema)]
            }, ClipsSchema)
        }

        const writeValueRegion = (region: ValueRegionBox): ClipsSchema => {
            const collectionBox = asInstanceOf(region.events.targetVertex
                .unwrap("No event in region").box, ValueEventCollectionBox)
            return Xml.element({
                clips: [Xml.element({
                    time: region.position.getValue() / PPQN.Quarter,
                    duration: region.duration.getValue() / PPQN.Quarter,
                    contentTimeUnit: TimeUnit.BEATS,
                    playStart: 0.0,
                    loopStart: 0.0,
                    loopEnd: region.loopDuration.getValue() / PPQN.Quarter,
                    enable: !region.mute.getValue(),
                    name: region.label.getValue(),
                    color: Color.hslToHex(region.hue.getValue(), 1.0, 0.60),
                    content: [] // TODO
                }, ClipSchema)]
            }, ClipsSchema)
        }

        const writeLanes = (): ReadonlyArray<TimelineSchema> => {
            return audioUnits
                .flatMap(audioUnitBox => audioUnitBox.tracks.pointerHub.incoming()
                    .map(({box}) => asInstanceOf(box, TrackBox))
                    .sort((a, b) => a.index.getValue() - b.index.getValue())
                    .map(trackBox => Xml.element({
                        id: ids.getOrCreate(trackBox.address),
                        track: ids.getOrCreate(audioUnitBox.address),
                        lanes: trackBox.regions.pointerHub.incoming()
                            .map(({box}) => asDefined(box.accept<BoxVisitor<ClipsSchema>>({
                                visitAudioRegionBox: (region: AudioRegionBox) => writeAudioRegion(region),
                                visitNoteRegionBox: (region: NoteRegionBox) => writeNoteRegion(region),
                                visitValueRegionBox: (region: ValueRegionBox) => writeValueRegion(region)
                            }), "Could not write region."))
                    }, LanesSchema)))
        }

        return Xml.element({
            version: "1.0",
            application: Xml.element({
                name: "openDAW",
                version: "0.1"
            }, ApplicationSchema),
            transport: writeTransport(),
            structure: writeStructure(),
            arrangement: Xml.element({
                lanes: Xml.element({
                    lanes: writeLanes(),
                    timeUnit: TimeUnit.BEATS
                }, LanesSchema)
            }, ArrangementSchema),
            scenes: []
        }, ProjectSchema)
    }
}