import {describe, it} from "vitest"
import {fileURLToPath} from "url"
import * as path from "node:path"
import * as fs from "node:fs"
import {DawProjectIO} from "./DawProjectIO"
import {DawProjectImporter} from "./DawProjectImporter"

describe("DawProjectImport", () => {
    it("import", async () => {
        const __dirname = path.dirname(fileURLToPath(import.meta.url))
        const buffer = fs.readFileSync(path.join(__dirname, "../../../../../test-files/midi.dawproject"))
        console.debug("buffer", buffer.buffer.byteLength)
        const {project, samples} = await DawProjectIO.decode(buffer)
        const importer = new DawProjectImporter(project, samples)
        console.debug(importer.skeleton)
    })
})