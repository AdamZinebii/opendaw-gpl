// serialize.test.ts
import {describe, it} from "vitest"
import {Application, Lane, Project, RealParameter, TimeSignatureParameter, Transport, Unit} from "./schema"
import {XMLFormatter} from "./XMLFormatter"

describe("Serializer", () => {
    it("should serialize", () => {
        const project = new Project({
            application: new Application("openDAW", "0.1"),
            transport: new Transport({
                tempo: new RealParameter({unit: Unit.BPM, value: 120}),
                timeSignature: new TimeSignatureParameter({nominator: 4, denominator: 4})
            }),
            structure: [
                new Lane({id: "0"}),
                new Lane({id: "1"})
            ]
        })
        console.debug(XMLFormatter.format(project.toXML()))
    })
})