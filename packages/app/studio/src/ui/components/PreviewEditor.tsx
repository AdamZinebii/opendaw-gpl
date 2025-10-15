import css from "./PreviewEditor.sass?inline"
import {createElement} from "@opendaw/lib-jsx"
import {Lifecycle} from "@opendaw/lib-std"
import {Html} from "@opendaw/lib-dom"
import {Icon} from "@/ui/components/Icon"
import {IconSymbol} from "@opendaw/studio-adapters"
import {ContentEditor} from "@/ui/timeline/editors/ContentEditor"

const className = Html.adoptStyleSheet(css, "PreviewEditor")

type Construct = {
    lifecycle: Lifecycle
    service: any
    region: any
    project: any
}

export const PreviewEditor = ({lifecycle, service, region, project}: Construct) => {
    const closeEditor = () => {
        service.preview.editingRegion.setValue(null)
        project.userEditingManager.timeline.clear()
    }
    
    // Create a temporary service wrapper that uses the preview project
    const previewService = {
        ...service,
        project: project  // Use preview project instead of main project
    }
    
    return (
        <div className={className}>
            <div className="editor-backdrop" onclick={(e: Event) => {
                if (e.target === e.currentTarget) closeEditor()
            }}>
                <div className="editor-window">
                    <div className="editor-header">
                        <div className="header-left">
                            <Icon symbol={IconSymbol.Piano}/>
                            <h3>✏️ Edit: {region.label || 'MIDI Region'}</h3>
                        </div>
                        <button className="close-btn" onclick={closeEditor}>
                            <Icon symbol={IconSymbol.Close}/>
                        </button>
                    </div>
                    
                    <div className="editor-body">
                        <ContentEditor
                            lifecycle={lifecycle}
                            service={previewService}
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}

