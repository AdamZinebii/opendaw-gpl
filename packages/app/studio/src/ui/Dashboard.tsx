import css from "./Dashboard.sass?inline"
import {Lifecycle} from "@opendaw/lib-std"
import {createElement} from "@opendaw/lib-jsx"
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