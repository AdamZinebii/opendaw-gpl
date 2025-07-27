import {Xml} from "@opendaw/lib-xml"
import {
    ApplicationSchema,
    ArrangementSchema,
    BooleanParameterSchema,
    BuiltinDeviceSchema,
    ChannelSchema,
    DeviceRole,
    DeviceSchema,
    LanesSchema,
    ProjectSchema,
    RealParameterSchema,
    TimelineSchema,
    TimeSignatureParameterSchema,
    TrackSchema,
    TransportSchema,
    Unit
} from "@opendaw/lib-dawproject"
import {ProjectDecoder, TrackType} from "@opendaw/studio-adapters"
import {asInstanceOf, isDefined, isInstanceOf, Nullable, Nullish} from "@opendaw/lib-std"
import {AudioUnitBox} from "@opendaw/studio-boxes"
import {BooleanField, Box, Field, StringField} from "@opendaw/lib-box"
import {dbToGain} from "@opendaw/lib-dsp"

export class DawProjectExporter {
    static exportProject(skeleton: ProjectDecoder.Skeleton): DawProjectExporter {
        return new DawProjectExporter(skeleton)
    }

    readonly #skeleton: ProjectDecoder.Skeleton

    constructor(skeleton: ProjectDecoder.Skeleton) {this.#skeleton = skeleton}

    toProjectXml(): string {
        const {rootBox, timelineBox} = this.#skeleton.mandatoryBoxes
        const element = Xml.toElement("Project", Xml.element({
            version: "1.0",
            application: Xml.element({
                name: "openDAW",
                version: "0.1"
            }, ApplicationSchema),
            transport: Xml.element({
                tempo: Xml.element({
                    value: timelineBox.bpm.getValue(),
                    unit: Unit.BPM
                }, RealParameterSchema),
                timeSignature: Xml.element({
                    numerator: timelineBox.signature.nominator.getValue(),
                    denominator: timelineBox.signature.denominator.getValue()
                }, TimeSignatureParameterSchema)
            }, TransportSchema),
            structure: this.#writeStructure(),
            arrangement: Xml.element({
                lanes: Xml.element({
                    lanes: this.#writeLanes()
                }, LanesSchema)
            }, ArrangementSchema),
            scenes: []
        }, ProjectSchema))
        return Xml.pretty(element)
    }

    #writeStructure(): ReadonlyArray<TrackSchema> {
        return this.#skeleton.mandatoryBoxes.rootBox.audioUnits.pointerHub.incoming()
            .map(({box}) => asInstanceOf(box, AudioUnitBox))
            .sort((a, b) => a.index.getValue() - b.index.getValue())
            .map(box => {
                const inputBox = box.input.pointerHub.incoming().at(0)?.box
                const name = this.#readLabel(inputBox)
                return Xml.element({
                    id: box.address.toString(),
                    name,
                    loaded: true,
                    contentType: "audio notes", // TODO
                    channel: Xml.element({
                        devices: [
                            ...(this.#writeDevices(box.midiEffects, DeviceRole.NOTE_FX)),
                            ...(this.#writeDevices(box.input, DeviceRole.INSTRUMENT)),
                            ...(this.#writeDevices(box.audioEffects, DeviceRole.AUDIO_FX))
                        ],
                        volume: Xml.element({
                            id: box.volume.address.toString(),
                            value: dbToGain(box.volume.getValue()),
                            unit: Unit.LINEAR // TODO min, max
                        }, RealParameterSchema),
                        pan: Xml.element({
                            id: box.panning.address.toString(),
                            value: (box.panning.getValue() + 1.0) / 2.0,
                            min: 0.0,
                            max: 1.0,
                            unit: Unit.NORMALIZED
                        }, RealParameterSchema)
                    }, ChannelSchema)
                }, TrackSchema)
            })
    }

    #writeDevices(field: Field, deviceRole: string): ReadonlyArray<DeviceSchema> {
        return field.pointerHub.incoming().map(({box}) => {
            const deviceID = box.name
            const deviceName = this.#readLabel(box)
            const deviceVendor = "openDAW"
            const deviceEnabled: Nullable<BooleanField> = "enabled" in box && isInstanceOf(box.enabled, BooleanField)
                ? box.enabled : null
            return Xml.element({
                id: box.address.toString(),
                name: deviceID,
                deviceID,
                deviceRole,
                deviceName,
                deviceVendor,
                automatedParameters: [],
                enabled: Xml.element({
                    value: deviceEnabled?.getValue() === true,
                    name: "On/Off",
                    id: deviceEnabled?.address.toString()
                }, BooleanParameterSchema)
            }, BuiltinDeviceSchema)
        })
    }

    #writeLanes(): ReadonlyArray<TimelineSchema> {
        return []
    }

    #readLabel(box: Nullish<Box>): string {
        return isDefined(box) && "label" in box && isInstanceOf(box.label, StringField)
            ? box.label.getValue()
            : "Unknown"
    }

    #trackToContentType(trackType: TrackType): Nullish<string> {
        switch (trackType) {
            case TrackType.Audio:
                return "audio"
            case TrackType.Notes:
                return "notes"
            default:
                return undefined
        }
    }
}