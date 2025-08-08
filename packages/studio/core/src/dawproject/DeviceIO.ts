import {Address, Box, BoxGraph, PointerField} from "@opendaw/lib-box"
import {assert, ByteArrayInput, ByteArrayOutput, Option, panic, UUID} from "@opendaw/lib-std"
import {AudioFileBox, BoxIO} from "@opendaw/studio-boxes"
import {DeviceBox, DeviceBoxUtils} from "@opendaw/studio-adapters"

export namespace DeviceIO {
    export const exportDevice = (box: Box): ArrayBufferLike => {
        const dependencies = Array.from(box.graph.dependenciesOf(box).boxes)

        const output = ByteArrayOutput.create()
        output.writeString("openDAW:device")
        output.writeInt(1) // format version
        const writeBox = (box: Box) => {
            UUID.toDataOutput(output, box.address.uuid)
            output.writeString(box.name)
            const arrayBuffer = box.toArrayBuffer()
            output.writeInt(arrayBuffer.byteLength)
            output.writeBytes(new Int8Array(arrayBuffer))
        }
        writeBox(box)
        output.writeInt(dependencies.length)
        dependencies.forEach(dep => writeBox(dep))
        return output.toArrayBuffer()
    }

    export const importDevice = (boxGraph: BoxGraph<BoxIO.TypeMap>, buffer: ArrayBufferLike): DeviceBox => {
        const input = new ByteArrayInput(buffer)
        const header = input.readString()
        const version = input.readInt()
        assert(header === "openDAW:device", `wrong header: ${header}`)
        assert(version === 1, `wrong version: ${version}`)
        const mapping = UUID.newSet<{ source: UUID.Format, target: UUID.Format }>(({source}) => source)
        const rawBoxes: Array<{uuid: UUID.Format, key: keyof BoxIO.TypeMap, array: Int8Array}> = []
        const readRawBox = () => {
            const uuid = UUID.fromDataInput(input)
            const key = input.readString() as keyof BoxIO.TypeMap
            const length = input.readInt()
            const array = new Int8Array(length)
            input.readBytes(array)
            mapping.add({source: uuid, target: key === "AudioFileBox" ? uuid : UUID.generate()})
            rawBoxes.push({uuid, key, array})
        }
        readRawBox()
        const numDeps = input.readInt()
        for (let i = 0; i < numDeps; i++) {
            readRawBox()
        }
        // We are going to award all boxes with new UUIDs.
        // Therefore, we need to map all internal pointer targets.
        return PointerField.decodeWith({
            map: (_pointer: PointerField, newAddress: Option<Address>): Option<Address> =>
                newAddress.map(address => mapping.opt(address.uuid).match({
                    none: () => address,
                    some: ({target}) => address.moveTo(target)
                }))
        }, () => {
            const {key, uuid, array} = rawBoxes[0]
            const box = boxGraph.createBox(key, mapping.get(uuid).target, box => box.read(new ByteArrayInput(array.buffer)))
            if (!DeviceBoxUtils.isDeviceBox(box)) {return panic(`${box.name} is not a DeviceBox`)}
            for (let i = 1; i < rawBoxes.length; i++) {
                const {key, uuid, array} = rawBoxes[i]
                boxGraph.createBox(key, mapping.get(uuid).target, box => box.read(new ByteArrayInput(array.buffer)))
            }
            return box
        })
    }
}