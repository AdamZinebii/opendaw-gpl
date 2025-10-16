import css from "./PreviewBanner.sass?inline"
import {Lifecycle} from "@opendaw/lib-std"
import {createElement} from "@opendaw/lib-jsx"
import {Html} from "@opendaw/lib-dom"
import {Button} from "@/ui/components/Button"
import {Icon} from "@/ui/components/Icon"
import {IconSymbol} from "@opendaw/studio-adapters"
import {Colors} from "@opendaw/studio-core"
import {StudioService} from "@/service/StudioService"
import {PreviewTimeline} from "./PreviewTimeline"
import {PreviewEditor} from "./PreviewEditor"

const className = Html.adoptStyleSheet(css, "PreviewBanner")

type Construct = {
    lifecycle: Lifecycle
    service: StudioService
}

export const PreviewBanner = ({lifecycle, service}: Construct) => {
    const handleApplyToDAW = async () => {
        // Apply preview to main DAW workspace
        await service.acceptPreview()
    }

    // Track count element that updates reactively
    const trackCountElement: HTMLElement = <span/>
    const headerElement: HTMLElement = (
        <div className="preview-header">
            <div className="header-left">
                <Icon symbol={IconSymbol.Robot}/>
                <div className="header-text">
                    <h3>🎵 AI Generated Song Preview</h3>
                    <p>{trackCountElement} tracks • 16-bar loops</p>
                </div>
            </div>
            <button className="close-btn" onclick={() => service.rejectPreview()}>
                <Icon symbol={IconSymbol.Close}/>
            </button>
        </div>
    )

    // Timeline container that updates when preview project changes
    const timelineContainer: HTMLElement = <div className="preview-body"/>
    const controlsContainer: HTMLElement = <div className="preview-controls"/>
    
    // Update UI when preview project changes
    const updatePreview = () => {
        const previewProject = service.preview.project.getValue()
        const previewProfile = service.preview.profile.getValue()
        const trackCount = previewProject?.rootBoxAdapter.audioUnits.adapters().length || 0
        
        console.log(`🔄 [PreviewBanner] Preview updated: ${trackCount} tracks`)
        trackCountElement.textContent = String(trackCount)
        
        // Re-render timeline
        Html.empty(timelineContainer)
        Html.empty(controlsContainer)
        
        if (previewProject && previewProfile) {
            const preview = PreviewTimeline({
                lifecycle,
                project: previewProject,
                profile: previewProfile,
                service
            })
            
            // Add timeline (just tracks, no headers)
            timelineContainer.appendChild(preview.element)
            
            // Add controls below
            const playControlDiv = <div className="play-control">{preview.playButton}</div>
            const bpmControlDiv = <div className="bpm-control">{preview.bpmDisplay}</div>
            const sectionsDiv = <div className="section-selector">{preview.sectionButtons}</div>
            
            controlsContainer.appendChild(playControlDiv)
            controlsContainer.appendChild(bpmControlDiv)
            controlsContainer.appendChild(sectionsDiv)
        }
    }
    
    // Subscribe to preview project changes
    lifecycle.own(service.preview.project.subscribe(() => updatePreview()))
    lifecycle.own(service.preview.profile.subscribe(() => updatePreview()))
    updatePreview() // Initial render
    
    // Editor container (reactive to editingRegion changes)
    const editorContainer: HTMLElement = <div/>
    const updateEditor = () => {
        const editingRegion = service.preview.editingRegion.getValue()
        const previewProject = service.preview.project.getValue()
        
        Html.empty(editorContainer)
        if (editingRegion && previewProject) {
            console.log('📝 [PreviewBanner] Showing editor for region:', editingRegion.label)
            editorContainer.appendChild(
                <PreviewEditor
                    lifecycle={lifecycle}
                    service={service}
                    region={editingRegion}
                    project={previewProject}
                />
            )
        } else {
            console.log('📝 [PreviewBanner] Hiding editor')
        }
    }
    
    lifecycle.own(service.preview.editingRegion.subscribe(() => updateEditor()))
    updateEditor() // Initial render

    // Loading overlay that shows when applying to DAW
    const loadingOverlay: HTMLElement = <div className="applying-overlay" style={{display: 'none'}}>
        <div className="applying-content">
            <div className="spinner"></div>
            <h3>Applying to DAW...</h3>
            <p>Merging tracks and arrangements</p>
        </div>
    </div>

    // Show/hide loading overlay based on isApplying state
    const updateLoadingState = () => {
        const isApplying = service.preview.isApplying.getValue()
        loadingOverlay.style.display = isApplying ? 'flex' : 'none'
    }
    lifecycle.own(service.preview.isApplying.subscribe(() => updateLoadingState()))
    updateLoadingState() // Initial state

    return (
        <div className={className}>
            {/* Dark overlay backdrop */}
            <div className="preview-backdrop" onclick={(e: Event) => {
                if (e.target === e.currentTarget) {
                    service.rejectPreview()
                }
            }}>
                {/* Preview window */}
                <div className="preview-window">
                    {/* Header */}
                    {headerElement}

                    {/* Preview timeline (just tracks, no headers) */}
                    {timelineContainer}
                    
                    {/* Controls below timeline (play + sections) */}
                    {controlsContainer}

                    {/* Footer with actions */}
                    <div className="preview-footer">
                        <Button
                            lifecycle={lifecycle}
                            onClick={handleApplyToDAW}
                            appearance={{
                                activeColor: Colors.green,
                                framed: true
                            }}
                        >
                            <Icon symbol={IconSymbol.Add}/>
                            Apply to DAW
                        </Button>
                    </div>
                </div>
                
                {/* Loading overlay when applying */}
                {loadingOverlay}
            </div>
            
            {/* Editor modal container (reactive) */}
            {editorContainer}
        </div>
    )
}

