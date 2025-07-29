import {describe, it} from "vitest"
import {fileURLToPath} from "url"
import * as path from "node:path"
import * as fs from "node:fs"
import {DawProjectExporter} from "./DawProjectExporter"
import {Project} from "../Project"
import {SampleLoader, SampleManager} from "@opendaw/studio-adapters"
import {panic, UUID} from "@opendaw/lib-std"

describe("DawProjectExport", () => {
    it("export", async () => {
        const __dirname = path.dirname(fileURLToPath(import.meta.url))
        const projectPath = "../../../../../packages/app/studio/public/templates/Fatso.od"
        // const projectPath = "../../../../../test-files/project.od"
        const buffer = fs.readFileSync(path.join(__dirname, projectPath))
        console.error(buffer)
        const project = Project.load({
            sampleManager: new class implements SampleManager {
                getOrCreate(_uuid: UUID.Format): SampleLoader {
                    return panic("Method not implemented.")
                }
                invalidate(_uuid: UUID.Format): void {
                    return panic("Method not implemented.")
                }
            }
        }, buffer.buffer)
        console.debug(DawProjectExporter.exportProject(project).toProjectSchema())
    })
})