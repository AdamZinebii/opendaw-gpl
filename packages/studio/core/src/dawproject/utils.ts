import {isDefined, isInstanceOf, Nullish} from "@opendaw/lib-std"
import {Box, StringField} from "@opendaw/lib-box"

export const readLabel = (box: Nullish<Box>): string =>
    isDefined(box) && "label" in box && isInstanceOf(box.label, StringField)
        ? box.label.getValue()
        : "Unknown"