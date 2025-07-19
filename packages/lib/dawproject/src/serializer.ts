import {Project, Timeline} from "./schema"

// TODO This is written by chat-gpt and it sucks
export const serializeProject = (project: Project): string => {
    const doc = document.implementation.createDocument(null, "Project", null)
    const root = doc.documentElement
    root.setAttribute("version", project.version)
    const create = (tag: string) => doc.createElement(tag)
    const append = (parent: Element, child: Element) => parent.appendChild(child)
    const set = (el: Element, key: string, val: any) => {
        if (val !== undefined) el.setAttribute(key, String(val))
    }
    // Application
    const application = create("Application")
    set(application, "name", project.application.name)
    set(application, "version", project.application.version)
    append(root, application)
    // Transport
    if (project.transport) {
        const transport = create("Transport")
        const tempo = project.transport.tempo
        if (tempo) {
            const el = create("Tempo")
            set(el, "value", tempo.value?.toFixed(6))
            set(el, "min", tempo.min?.toFixed(6))
            set(el, "max", tempo.max?.toFixed(6))
            set(el, "unit", tempo.unit)
            set(el, "id", tempo.id)
            set(el, "name", tempo.name)
            append(transport, el)
        }
        const ts = project.transport.timeSignature
        if (ts) {
            const el = create("TimeSignature")
            set(el, "numerator", ts.numerator)
            set(el, "denominator", ts.denominator)
            set(el, "id", ts.id)
            append(transport, el)
        }
        append(root, transport)
    }

    // Structure
    const structure = create("Structure")
    for (const track of project.structure) {
        const tr = create("Track")
        set(tr, "id", track.id)
        set(tr, "name", track.name)
        set(tr, "color", track.color)
        set(tr, "comment", track.comment)
        if ("contentType" in track) set(tr, "contentType", (track as any).contentType)
        if ("loaded" in track) set(tr, "loaded", (track as any).loaded)
        const channel = (track as any).channel
        if (channel) {
            const ch = create("Channel")
            set(ch, "id", channel.id)
            set(ch, "role", channel.role)
            set(ch, "destination", channel.destination)
            set(ch, "audioChannels", channel.audioChannels)
            set(ch, "solo", channel.solo)
            const vol = channel.volume
            if (vol) {
                const el = create("Volume")
                set(el, "value", vol.value?.toFixed(6))
                set(el, "min", vol.min?.toFixed(6))
                set(el, "max", vol.max?.toFixed(6))
                set(el, "unit", vol.unit)
                set(el, "id", vol.id)
                set(el, "name", vol.name)
                append(ch, el)
            }
            const pan = channel.pan
            if (pan) {
                const el = create("Pan")
                set(el, "value", pan.value?.toFixed(6))
                set(el, "min", pan.min?.toFixed(6))
                set(el, "max", pan.max?.toFixed(6))
                set(el, "unit", pan.unit)
                set(el, "id", pan.id)
                set(el, "name", pan.name)
                append(ch, el)
            }

            const mute = channel.mute
            if (mute) {
                const el = create("Mute")
                set(el, "value", mute.value)
                set(el, "id", mute.id)
                set(el, "name", mute.name)
                append(ch, el)
            }

            const devices = (channel as any).devices
            if (devices?.length) {
                const devicesEl = create("Devices")
                for (const d of devices) {
                    const dev = create(d.type || "Device")
                    set(dev, "deviceID", d.deviceID)
                    set(dev, "deviceName", d.deviceName)
                    set(dev, "deviceRole", d.deviceRole)
                    set(dev, "loaded", d.loaded)
                    set(dev, "id", d.id)
                    set(dev, "name", d.name)

                    if (d.statePath) {
                        const state = create("State")
                        set(state, "path", d.statePath)
                        append(dev, state)
                    }

                    if (d.enabled) {
                        const enabled = create("Enabled")
                        set(enabled, "value", d.enabled.value)
                        set(enabled, "id", d.enabled.id)
                        set(enabled, "name", d.enabled.name)
                        append(dev, enabled)
                    }

                    append(devicesEl, dev)
                }
                append(ch, devicesEl)
            }

            append(tr, ch)
        }
        append(structure, tr)
    }
    append(root, structure)

    // Arrangement
    if (project.arrangement) {
        const arrangement = create("Arrangement")
        set(arrangement, "id", project.arrangement.id)

        const addTimeline = (parent: Element, t: Timeline) => {
            const makeTimeline = (type: string, attrs: any = {}) => {
                const el = create(type)
                for (const [k, v] of Object.entries(attrs)) {
                    if (v !== undefined) set(el, k, v)
                }
                return el
            }
            if ("lanes" in t) {
                const lanes = makeTimeline("Lanes", {id: t.id, timeUnit: t.timeUnit, track: (t as any).track})
                for (const lane of (t as any).lanes ?? []) {
                    addTimeline(lanes, lane)
                }
                append(parent, lanes)
            }
            if ("clips" in t) {
                const clips = makeTimeline("Clips", {id: t.id})
                for (const clip of (t as any).clips ?? []) {
                    const c = makeTimeline("Clip", {
                        time: clip.time,
                        duration: clip.duration,
                        playStart: clip.playStart,
                        playStop: clip.playStop,
                        loopStart: clip.loopStart,
                        loopEnd: clip.loopEnd,
                        fadeTimeUnit: clip.fadeTimeUnit,
                        fadeInTime: clip.fadeInTime,
                        fadeOutTime: clip.fadeOutTime,
                        contentTimeUnit: clip.contentTimeUnit,
                        name: clip.name
                    })
                    if (clip.timeline) addTimeline(c, clip.timeline)
                    append(clips, c)
                }
                append(parent, clips)
            }
            if ("notes" in t) {
                const notes = makeTimeline("Notes", {id: t.id})
                for (const note of (t as any).notes ?? []) {
                    const n = create("Note")
                    set(n, "time", note.time)
                    set(n, "duration", note.duration)
                    set(n, "channel", note.channel)
                    set(n, "key", note.key)
                    set(n, "vel", note.velocity)
                    set(n, "rel", note.releaseVelocity)
                    append(notes, n)
                }
                append(parent, notes)
            }
            if ("warps" in t) {
                const warps = makeTimeline("Warps", {
                    id: t.id,
                    timeUnit: (t as any).timeUnit,
                    contentTimeUnit: (t as any).contentTimeUnit
                })
                for (const warp of (t as any).warps ?? []) {
                    const w = create("Warp")
                    set(w, "time", warp.time)
                    set(w, "contentTime", warp.contentTime)
                    append(warps, w)
                }
                if ((t as any).file) {
                    const audio = create("Audio")
                    set(audio, "algorithm", (t as any).algorithm)
                    set(audio, "channels", (t as any).channels)
                    set(audio, "duration", (t as any).duration)
                    set(audio, "sampleRate", (t as any).sampleRate)
                    set(audio, "id", (t as any).id)
                    const file = create("File")
                    set(file, "path", (t as any).file.path)
                    append(audio, file)
                    append(warps, audio)
                }
                append(parent, warps)
            }
        }
        addTimeline(arrangement, project.arrangement)
        append(root, arrangement)
    }
    return new XMLSerializer().serializeToString(doc)
}