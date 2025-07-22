import {describe, it} from "vitest"
import {Xml} from "@opendaw/lib-xml"
import {
    ApplicationSchema,
    LaneSchema,
    ProjectSchema,
    RealParameterSchema,
    TimeSignatureParameterSchema,
    TransportSchema,
    Unit
} from "./"

describe("Serializer", () => {
    it("should serialize", () => {
        const project = Xml.element({
            application: Xml.element({name: "openDAW", version: "0.1"}, ApplicationSchema),
            transport: Xml.element({
                tempo: Xml.element({unit: Unit.BPM, value: 120}, RealParameterSchema),
                timeSignature: Xml.element({nominator: 4, denominator: 4}, TimeSignatureParameterSchema)
            }, TransportSchema),
            structure: [
                Xml.element({id: "0"}, LaneSchema),
                Xml.element({id: "1"}, LaneSchema)
            ]
        }, ProjectSchema)
        console.debug(Xml.pretty(Xml.toElement("Project", project)))
    })
})