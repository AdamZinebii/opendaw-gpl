import {Xml} from "@opendaw/lib-xml"
import {
    ApplicationSchema,
    ArrangementSchema,
    ChannelSchema,
    ProjectSchema,
    RealParameterSchema,
    TimeSignatureParameterSchema,
    TrackSchema,
    TransportSchema,
    Unit
} from "@opendaw/lib-dawproject"
import {ProjectDecoder, TrackType} from "@opendaw/studio-adapters"
import {asInstanceOf, isDefined, isInstanceOf, Nullish} from "@opendaw/lib-std"
import {AudioUnitBox} from "@opendaw/studio-boxes"
import {StringField} from "@opendaw/lib-box"
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
            arrangement: Xml.element({}, ArrangementSchema),
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
                const name = isDefined(inputBox) && "label" in inputBox && isInstanceOf(inputBox?.label, StringField)
                    ? inputBox?.label.getValue()
                    : "Unknown"
                return Xml.element({
                    loaded: true,
                    name: name,
                    channel: Xml.element({
                        volume: Xml.element({
                            id: box.volume.address.toString(),
                            value: dbToGain(box.volume.getValue()),
                            unit: Unit.LINEAR // TODO min, max
                        }, RealParameterSchema),
                        pan: Xml.element({
                            id: box.volume.address.toString(),
                            value: (box.panning.getValue() + 1.0) / 2.0,
                            min: 0.0,
                            max: 1.0,
                            unit: Unit.NORMALIZED
                        }, RealParameterSchema)
                    }, ChannelSchema)

                }, TrackSchema)
            })
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