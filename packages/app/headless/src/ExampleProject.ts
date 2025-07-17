// noinspection PointlessArithmeticExpressionJS

import {InstrumentFactories, Project, ProjectEnv} from "@opendaw/studio-core"
import {PPQN} from "@opendaw/lib-dsp"

const {Bar, Quarter, SemiQuaver} = PPQN

export const createExampleProject = (env: ProjectEnv): Project => {
    const project = Project.new(env)
    const {api, editing} = project
    editing.modify(() => {
        const {to} = project.timelineBoxAdapter.box.loopArea
        to.setValue(Bar)
        const {trackBox} = api.createInstrument(InstrumentFactories.Vaporisateur) // TODO Create Track Optional
        const noteRegionBox = api.createNoteRegion({
            trackBox: trackBox,
            position: 0,
            duration: Bar,
            loopDuration: Quarter
        })
        api.createNoteEvent({owner: noteRegionBox, position: SemiQuaver * 0, duration: SemiQuaver, pitch: 60})
        api.createNoteEvent({owner: noteRegionBox, position: SemiQuaver * 1, duration: SemiQuaver, pitch: 63})
        api.createNoteEvent({owner: noteRegionBox, position: SemiQuaver * 2, duration: SemiQuaver, pitch: 67})
        api.createNoteEvent({owner: noteRegionBox, position: SemiQuaver * 3, duration: SemiQuaver, pitch: 63})
    })
    return project
}