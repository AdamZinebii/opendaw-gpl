import {describe, it} from "vitest"
import {Xml} from "@opendaw/lib-xml"
import {Application, Lane, Project, RealParameter, TimeSignatureParameter, Transport, Unit} from "./"

describe("Serializer", () => {
    it("should serialize", () => {
const project = new Project({
    application: new Application({name: "openDAW", version: "0.1"}),
    transport: new Transport({
        tempo: new RealParameter({unit: Unit.BPM, value: 120}),
        timeSignature: new TimeSignatureParameter({nominator: 4, denominator: 4})
    }),
    structure: [
        new Lane({id: "0"}),
        new Lane({id: "1"})
    ]
})
console.debug(Xml.pretty(Xml.toElement("Project", project)))
    })
})