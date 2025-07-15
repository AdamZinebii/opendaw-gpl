import {AudioDeviceProcessor} from "./AudioDeviceProcessor"
import {AudioInput} from "./processing"
import {int} from "@opendaw/lib-std"
import {AudioEffectDeviceBoxAdapter} from "@opendaw/studio-adapters"

export interface AudioEffectDeviceProcessor extends AudioDeviceProcessor, AudioInput {
    index(): int
    adapter(): AudioEffectDeviceBoxAdapter
}