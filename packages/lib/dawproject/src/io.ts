import JSZip from "jszip"
import {Xml} from "@opendaw/lib-xml"
import {asDefined, panic} from "@opendaw/lib-std"
import {MetaDataSchema, ProjectSchema} from "./schema"

export namespace DAWProjectIO {
    export interface Samples {load(path: string): Promise<ArrayBuffer>}

    export const decode = async (arrayBuffer: ArrayBuffer): Promise<{
        metaData: MetaDataSchema,
        project: ProjectSchema,
        samples: Samples
    }> => {
        const zip = await JSZip.loadAsync(arrayBuffer)
        const metaData = Xml.parse(asDefined(await zip.file("metadata.xml")
            ?.async("string"), "No metadata.xml found"), MetaDataSchema)
        const xml = asDefined(await zip.file("project.xml")
            ?.async("string"), "No project.xml found")
        console.debug(xml)
        const project = Xml.parse(xml, ProjectSchema)
        return {
            metaData, project, samples: {
                load: async (path: string): Promise<ArrayBuffer> =>
                    zip.file(path)?.async("arraybuffer") ?? panic("File not found")
            }
        }
    }
}