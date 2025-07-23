import {describe, expect, it} from "vitest"
import {Xml} from "@opendaw/lib-xml"
import {MetaDataSchema, ProjectSchema, TrackSchema} from "./"
import exampleXml from "./bitwig.example.xml?raw"
import kurpProjectXml from "./kurp.project.xml?raw"
import testProjectXml from "./test.project.xml?raw"
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
        const result: ProjectSchema = Xml.parse(exampleXml, ProjectSchema)
        expect(asInstanceOf(result.structure[0], TrackSchema).channel?.audioChannels).toBe(2)
        expect(asInstanceOf(result.structure[1], TrackSchema).channel?.id).toBe("id10")
    })
    it("deep read", () => {
        kurpProjectXml.at(0)
        const {transport, arrangement} = Xml.parse(testProjectXml, ProjectSchema)

        console.debug("bpm", transport?.tempo?.value) // 140
        console.debug("numerator", transport?.timeSignature?.numerator) // 4
        console.debug("denominator", transport?.timeSignature?.denominator) // 4
        console.dir(arrangement, {depth: Number.MAX_SAFE_INTEGER}) // ArrangementSchema
    })
})