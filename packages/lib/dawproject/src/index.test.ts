import {describe, expect, it} from "vitest"
import {Xml} from "@opendaw/lib-xml"
import {
    ApplicationSchema,
    BooleanParameterSchema,
    ChannelSchema,
    MetaDataSchema,
    ProjectSchema,
    RealParameterSchema,
    TimeSignatureParameterSchema,
    TrackSchema,
    TransportSchema,
    Unit
} from "./"
import exampleXml from "./bitwig.example.xml?raw"
import {asInstanceOf} from "@opendaw/lib-std"

describe("Serializer", () => {
    it("MetaData", () => {
        const title = "This is the title."
        const artist = "André Michelle"
        const website = "https://opendaw.studio"
        const xmlString = Xml.pretty(Xml.toElement("MetaData", Xml.element({title, artist, website}, MetaDataSchema)))
        console.debug(xmlString)
        const metaDataSchema = Xml.parse(xmlString, MetaDataSchema)
        expect(metaDataSchema.title).toBe(title)
        expect(metaDataSchema.artist).toBe(artist)
        expect(metaDataSchema.website).toBe(website)
        expect(metaDataSchema.comment).toBe(undefined)
    })
    it("random tests", () => {
        const project = Xml.element({
            version: "1.0",
            application: Xml.element({
                name: "openDAW",
                version: "0.1"
            }, ApplicationSchema),
            transport: Xml.element({
                tempo: Xml.element({
                    unit: Unit.BPM,
                    value: 120
                }, RealParameterSchema),
                timeSignature: Xml.element({
                    nominator: 4,
                    denominator: 4
                }, TimeSignatureParameterSchema)
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
                        Xml.element({
                            id: "01",
                            contentType: "audio"
                        }, TrackSchema),
                        Xml.element({
                            id: "02",
                            contentType: "audio"
                        }, TrackSchema)
                    ]
                }, TrackSchema),
                Xml.element({
                    id: "1",
                    contentType: "audio"
                }, TrackSchema)
            ]
        }, ProjectSchema)
        const xml = Xml.pretty(Xml.toElement("Project", project))
        console.debug(xml)
        const result: ProjectSchema = Xml.parse(exampleXml, ProjectSchema)
        console.dir(result, {depth: Number.MAX_SAFE_INTEGER})

        expect(asInstanceOf(result.structure[0], TrackSchema).channel?.audioChannels).toBe(2)
        expect(asInstanceOf(result.structure[1], TrackSchema).channel?.id).toBe("id10")
    })
})