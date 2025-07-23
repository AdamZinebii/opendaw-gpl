import {readFileSync} from "fs"
import {resolve} from "path"
import {describe, it} from "vitest"
import {DAWProjectIO} from "./"

describe("IO", () => {
    it("read full dawproject", async () => {
        const buffer = readFileSync(resolve(__dirname, "one.sample.dawproject"))
        const arrayBuffer = new ArrayBuffer(buffer.length)
        const uint8Array = new Uint8Array(arrayBuffer)
        uint8Array.set(buffer)
        const {metaData, project, samples} = await DAWProjectIO.decode(arrayBuffer)
        console.dir(project.arrangement, {depth: Number.MAX_SAFE_INTEGER})
    })
})