import {describe, it} from "vitest"
import {fileURLToPath} from "url"
import * as path from "node:path"
import * as fs from "node:fs"
import {DawProjectIO} from "./DawProjectIO"
import {DawProjectImporter} from "./DawProjectImporter"
import {TrackSchema} from "@opendaw/lib-dawproject"

describe("DawProjectImport", () => {
    it("import", async () => {
        const __dirname = path.dirname(fileURLToPath(import.meta.url))
        const buffer = fs.readFileSync(path.join(__dirname, "../../../../../test-files/test.dawproject"))
        const {project, resources} = await DawProjectIO.decode(buffer)
        const importer = await DawProjectImporter.importProject(project, resources)
        console.debug(importer.skeleton)
        console.dir((project.structure[1] as TrackSchema).channel?.devices, {depth: Number.MAX_SAFE_INTEGER})
    })
})