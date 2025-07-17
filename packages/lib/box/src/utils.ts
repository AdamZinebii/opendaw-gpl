import {Field} from "./field"
import {clamp, int, panic} from "@opendaw/lib-std"
import {Int32Field} from "./primitive"

export namespace BoxUtils {
    /**
     * Helps to add an element to a field at a specified index, while ensuring existing indices are shifted accordingly.
     *
     * This function adjusts the indices of the elements in the field to accommodate a new element.
     * If the calculated index is less than the total number of indices, it shifts all following
     * indices by incrementing their value to maintain correct ordering.
     *
     * @param {Field} field - The target field where the new index is being inserted.
     * @param {int} [insertIndex=Number.MAX_SAFE_INTEGER] - The index at which to insert the new value.
     *                                                          Defaults to the maximum safe integer value.
     * @returns {int} The final index at which the element is to be inserted.
     * @throws Will throw an error if a box associated with the field does not contain a valid "index" field
     *         or if the "index" field is not of type Int32Field.
     */
    export const insert = (field: Field, insertIndex: int = Number.MAX_SAFE_INTEGER): int => {
        const indices = field.pointerHub.incoming()
            .map(({box}) => {
                return "index" in box && box["index"] instanceof Int32Field
                    ? box.index
                    : panic(`${box} has no index field`)
            })
            .sort((a, b) => a.getValue() - b.getValue())
        const newIndex = clamp(insertIndex, 0, indices.length)
        if (newIndex < indices.length) {
            for (let index = newIndex; index < indices.length; index++) {
                indices[index].setValue(index + 1)
            }
        }
        return newIndex
    }
}