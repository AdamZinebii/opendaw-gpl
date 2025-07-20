// serialize.test.ts
import {describe, expect, it} from "vitest"
import {Serializer} from "./serialize"
import {Application, Project, RealParameter, Transport, Unit} from "./schema"

describe("Serializer", () => {
    it("should serialize a Project with nested objects", () => {
        const project = new Project({
            application: new Application({
                name: "openDAW",
                version: "0.0"
            }),
            transport: new Transport({
                tempo: new RealParameter({
                    value: 120,
                    unit: Unit.BPM
                })
            })
        })

        const serializer = new Serializer()
        const element = serializer.toXML(project)

        expect(element.tagName).toBe("Project")
        expect(element.getAttribute("version")).toBe("1.0")
        expect(element.children.length).toBeGreaterThan(0)

        // Check for Application child
        const appElement = element.querySelector("Application")
        expect(appElement).toBeTruthy()
        expect(appElement?.getAttribute("name")).toBe("openDAW")
        expect(appElement?.getAttribute("version")).toBe("0.0")

        console.debug(Serializer.pretty(element))
    })
})