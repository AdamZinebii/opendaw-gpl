import {describe, it} from "vitest"
import {fileURLToPath} from "url"
import * as path from "node:path"
import * as fs from "node:fs"
import {ProjectDecoder} from "@opendaw/studio-adapters"
import {ProjectMigration} from "../ProjectMigration"
import {DawProjectExporter} from "./DawProjectExporter"

describe("DawProjectExport", () => {
    it("export", async () => {
        const __dirname = path.dirname(fileURLToPath(import.meta.url))
        const projectPath = "../../../../../packages/app/studio/public/templates/Fatso.od"
        // const projectPath = "../../../../../test-files/project.od"
        const buffer = fs.readFileSync(path.join(__dirname, projectPath))
        console.error(buffer)
        const skeleton = ProjectDecoder.decode(buffer.buffer)
        ProjectMigration.migrate(skeleton)
        console.debug(DawProjectExporter.exportProject(skeleton).toProjectXml())
    })
})