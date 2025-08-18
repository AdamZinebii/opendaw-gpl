import {AudioUnitBox, TrackBox} from "@opendaw/studio-boxes"
import {asInstanceOf, int, UUID} from "@opendaw/lib-std"
import {TrackType} from "@opendaw/studio-adapters"

export namespace RecordTrack {
    export const findOrCreate = (audioUnitBox: AudioUnitBox, type: TrackType): TrackBox => {
        let index: int = 0 | 0
        for (const trackBox of audioUnitBox.tracks.pointerHub.incoming()
            .map(({box}) => asInstanceOf(box, TrackBox))) {
            const hasNoRegions = trackBox.regions.pointerHub.isEmpty()
            const acceptsNotes = trackBox.type.getValue() === TrackType.Audio
            if (hasNoRegions && acceptsNotes) {return trackBox}
            index = Math.max(index, trackBox.index.getValue())
        }
        return TrackBox.create(audioUnitBox.graph, UUID.generate(), box => {
            box.type.setValue(type)
            box.index.setValue(index + 1)
            box.tracks.refer(audioUnitBox.tracks)
        })
    }
}