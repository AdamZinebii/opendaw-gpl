import {Arrays, ByteArrayInput, EmptyExec, UUID} from "@opendaw/lib-std"
import {Peaks} from "@opendaw/lib-fusion"
import {AudioData} from "@opendaw/studio-adapters"
import {encodeWavFloat, WorkerAgents} from "@opendaw/studio-core"
import {AudioMetaData} from "@/audio/AudioMetaData"
import {AudioSample} from "@/audio/AudioSample"

export namespace AudioStorage {
    // CAUTION! Next time you would kill all locally imported files, so it is not that easy!
    export const clean = () => WorkerAgents.Opfs.delete("samples/v1").catch(EmptyExec)

    export const Folder = "samples/v2"

    export const store = async (uuid: UUID.Format,
                                audio: AudioData,
                                peaks: ArrayBuffer,
                                meta: AudioMetaData): Promise<void> => {
        const path = `${Folder}/${UUID.toString(uuid)}`
        return Promise.all([
            WorkerAgents.Opfs.write(`${path}/audio.wav`, new Uint8Array(encodeWavFloat({
                channels: audio.frames.slice(),
                numFrames: audio.numberOfFrames,
                sampleRate: audio.sampleRate
            }))),
            WorkerAgents.Opfs.write(`${path}/peaks.bin`, new Uint8Array(peaks)),
            WorkerAgents.Opfs.write(`${path}/meta.json`, new TextEncoder().encode(JSON.stringify(meta)))
        ]).then(EmptyExec)
    }

    export const updateMeta = async (uuid: UUID.Format, meta: AudioMetaData): Promise<void> => {
        const path = `${Folder}/${UUID.toString(uuid)}`
        return WorkerAgents.Opfs.write(`${path}/meta.json`, new TextEncoder().encode(JSON.stringify(meta)))
    }

    export const load = async (uuid: UUID.Format, context: AudioContext): Promise<[AudioData, Peaks, AudioMetaData]> => {
        const path = `${Folder}/${UUID.toString(uuid)}`
        return Promise.all([
            WorkerAgents.Opfs.read(`${path}/audio.wav`)
                .then(bytes => context.decodeAudioData(bytes.buffer as ArrayBuffer)),
            WorkerAgents.Opfs.read(`${path}/peaks.bin`)
                .then(bytes => Peaks.from(new ByteArrayInput(bytes.buffer))),
            WorkerAgents.Opfs.read(`${path}/meta.json`)
                .then(bytes => JSON.parse(new TextDecoder().decode(bytes)))
        ]).then(([buffer, peaks, meta]) => [{
            sampleRate: buffer.sampleRate,
            numberOfFrames: buffer.length,
            numberOfChannels: buffer.numberOfChannels,
            frames: Arrays.create(index => buffer.getChannelData(index), buffer.numberOfChannels)
        }, peaks, meta])
    }

    export const remove = async (uuid: UUID.Format): Promise<void> => {
        const path = `${Folder}/${UUID.toString(uuid)}`
        return WorkerAgents.Opfs.delete(`${path}`)
    }

    export const list = async (): Promise<ReadonlyArray<AudioSample>> => {
        return WorkerAgents.Opfs.list(Folder)
            .then(files => Promise.all(files.filter(file => file.kind === "directory")
                .map(async ({name}) => {
                    const array = await WorkerAgents.Opfs.read(`${Folder}/${name}/meta.json`)
                    return ({uuid: name, ...(JSON.parse(new TextDecoder().decode(array)) as AudioMetaData)})
                })), () => [])
    }
}