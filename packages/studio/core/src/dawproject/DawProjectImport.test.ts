import {describe, it} from "vitest"
import {fileURLToPath} from "url"
import * as path from "node:path"
import * as fs from "node:fs"
import {DawProjectIO} from "./DawProjectIO"
import {DawProjectImport} from "./DawProjectImport"

describe("DawProjectImport", () => {
    it("import", async () => {
        const __dirname = path.dirname(fileURLToPath(import.meta.url))
        // const testFile = "../../../../../test-files/groups-bw.dawproject"
        const testFile = "../../../../../test-files/regions.dawproject"
        const buffer = fs.readFileSync(path.join(__dirname, testFile))
        const {project, resources} = await DawProjectIO.decode(buffer)
        const {skeleton} = await DawProjectImport.read(project, resources)
    })
})