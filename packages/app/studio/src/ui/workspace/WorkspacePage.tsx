import css from "./WorkspacePage.sass?inline"
import {isDefined, Iterables, Lifecycle, Nullable, Terminator, Unhandled} from "@opendaw/lib-std"
import {appendChildren, createElement, PageContext, PageFactory} from "@opendaw/lib-jsx"
import {StudioService} from "@/service/StudioService.ts"
import {Workspace} from "@/ui/workspace/Workspace.ts"
import {PanelPlaceholder} from "@/ui/workspace/PanelPlaceholder.tsx"
import {PanelResizer} from "@/ui/workspace/PanelResizer.tsx"
import {PanelContents} from "@/ui/workspace/PanelContents.tsx"
import {ContentGlue} from "@/ui/workspace/ContentGlue.ts"
import {Html} from "@opendaw/lib-dom"
import {Prompter} from "@/ui/components/Prompter"
import {PreviewBanner} from "@/ui/components/PreviewBanner"
import {ApplyingLoader} from "@/ui/components/ApplyingLoader"

const className = Html.adoptStyleSheet(css, "WorkspacePage")

const buildScreen = (lifecycle: Lifecycle,
                     panelContents: PanelContents,
                     element: HTMLElement,
                     screenKey: Nullable<Workspace.ScreenKeys>) => {
    Html.empty(element)
    if (screenKey === null) {return}
    const build = (container: HTMLElement,
                   siblings: ContentGlue[],
                   content: Workspace.Content,
                   next: Nullable<Workspace.Content>,
                   orientation: Workspace.Orientation) => {
        const element: HTMLElement = (() => {
            if (content.type === "panel") {
                return (
                    <PanelPlaceholder lifecycle={lifecycle}
                                      orientation={orientation}
                                      siblings={siblings}
                                      panelContents={panelContents}
                                      panelState={content}/>
                )
            } else if (content.type === "layout") {
                const section = (
                    <section className={Html.buildClassList("workspace", content.orientation)}>
                        <div className="fill"/>
                    </section>
                )
                const children: Array<ContentGlue> = []
                for (const [curr, next] of Iterables.pairWise(content.contents)) {
                    build(section, children, curr, next, content.orientation)
                }
                return section
            } else {
                return Unhandled(content)
            }
        })()
        siblings.push({element, content})
        appendChildren(container, element)
        if (content.constrains.type === "flex" && isDefined(next) && next.constrains.type === "flex") {
            container.appendChild(
                <PanelResizer lifecycle={lifecycle}
                              panelContents={panelContents}
                              target={element}
                              orientation={orientation}
                              siblings={siblings}/>
            )
        }
    }
    build(element, [], Workspace.Default[screenKey].content, null, "vertical")
}

export const WorkspacePage: PageFactory<StudioService> = ({lifecycle, service}: PageContext<StudioService>) => {
    const mainElement: HTMLElement = <main/>
    const prompterElement: HTMLElement = <div/>
    const previewBannerElement: HTMLElement = <div/>
    const applyingLoaderElement: HTMLElement = <div/>
    let currentPrompter: HTMLElement | null = null
    
    const screenLifeTime = lifecycle.own(new Terminator())
    lifecycle.own(service.layout.screen.catchupAndSubscribe(owner => {
        screenLifeTime.terminate()
        buildScreen(screenLifeTime, service.panelLayout, mainElement, owner.getValue())
    }))
    
    // Handle preview banner visibility (show after loading completes)
    lifecycle.own(service.preview.showModal.catchupAndSubscribe(owner => {
        const showModal = owner.getValue()
        if (showModal) {
            Html.empty(previewBannerElement)
            previewBannerElement.appendChild(
                <PreviewBanner lifecycle={lifecycle} service={service}/>
            )
        } else {
            Html.empty(previewBannerElement)
        }
    }))
    
    // Handle applying loader visibility (show when applying preview to DAW)
    lifecycle.own(service.preview.isApplying.catchupAndSubscribe(owner => {
        const isApplying = owner.getValue()
        if (isApplying) {
            Html.empty(applyingLoaderElement)
            applyingLoaderElement.appendChild(
                <ApplyingLoader lifecycle={lifecycle}/>
            )
            // Hide workspace completely
            mainElement.style.display = 'none'
        } else {
            Html.empty(applyingLoaderElement)
            // Show workspace again
            mainElement.style.display = ''
        }
    }))
    
    // Handle prompter visibility with loading state
    const updatePrompter = () => {
        const showPrompter = service.layout.showPrompter.getValue()
        const isCreating = service.layout.isSongCreating.getValue()
        const progress = service.layout.songCreationProgress.getValue()
        
        if (showPrompter) {
            // Only create new prompter if we don't have one or if creation state changed
            if (!currentPrompter) {
                Html.empty(prompterElement)
                const prompter = (
                    <Prompter 
                        lifecycle={lifecycle}
                        onStartFromScratch={() => service.hidePrompter()}
                        onSubmitPrompt={(prompt) => service.handleSongPrompt(prompt)}
                        isCreating={isCreating}
                        progress={progress}
                    />
                )
                prompter.dataset.isCreating = String(isCreating)
                prompterElement.appendChild(prompter)
                currentPrompter = prompter
            }
            // If prompter exists but creation state changed, recreate it
            else if (currentPrompter && currentPrompter.dataset.isCreating !== String(isCreating)) {
                Html.empty(prompterElement)
                const prompter = (
                    <Prompter 
                        lifecycle={lifecycle}
                        onStartFromScratch={() => service.hidePrompter()}
                        onSubmitPrompt={(prompt) => service.handleSongPrompt(prompt)}
                        isCreating={isCreating}
                        progress={progress}
                    />
                )
                prompter.dataset.isCreating = String(isCreating)
                prompterElement.appendChild(prompter)
                currentPrompter = prompter
            }
            // If only progress changed, update the progress bar directly
            else if (isCreating && currentPrompter) {
                const progressFill = currentPrompter.querySelector('.progress-fill') as HTMLElement
                const progressText = currentPrompter.querySelector('.progress-text') as HTMLElement
                if (progressFill && progressText) {
                    progressFill.style.width = `${progress}%`
                    progressText.textContent = `${Math.round(progress)}%`
                }
            }
        } else {
            // Hide prompter
            Html.empty(prompterElement)
            currentPrompter = null
        }
    }
    
    lifecycle.own(service.layout.showPrompter.catchupAndSubscribe(() => updatePrompter()))
    lifecycle.own(service.layout.isSongCreating.catchupAndSubscribe(() => updatePrompter()))
    lifecycle.own(service.layout.songCreationProgress.catchupAndSubscribe(() => updatePrompter()))
    
    // Add blur effect to main element when creating
    lifecycle.own(service.layout.isSongCreating.catchupAndSubscribe(owner => {
        const isCreating = owner.getValue()
        if (isCreating) {
            mainElement.style.filter = 'blur(1.5px)'
            mainElement.style.pointerEvents = 'none'
        } else {
            mainElement.style.filter = ''
            mainElement.style.pointerEvents = ''
        }
    }))

    return (
        <div className={className}>
            {previewBannerElement}
            {mainElement}
            {prompterElement}
            {applyingLoaderElement}
        </div>
    )
}