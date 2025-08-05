import {asDefined, asInstanceOf, Color, ifDefined, isInstanceOf, Option, UUID} from "@opendaw/lib-std"
import {Xml} from "@opendaw/lib-xml"
import {dbToGain, PPQN} from "@opendaw/lib-dsp"
import {
    ApplicationSchema,
    ArrangementSchema,
    AudioAlgorithm,
    AudioSchema,
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

export namespace DawProjectExporter {
    export interface ResourcePacker {
        write(path: string, buffer: ArrayBuffer): FileReferenceSchema
    }

    export const write = (project: Project, resources: ResourcePacker) => {
        const ids = new AddressIdEncoder()
        const {timelineBox, rootBox, sampleManager} = project
        const audioUnits = rootBox.audioUnits.pointerHub.incoming()
            .map(({box}) => asInstanceOf(box, AudioUnitBox))
            .sort((a, b) => a.index.getValue() - b.index.getValue())
        const writeTransport = (): TransportSchema => {
            return Xml.element({
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
        }

        const writeDevices = (field: Field, deviceRole: string): ReadonlyArray<DeviceSchema> => field.pointerHub
            .incoming().map(({box}) => {
                const enabled = ("enabled" in box && isInstanceOf(box.enabled, BooleanField)
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
                    state: resources.write(`presets/${UUID.toString(box.address.uuid)}`,
                        box.toArrayBuffer() as ArrayBuffer)
                }, BuiltinDeviceSchema)
            })

        // TODO Write in nested fashion. We probably need to setup a graph for this
        const writeStructure = (): ReadonlyArray<TrackSchema> => audioUnits.map(audioUnitBox => {
            const inputBox = audioUnitBox.input.pointerHub.incoming().at(0)?.box
            return Xml.element({
                id: ids.getOrCreate(audioUnitBox.address),
                name: readLabel(inputBox),
                loaded: true,
                contentType: (() =>
                    // TODO Another location to remember to put devices in...?
                    //  We could also read the first track type?
                    inputBox?.accept<BoxVisitor<string>>({
                        visitTapeDeviceBox: () => "audio",
                        visitVaporisateurDeviceBox: () => "notes",
                        visitNanoDeviceBox: () => "notes",
                        visitPlayfieldDeviceBox: () => "notes"
                    }))() ?? undefined,
                channel: Xml.element({
                    id: ifDefined(inputBox, ({address}) => ids.getOrCreate(address)),
                    role: (() => {
                        switch (audioUnitBox.type.getValue()) {
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
                }, ChannelSchema)
            }, TrackSchema)
        })

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