import css from "./AddTrackRow.sass?inline"
import {Html} from "@opendaw/lib-dom"
import {createElement} from "@opendaw/lib-jsx"
import {Lifecycle} from "@opendaw/lib-std"
import {StudioService} from "@/service/StudioService.ts"
import {Icon} from "@/ui/components/Icon"
import {IconSymbol} from "@opendaw/studio-adapters"
import {DevicesBrowser} from "@/ui/browse/DevicesBrowser"
import {Dialog} from "@/ui/components/Dialog"
import {Surface} from "@/ui/surface/Surface"

const className = Html.adoptStyleSheet(css, "AddTrackRow")

type Construct = {
    lifecycle: Lifecycle
    service: StudioService
}

export const AddTrackRow = ({lifecycle, service}: Construct) => {
    const openAddTrackDialog = () => {
        const dialog: HTMLDialogElement = (
            <Dialog headline="Add Track" 
                    cancelable={true}>
                <div style={{maxHeight: "60vh", overflow: "auto"}}>
                    <DevicesBrowser lifecycle={lifecycle} service={service} filter="instruments-only" onDeviceSelected={() => dialog.close()}/>
                </div>
            </Dialog>
        )
        Surface.get().body.appendChild(dialog)
        dialog.showModal()
        dialog.addEventListener("close", () => dialog.remove(), {once: true})
    }

    const element: HTMLElement = (
        <div className={className} onclick={openAddTrackDialog}>
            <div className="header">
                <Icon symbol={IconSymbol.Add}/>
                <span>Add Track</span>
            </div>
            <div className="clip-lane"/>
            <div className="region-lane"/>
        </div>
    )

    // Update grid row position based on number of tracks
    const updatePosition = () => {
        const {project} = service
        const audioUnits = project.rootBox.audioUnits.pointerHub.incoming()
        // Count non-output tracks (output is at index 0, real tracks start at 1)
        const trackCount = audioUnits.length > 0 ? audioUnits.length : 1
        element.style.gridRow = String(trackCount)
    }

    lifecycle.own(service.project.rootBoxAdapter.audioUnits.catchupAndSubscribe({
        onAdd: updatePosition,
        onRemove: updatePosition,
        onReorder: updatePosition
    }))

    return element
}

