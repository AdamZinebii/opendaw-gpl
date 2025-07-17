// noinspection PointlessArithmeticExpressionJS

import {PPQN} from "@opendaw/lib-dsp"
import {EffectFactories, InstrumentFactories, Project, ProjectEnv} from "@opendaw/studio-core"
import {AudioUnitBoxAdapter} from "@opendaw/studio-adapters"

const {Bar, Quarter} = PPQN

export const createExampleProject = (env: ProjectEnv): Project => {
    const project = Project.new(env)
    const {api, boxAdapters, editing} = project
    const result = editing.modify(() => {
        const {to} = project.timelineBoxAdapter.box.loopArea
        to.setValue(Bar)
        const {trackBox, audioUnitBox} = api.createInstrument(InstrumentFactories.Vaporisateur)
        const noteRegionBox = api.createNoteRegion({
            trackBox: trackBox,
            position: 0,
            duration: Bar,
            loopDuration: Quarter
        })
        api.createNoteEvent({owner: noteRegionBox, position: 0, duration: Quarter, pitch: 60})
        api.createNoteEvent({owner: noteRegionBox, position: 0, duration: Quarter, pitch: 63})
        api.createNoteEvent({owner: noteRegionBox, position: 0, duration: Quarter, pitch: 67})
        api.createNoteEvent({owner: noteRegionBox, position: 0, duration: Quarter, pitch: 72})

        const boxA = api.createEffect(boxAdapters.adapterFor(audioUnitBox, AudioUnitBoxAdapter), EffectFactories.Arpeggio, 0)
        const boxB = api.createEffect(boxAdapters.adapterFor(audioUnitBox, AudioUnitBoxAdapter), EffectFactories.Pitch, 0)
        return {boxA, boxB}
    }).unwrap()

    const {boxA, boxB} = result

    console.debug(boxA)
    console.debug(boxB)

    return project
}