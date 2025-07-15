import {Arrays, ProgressHandler, UUID} from "@opendaw/lib-std"
import {estimateBpm} from "@opendaw/lib-dsp"
import {Promises} from "@opendaw/lib-runtime"
import {AudioData, Sample, SampleMetaData} from "@opendaw/studio-adapters"
import {SamplePeaks, SampleStorage} from "@opendaw/studio-core"

export namespace AudioImporter {
    export type Creation = {
        uuid?: UUID.Format,
        name: string,
        arrayBuffer: ArrayBuffer,
        progressHandler: ProgressHandler
    }

    export const run = async (context: AudioContext,
                              {uuid, name, arrayBuffer, progressHandler}: Creation): Promise<Sample> => {
        uuid ??= await UUID.sha256(arrayBuffer) // Must run before decodeAudioData, because it will detach the ArrayBuffer
        const audioResult = await Promises.tryCatch(context.decodeAudioData(arrayBuffer))
        if (audioResult.status === "rejected") {return Promise.reject(name)}
        const {value: audioBuffer} = audioResult
        const audioData: AudioData = {
            sampleRate: audioBuffer.sampleRate,
            numberOfFrames: audioBuffer.length,
            numberOfChannels: audioBuffer.numberOfChannels,
            frames: Arrays.create(index => audioBuffer.getChannelData(index), audioBuffer.numberOfChannels)
        }
        const peaks = await SamplePeaks.generate(audioData, progressHandler)
        const meta: SampleMetaData = {
            bpm: estimateBpm(audioBuffer.duration),
            name: name.substring(0, name.lastIndexOf(".")),
            duration: audioBuffer.duration,
            sample_rate: audioBuffer.sampleRate
        }
        await SampleStorage.store(uuid, audioData, peaks, meta)
        return {uuid: UUID.toString(uuid), ...meta}
    }
}