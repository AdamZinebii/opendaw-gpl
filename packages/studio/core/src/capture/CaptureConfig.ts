import {byte} from "@opendaw/lib-std"

// TODO This is the ChatGPT suggestion we might come back to later
//  when we can differentiate between audio and midi inputs

type MonitorMode = "off" | "on" | "auto"
type RecordMode = "normal" | "replace" | "punch"
type AudioInput = {}
type MidiInput = {
    channel: byte | "omni"
}
type CaptureConfig = {
    deviceId: string
    armed: boolean
    recordMode: RecordMode
} & ({
    type: "audio"
    input: AudioInput
    monitorMode: MonitorMode
    monitorGain: number
    monitorMute: boolean
} | {
    type: "midi"
    input: MidiInput
})