import JSZip from "jszip"
import {Xml} from "@opendaw/lib-xml"
import {asDefined, panic} from "@opendaw/lib-std"
import {MetaDataSchema, ProjectSchema} from "./schema"

export namespace DAWProjectIO {
    export interface Samples {load(path: string): ArrayBuffer}

    export const decode = async (buffer: ArrayBuffer | NonSharedBuffer): Promise<{
        metaData: MetaDataSchema,
        project: ProjectSchema,
        samples: Samples
    }> => {
        const zip = await JSZip.loadAsync(buffer)
        const metaData = Xml.parse(asDefined(await zip.file("metadata.xml")
            ?.async("string"), "No metadata.xml found"), MetaDataSchema)
        const projectXml = asDefined(await zip.file("project.xml")
            ?.async("string"), "No project.xml found")
        console.debug(projectXml)
        const project = Xml.parse(projectXml, ProjectSchema)
        const assets = Object.entries(zip.files).filter(([_, file]) => !file.dir && !file.name.endsWith(".xml"))
        const assetBuffers: Array<[string, ArrayBuffer]> =
            await Promise.all(assets.map(async ([path, file]) => ([path, await file.async("arraybuffer")])))
        const assetMap = new Map<string, ArrayBuffer>(assetBuffers)
        return {
            metaData, project, samples: {
                load: (path: string): ArrayBuffer => assetMap.get(path) ?? panic("Asset not found: " + path)
            }
        }
    }
}