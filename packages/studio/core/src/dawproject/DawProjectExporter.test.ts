import {describe, it} from "vitest"
import {fileURLToPath} from "url"
import * as path from "node:path"
import * as fs from "node:fs"
import {Project} from "../Project"
import {SampleLoader, SampleManager} from "@opendaw/studio-adapters"
import {panic, UUID} from "@opendaw/lib-std"
import {Xml} from "@opendaw/lib-xml"
import {FileReferenceSchema} from "@opendaw/lib-dawproject"
import {DawProjectExporter} from "./DawProjectExporter"

describe("DawProjectExport", () => {
    it("export", async () => {
        const __dirname = path.dirname(fileURLToPath(import.meta.url))
        // const projectPath = "../../../../../packages/app/studio/public/templates/Fatso.od"
        const projectPath = "../../../../../test-files/project.od"
        const buffer = fs.readFileSync(path.join(__dirname, projectPath))
        const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
        const project = Project.load({
            sampleManager: new class implements SampleManager {
                getOrCreate(_uuid: UUID.Format): SampleLoader {
                    return panic("Method not implemented.")
                }
                invalidate(_uuid: UUID.Format): void {
                    return panic("Method not implemented.")
                }
            }
        }, arrayBuffer)
        const schema = DawProjectExporter.write(project, {
            write: (path: string, buffer: ArrayBufferLike): FileReferenceSchema => {
                console.debug(`store ${buffer.byteLength} bytes at ${path}`)
                return Xml.element({path, external: false}, FileReferenceSchema)
            }
        })
        console.dir(schema, {depth: Number.MAX_SAFE_INTEGER})
        console.debug(Xml.pretty(Xml.toElement("Project", schema)))
    })
})