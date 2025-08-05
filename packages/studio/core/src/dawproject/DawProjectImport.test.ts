import {describe, it} from "vitest"
import {fileURLToPath} from "url"
import * as path from "node:path"
import * as fs from "node:fs"
import {DawProjectIO} from "./DawProjectIO"
import {Importer} from "./Importer"

describe("DawProjectImport", () => {
    it("import", async () => {
        const __dirname = path.dirname(fileURLToPath(import.meta.url))
        const testFile = "../../../../../test-files/groups.dawproject"
        // const testFile = "../../../../../test-files/test.dawproject"
        const buffer = fs.readFileSync(path.join(__dirname, testFile))
        const {project, resources} = await DawProjectIO.decode(buffer)
        const importer = await Importer.toProject(project, resources)
    })
})