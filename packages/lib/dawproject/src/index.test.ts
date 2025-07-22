import {describe, it} from "vitest"
import {Xml} from "@opendaw/lib-xml"
import {
    ApplicationSchema,
    BooleanParameterSchema,
    ChannelSchema,
    ProjectSchema,
    RealParameterSchema,
    TimeSignatureParameterSchema,
    TrackSchema,
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
                Xml.element({
                    id: "0",
                    contentType: "notes",
                    channel: Xml.element({
                        audioChannels: 2,
                        mute: Xml.element({value: true}, BooleanParameterSchema)
                    }, ChannelSchema),
                    tracks: [
                        Xml.element({id: "01", contentType: "audio"}, TrackSchema),
                        Xml.element({id: "02", contentType: "audio"}, TrackSchema)
                    ]
                }, TrackSchema),
                Xml.element({id: "1", contentType: "audio"}, TrackSchema)
            ]
        }, ProjectSchema)
        console.debug(Xml.pretty(Xml.toElement("Project", project)))
    })
})