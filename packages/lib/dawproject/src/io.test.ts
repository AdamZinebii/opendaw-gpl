import {readFileSync} from "fs"
import {resolve} from "path"
import {describe, it} from "vitest"
import {DAWProjectIO} from "./"
import {Visitor} from "./visitor"

describe("DAW-project IO", () => {
    it("read full dawproject", async () => {
        const buffer = readFileSync(resolve(__dirname, "../test-files/sample.dawproject"))
        const {metaData, project, samples} = await DAWProjectIO.decode(buffer)
        // console.dir(project.arrangement, {depth: Number.MAX_SAFE_INTEGER})
        new Visitor(project, samples)
    })
})