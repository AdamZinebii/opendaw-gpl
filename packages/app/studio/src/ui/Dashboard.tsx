import css from "./Dashboard.sass?inline"
import {Lifecycle} from "@opendaw/lib-std"
import {createElement, HTML} from "@opendaw/lib-jsx"
import {StudioService} from "@/service/StudioService.ts"
import {Html} from "@opendaw/lib-dom"
import {ProjectBrowser} from "@/ui/components/ProjectBrowser"
import {Colors} from "@opendaw/studio-core"

const className = Html.adoptStyleSheet(css, "Dashboard")

type Construct = {
    lifecycle: Lifecycle
    service: StudioService
}

export const Dashboard = ({lifecycle, service}: Construct) => {
    // Use the StudioService's cloud services instead of creating new ones
    const projectService = service.projectService
    
    return (
        <div className={className}>
            <article>
                <h1>Welcome to beatson</h1>
                <div className="columns">
                    <div>
                        <h3>Templates</h3>
                        <div className="starters">
                            {[
                                {name: "New", click: async () => {
                                    try {
                                        // Create project in Supabase FIRST to get projectId for chatbot (like opendaw-old)
                                        if (projectService && projectService.isReady) {
                                            const newProject = await projectService.createProject({
                                                name: "Untitled",
                                                description: ""
                                            })
                                            
                                            console.log('🆕 Created Supabase project for new local project:', newProject.id)
                                            console.log('📌 Project set as current for save synchronization')
                                        }
                                        
                        // Then create local project (same as opendaw-old)
                        service.cleanSlate()
                        
                        // Trigger saveAs with "Untitled" to save project files
                        const currentProfile = service.profileService.getValue()
                        if (currentProfile.nonEmpty()) {
                            await currentProfile.unwrap().saveAs({
                                name: "Untitled",
                                description: "",
                                tags: [],
                                created: new Date().toISOString(),
                                modified: new Date().toISOString()
                            })
                            // Reset saved flag so user still gets Save As dialog later
                            currentProfile.unwrap().saved = () => false
                        }
                        
                        // Switch to project page with prompter
                        service.switchScreen("project")
                                    } catch (error) {
                                        console.error('❌ Failed to create Supabase project:', error)
                                        // Fallback: create local project anyway
                        service.cleanSlate()
                        
                        // Trigger saveAs with "Untitled" to save project files
                        const currentProfile = service.profileService.getValue()
                        if (currentProfile.nonEmpty()) {
                            await currentProfile.unwrap().saveAs({
                                name: "Untitled",
                                description: "",
                                tags: [],
                                created: new Date().toISOString(),
                                modified: new Date().toISOString()
                            })
                            // Reset saved flag so user still gets Save As dialog later
                            currentProfile.unwrap().saved = () => false
                        }
                        
                        // Switch to project page with prompter
                        service.switchScreen("project")
                                    }
                                }}
                            ].map(({name, click}, index) => {
                                const svgSource = `viscious-speed/${String(index + 1).padStart(2, "0")}.svg`
                                return (
                                    <div onclick={click}>
                                        <HTML src={fetch(svgSource)} className="icon"/>
                                        <label>{name}</label>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                    <div>
                        <h3>Your Projects</h3>
                                {projectService ? (
                                    <ProjectBrowser
                                        lifecycle={lifecycle}
                                        projectService={projectService}
                                        studioService={service}
                                    />
                                ) : (
                                    <div style={{color: "#666", fontStyle: "italic"}}>
                                        Projects unavailable - check Supabase configuration
                                    </div>
                                )}
                    </div>
                </div>
                <p style={{marginTop: "1.5em", fontSize: "0.625em"}}>
                    This DAW is a clone of <a
                    href="https://github.com/andremichelle/openDAW/tree/e06a7d5d587409f25aa077953f7747c4055f094e" 
                    target="_blank" 
                    style={{color: Colors.green}}>openDAW GPL commit</a>, and the release of the modified code is <a 
                    href="https://github.com/AdamZinebii/opendaw-gpl/tree/gpl-working"
                    target="_blank"
                    style={{color: Colors.green}}>here</a>.
                </p>
            </article>
        </div>
    )
}