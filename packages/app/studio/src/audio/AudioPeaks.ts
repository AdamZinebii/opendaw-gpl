import {Peaks} from "@opendaw/lib-fusion"
import {AudioData} from "@opendaw/studio-adapters"
import {ProgressHandler} from "@opendaw/lib-std"
import {WorkerAgents} from "@opendaw/studio-core"

export namespace AudioPeaks {
    export const generate = async (audio: AudioData, progress: ProgressHandler): Promise<ArrayBuffer> => {
        const shifts = Peaks.findBestFit(audio.numberOfFrames)
        return await WorkerAgents.Peak.generateAsync(
            progress,
            shifts,
            audio.frames,
            audio.numberOfFrames,
            audio.numberOfChannels) as ArrayBuffer
    }
}