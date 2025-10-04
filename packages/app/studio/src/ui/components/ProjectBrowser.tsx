import css from "./ProjectBrowser.sass?inline"
import { Html } from "@opendaw/lib-dom"
import { Lifecycle, TimeSpan } from "@opendaw/lib-std"
import { ProjectService } from "@/service/ProjectService"
import { StudioService } from "@/service/StudioService"

const className = Html.adoptStyleSheet(css, "ProjectBrowser")

type Props = {
    lifecycle: Lifecycle
    projectService: ProjectService
    studioService: StudioService
}

export const ProjectBrowser = ({ lifecycle: _lifecycle, projectService, studioService }: Props) => {
    const container = document.createElement('div')
    container.className = className

    const renderProjects = () => {
        const projects = projectService.projects.getValue()
        const loading = projectService.loading.getValue()
        
        container.innerHTML = ''

        if (loading) {
            container.innerHTML = '<div class="loading">Loading projects...</div>'
            return
        }

        if (projects.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-text">No projects yet</div>
                    <div class="empty-subtitle">Click "New" to create your first project</div>
                </div>
            `
            return
        }

                const grid = document.createElement('div')
                grid.className = 'projects-grid'

                projects.forEach(project => {
                    const card = document.createElement('div')
                    card.className = 'project-card'
                    
                    // Calculate relative time
                    const now = new Date().getTime()
                    const projectTime = new Date(project.updated_at).getTime()
                    const timeSpan = TimeSpan.millis(projectTime - now)
                    const relativeTime = timeSpan.toUnitString()
                    
                    const cardContent = document.createElement('div')
                    cardContent.className = 'project-content'
                    cardContent.innerHTML = `
                        <div class="project-name" title="${project.name}">${project.name}</div>
                        <div class="project-status">Status: ${project.status || 'unknown'}</div>
                        <div class="project-time">${relativeTime}</div>
                    `
                    
                    const deleteButton = document.createElement('button')
                    deleteButton.className = 'delete-button'
                    deleteButton.innerHTML = 'DEL'
                    deleteButton.title = 'Delete project'
                    
                    // Prevent delete button click from triggering card click
                    deleteButton.onclick = (event) => {
                        event.stopPropagation()
                        if (confirm(`Are you sure you want to delete "${project.name}"?`)) {
                            projectService.deleteProject(project.id).then(() => {
                                console.log(`✅ Project "${project.name}" deleted`)
                            }).catch(error => {
                                console.error('❌ Failed to delete project:', error)
                                alert(`Failed to delete project: ${error.message}`)
                            })
                        }
                    }
                    
                    card.appendChild(cardContent)
                    card.appendChild(deleteButton)
                    
                    cardContent.onclick = async (event) => {
                        // Prevent loading if clicking delete button
                        if ((event.target as Element).closest('.delete-button')) return

                        // Store original content for loading state
                        const originalName = card.querySelector('.project-name')?.textContent
                        const projectNameEl = card.querySelector('.project-name') as HTMLElement
                        
                        try {
                            console.log('🎵 Loading project:', project.name)
                            
                            // Show loading state
                            card.classList.add('loading')
                            if (projectNameEl) {
                                projectNameEl.textContent = 'Downloading...'
                            }
                            
                            // Step 1: Download project from Supabase to OPFS
                            console.log(`📥 Starting download for project: ${project.id}`)
                            const uuidBytes = await projectService.downloadProjectFromSupabase(project.id)
                            
                            if (projectNameEl) {
                                projectNameEl.textContent = 'Loading...'
                            }
                            
                            // Step 2: Create ProjectMeta from project data
                            const projectMeta = {
                                name: project.name,
                                description: project.description || '',
                                tags: [],
                                created: project.updated_at, // Use updated_at as fallback
                                modified: project.updated_at,
                                notepad: ''
                            }
                            
                            // Step 3: Load project into DAW using existing system
                            console.log(`🚀 Loading project into DAW: ${project.name}`)
                            await studioService.profileService.loadExisting(uuidBytes, projectMeta)
                            
                            console.log(`✅ Project "${project.name}" loaded successfully`)
                            
                        } catch (error) {
                            console.error('❌ Failed to load project:', error)
                            
                            // Show error state
                            if (projectNameEl) {
                                projectNameEl.textContent = 'Load failed'
                                setTimeout(() => {
                                    if (projectNameEl) projectNameEl.textContent = originalName || 'Untitled'
                                }, 2000)
                            }
                            
                            // Optional: Show user-friendly error
                            alert(`Failed to load project "${project.name}": ${(error as Error).message}`)
                            
                        } finally {
                            // Remove loading state
                            card.classList.remove('loading')
                            
                            // Restore original name if still showing loading text
                            setTimeout(() => {
                                if (projectNameEl && 
                                    (projectNameEl.textContent === 'Downloading...' || 
                                     projectNameEl.textContent === 'Loading...')) {
                                    projectNameEl.textContent = originalName || 'Untitled'
                                }
                            }, 100)
                        }
                    }
                    
                    grid.appendChild(card)
                })

                container.appendChild(grid)
    }

    // Projects are automatically loaded when ProjectService is initialized
    // No need to manually trigger loading here

    // Listen to project changes
    projectService.projects.subscribe(() => renderProjects())
    projectService.loading.subscribe(() => renderProjects())

    // Initial render
    renderProjects()

    return container
}
