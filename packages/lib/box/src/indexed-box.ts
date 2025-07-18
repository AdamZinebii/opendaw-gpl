import {Field} from "./field"
import {clamp, Class, int, panic} from "@opendaw/lib-std"
import {Int32Field} from "./primitive"
import {Box} from "./box"

/**
 * Utility functions for managing indexed box collections with automatic index adjustment.
 */
export type IndexedBox = Box & Record<"index", Int32Field>

export namespace IndexedBox {
    export const insertOrder = (field: Field, insertIndex: int = Number.MAX_SAFE_INTEGER): int => {
        const boxes = collectIndexedBoxes(field)
        const newIndex = clamp(insertIndex, 0, boxes.length)
        if (newIndex < boxes.length) {
            for (let index = newIndex; index < boxes.length; index++) {
                boxes[index].index.setValue(index + 1)
            }
        }
        return newIndex
    }

    export const removeOrder = (field: Field, removeIndex: int): void => {
        const boxes = collectIndexedBoxes(field)
        if (removeIndex < boxes.length) {
            for (let index = removeIndex + 1; index < boxes.length; index++) {
                boxes[index].index.setValue(index - 1)
            }
        }
    }

    export const isIndexedBox = (box: Box): box is IndexedBox => "index" in box && box.index instanceof Int32Field

    export const collectIndexedBoxes = <B extends IndexedBox>(field: Field, type?: Class<B>): ReadonlyArray<B> =>
        field.pointerHub.incoming()
            .map(({box}) => isIndexedBox(box) && (type === undefined || box instanceof type)
                ? box as B
                : panic(`${box} has no index field`))
            .sort((a, b) => a.index.getValue() - b.index.getValue())
}