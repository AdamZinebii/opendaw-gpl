import {
    asInstanceOf,
    byte,
    isUndefined,
    Nullish,
    Option,
    quantizeCeil,
    quantizeFloor,
    Terminable,
    Terminator,
    UUID
} from "@opendaw/lib-std"
import {PPQN} from "@opendaw/lib-dsp"
import {Events} from "@opendaw/lib-dom"
import {MidiData} from "@opendaw/lib-midi"
import {NoteEventBox, NoteEventCollectionBox, NoteRegionBox, TrackBox} from "@opendaw/studio-boxes"
import {TrackType} from "@opendaw/studio-adapters"
import {Engine} from "../Engine"
import {Project} from "../Project"
import {Capture} from "./Capture"

export namespace RecordMidi {
    type RecordMidiContext = {
        midi: MIDIAccess,
        engine: Engine,
        project: Project,
        capture: Capture
    }

    export const start = ({midi, engine, project, capture}: RecordMidiContext): Terminable => {
        console.debug("RecordMidi.start", midi)
        const beats = PPQN.fromSignature(1, project.timelineBox.signature.denominator.getValue())
        const trackBox: Nullish<TrackBox> = capture.box.tracks.pointerHub.incoming()
            .map(({box}) => asInstanceOf(box, TrackBox))
            .find(box => {
                const hasNoRegions = box.regions.pointerHub.isEmpty()
                const acceptsNotes = box.type.getValue() === TrackType.Notes
                return hasNoRegions && acceptsNotes
            })
        if (isUndefined(trackBox)) {return Terminable.Empty} // TODO Create a new track
        const {editing, boxGraph} = project
        const terminator = new Terminator()
        const activeNotes = new Map<byte, NoteEventBox>()
        let writing: Option<{ region: NoteRegionBox, collection: NoteEventCollectionBox }> = Option.None
        terminator.own(engine.position.catchupAndSubscribe(owner => {
            if (writing.isEmpty()) {return}
            const writePosition = owner.getValue()
            const {region, collection} = writing.unwrap()
            editing.modify(() => {
                if (region.isAttached() && collection.isAttached()) {
                    const {position, duration, loopDuration} = region
                    const newDuration = quantizeCeil(writePosition, beats) - position.getValue()
                    duration.setValue(newDuration)
                    loopDuration.setValue(newDuration)
                    for (const event of activeNotes.values()) {
                        if (event.isAttached()) {
                            event.duration.setValue(writePosition - event.position.getValue())
                        } else {
                            activeNotes.delete(event.pitch.getValue())
                        }
                    }
                } else {
                    writing = Option.None
                }
            }, false)
        }))
        terminator.ownAll(...midi.inputs.values()
            .map(input => Events.subscribeAny(input, "midimessage", (event: MIDIMessageEvent) => {
                if (!engine.isRecording.getValue()) {return}
                const data = event.data
                if (isUndefined(data)) {return}
                const position = engine.position.getValue()
                if (MidiData.isNoteOn(data)) {
                    const pitch = MidiData.readParam1(data)
                    if (writing.isEmpty()) {
                        editing.modify(() => {
                            const collection = NoteEventCollectionBox.create(boxGraph, UUID.generate())
                            const region = NoteRegionBox.create(boxGraph, UUID.generate(), box => {
                                box.position.setValue(quantizeFloor(position, beats))
                                box.events.refer(collection.owners)
                                box.regions.refer(trackBox.regions)
                            })
                            writing = Option.wrap({region, collection})
                        }, false)
                    }
                    const {collection} = writing.unwrap()
                    editing.modify(() => {
                        activeNotes.set(pitch, NoteEventBox.create(boxGraph, UUID.generate(), box => {
                            box.position.setValue(position)
                            box.duration.setValue(1.0)
                            box.pitch.setValue(pitch)
                            box.velocity.setValue(MidiData.readParam2(data) / 127.0)
                            box.events.refer(collection.events)
                        }))
                    }, false)
                } else if (MidiData.isNoteOff(data)) {
                    const pitch = MidiData.readParam1(data)
                    activeNotes.delete(pitch)
                }
            })))
        return terminator
    }
}