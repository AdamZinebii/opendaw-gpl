import {Address, Box, BoxGraph, PointerField} from "@opendaw/lib-box"
import {assert, ByteArrayInput, ByteArrayOutput, isInstanceOf, Option, panic, UUID} from "@opendaw/lib-std"
import {AudioFileBox, AudioUnitBox, BoxIO} from "@opendaw/studio-boxes"
import {DeviceBox, DeviceBoxUtils} from "@opendaw/studio-adapters"

export namespace DeviceIO {
    export const exportDevice = (box: Box): ArrayBufferLike => {
        const dependencies = Array.from(box.graph.dependenciesOf(box).boxes)
        // We are going to award all boxes with new UUIDs.
        // Therefore, we need to map all internal pointer targets.
        const mapping = UUID.newSet<{ source: UUID.Format, target: UUID.Format }>(({source}) => source)
        mapping.add({source: box.address.uuid, target: UUID.generate()})
        dependencies
            .filter(dep => !isInstanceOf(dep, AudioFileBox)) // AudioFileBox's uuid identifies the sample
            .forEach(({address: {uuid: source}}) => mapping.add({source, target: UUID.generate()}))
        const output = ByteArrayOutput.create()
        output.writeString("openDAW:device")
        output.writeInt(1) // format version
        const writeBox = (box: Box) => {
            const uuid = box.address.uuid
            UUID.toDataOutput(output, mapping.opt(uuid).match({
                none: () => uuid,
                some: ({target}) => target
            }))
            output.writeString(box.name)
            const arrayBuffer = box.toArrayBuffer()
            output.writeInt(arrayBuffer.byteLength)
            output.writeBytes(new Int8Array(arrayBuffer))
        }
        PointerField.encodeWith({
            map: (pointer: PointerField): Option<Address> => {
                return pointer.targetVertex.match({
                    none: () => Option.None,
                    some: vertex => {
                        if (isInstanceOf(vertex.box, AudioUnitBox)) {return Option.None}
                        const targetAddress = pointer.targetAddress
                        if (targetAddress.nonEmpty()) {
                            const address = targetAddress.unwrap()
                            const optEntry = mapping.opt(address.uuid)
                            if (optEntry.nonEmpty()) {
                                const target = optEntry.unwrap().target
                                return Option.wrap(address.moveTo(target))
                            }
                        }
                        return targetAddress
                    }
                })
            }
        }, () => {
            writeBox(box)
            output.writeInt(dependencies.length)
            for (const dep of dependencies) {
                writeBox(dep)
            }
        })
        return output.toArrayBuffer()
    }

    export const importDevice = (boxGraph: BoxGraph<BoxIO.TypeMap>, buffer: ArrayBufferLike): DeviceBox => {
        const input = new ByteArrayInput(buffer)
        const header = input.readString()
        const version = input.readInt()
        assert(header === "openDAW:device", `wrong header: ${header}`)
        assert(version === 1, `wrong version: ${version}`)
        const readBox = () => {
            const uuid = UUID.fromDataInput(input)
            const key = input.readString() as keyof BoxIO.TypeMap
            const length = input.readInt()
            const array = new Int8Array(length)
            input.readBytes(array)
            return boxGraph.createBox(key, uuid, box => box.read(new ByteArrayInput(array.buffer)))
        }
        const box = readBox()
        if (!DeviceBoxUtils.isDeviceBox(box)) {return panic(`${box.name} is not a DeviceBox`)}
        const numDeps = input.readInt()
        for (let i = 0; i < numDeps; i++) {
            readBox()
        }
        return box
    }
}