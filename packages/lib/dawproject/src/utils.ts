import {BooleanParameterSchema, RealParameterSchema, Unit} from "./defaults"
import {Xml} from "@opendaw/lib-xml"

export namespace ParameterEncoder {
    export const bool = (id: string, value: boolean, name?: string) => Xml.element({
        id, name, value
    }, BooleanParameterSchema)

    export const linear = (id: string, value: number, min?: number, max?: number, name?: string) => Xml.element({
        id, name, min, max, value, unit: Unit.LINEAR
    }, RealParameterSchema)

    export const normalized = (id: string, value: number, min?: number, max?: number, name?: string) => Xml.element({
        id, name, min, max, value, unit: Unit.NORMALIZED
    }, RealParameterSchema)
}