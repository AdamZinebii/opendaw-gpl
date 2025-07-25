import {Xml} from "@opendaw/lib-xml"
import {
    ApplicationSchema,
    ArrangementSchema,
    ProjectSchema,
    RealParameterSchema,
    TransportSchema,
    Unit
} from "@opendaw/lib-dawproject"
import {ProjectDecoder} from "@opendaw/studio-adapters"

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
                }, RealParameterSchema)
            }, TransportSchema),
            structure: [],
            arrangement: Xml.element({}, ArrangementSchema),
            scenes: []
        }, ProjectSchema))
        return Xml.pretty(element)
    }
}