import {describe, it} from "vitest"
import fileUrl from "@test-files/sample.dawproject?url"

describe("DAW-project IO", () => {
    it("read full dawproject", async () => {
        console.debug(fileUrl)
        // const buffer = readFileSync(resolve(__dirname, "../test-files/sample.dawproject"))
        // const {metaData, project, samples} = await DawProjectIO.decode(buffer)
        // console.dir(project.arrangement, {depth: Number.MAX_SAFE_INTEGER})
        // new DawProjectImport(project, samples)
    })
})