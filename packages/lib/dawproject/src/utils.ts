import {BooleanParameterSchema, RealParameterSchema, Unit} from "./defaults"
import {Xml} from "@opendaw/lib-xml"

export namespace ParameterEncoder {
    export const bool = (value: boolean, name?: string, id?: string) => Xml.element({
        id, name, value
    }, BooleanParameterSchema)

    export const linear = (value: number, min?: number, max?: number, name?: string, id?: string) => Xml.element({
        id, name, min, max, value, unit: Unit.LINEAR
    }, RealParameterSchema)

    export const normalized = (value: number, min?: number, max?: number, name?: string, id?: string) => Xml.element({
        id, name, min, max, value, unit: Unit.NORMALIZED
    }, RealParameterSchema)
}