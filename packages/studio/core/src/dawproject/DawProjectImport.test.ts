import {describe, it} from "vitest"
import {fileURLToPath} from "url"
import * as path from "node:path"
import * as fs from "node:fs"
import {DawProjectImporter} from "./DawProjectImporter"
import {DawProjectIO} from "./DawProjectIO"

describe("DawProjectImport", () => {
    it("import", async () => {
        const __dirname = path.dirname(fileURLToPath(import.meta.url))
        const buffer = await fs.readFileSync(path.join(__dirname, "../../../../../test-files/sample.dawproject"))
        console.debug("buffer", buffer.buffer.byteLength)
        const {project, samples} = await DawProjectIO.decode(buffer)
        const importer = new DawProjectImporter(project, samples)
    })
})