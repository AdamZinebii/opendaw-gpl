import { createClient } from '@supabase/supabase-js'
import { DefaultObservableValue } from "@opendaw/lib-std"

// Project interface matching your database structure (minimal fields for display)
interface Project {
    id: string
    user_id: string
    name: string
    description?: string
    updated_at: string
    last_opened_at?: string
    status?: string
}

export class ProjectService {
    private readonly supabase
    private readonly _projects = new DefaultObservableValue<Project[]>([])
    private readonly _loading = new DefaultObservableValue<boolean>(false)
    private readonly _currentProject = new DefaultObservableValue<Project | null>(null)
    
    // Store user_id to reuse throughout the session
    private userId: string | null = null
    private isInitialized = false

    constructor() {
        const url = import.meta.env.VITE_SUPABASE_URL
        const key = import.meta.env.VITE_SUPABASE_ANON_KEY
        
        if (!url || !key) {
            throw new Error('ProjectService: Missing Supabase configuration')
        }
        
        this.supabase = createClient(url, key)
    }

    /**
     * Initialize service for a specific user - call this once after authentication
     */
    initialize(userId: string): void {
        this.userId = userId
        this.isInitialized = true
        console.log('📁 ProjectService: Initialized for user:', userId)
        
        // Auto-load user projects on initialization
        this.loadUserProjects(userId)
    }

    get currentProject() { return this._currentProject }
    get isReady() { return this.isInitialized && !!this.userId }

    get projects() { return this._projects }
    get loading() { return this._loading }

    async loadUserProjects(userId: string): Promise<void> {
        try {
            this._loading.setValue(true)
            
            // Query user's projects (exclude deleted projects)
            const { data, error } = await this.supabase
                .from('projects')
                .select('id, user_id, name, description, updated_at, last_opened_at, status')
                .eq('user_id', userId)
                .neq('status', 'deleted')
                .order('updated_at', { ascending: false })

            if (error) throw error

            console.log(`📊 Loaded ${data?.length || 0} projects`)
            this._projects.setValue(data || [])
        } catch (error) {
            console.error('❌ Failed to load projects:', error)
            this._projects.setValue([])
        } finally {
            this._loading.setValue(false)
        }
    }

    async createProject(request: { name?: string; description?: string } = {}): Promise<Project> {
        if (!this.userId) {
            throw new Error('ProjectService: User not initialized - call initialize() first')
        }
        
        try {
            this._loading.setValue(true)
            
            // Call the existing RPC function in your Supabase database
            const { data: projectId, error } = await this.supabase.rpc('create_new_project', {
                p_user_id: this.userId,
                p_name: request.name || 'New Project',
                p_description: request.description || null
            })

            if (error) throw error
            if (!projectId) throw new Error('No project ID returned from create_new_project')

            console.log(`✅ Created new project: ${projectId}`)
            
            // Reload projects to get the fresh list including the new project
            await this.loadUserProjects(this.userId)

            // Find the newly created project
            const projects = this._projects.getValue()
            const newProject = projects.find(p => p.id === projectId)
            
            if (!newProject) throw new Error('Created project not found in projects list')

            // Set as current project
            this._currentProject.setValue(newProject)
            
            console.log(`🎵 New project ready: ${newProject.name} (${projectId})`)
            return newProject
            
        } catch (error) {
            console.error('❌ Failed to create project:', error)
            throw error
        } finally {
            this._loading.setValue(false)
        }
    }

    async deleteProject(projectId: string): Promise<void> {
        if (!this.userId) {
            throw new Error('ProjectService: User not initialized - call initialize() first')
        }
        
        try {
            this._loading.setValue(true)
            
            // Soft delete: update status to 'deleted'
            const { error } = await this.supabase
                .from('projects')
                .update({ status: 'deleted' })
                .eq('id', projectId)
                .eq('user_id', this.userId)

            if (error) throw error

            console.log(`🗑️ Project ${projectId} deleted successfully`)
            
            // Clear current project if it was deleted
            const currentProject = this._currentProject.getValue()
            if (currentProject && currentProject.id === projectId) {
                this._currentProject.setValue(null)
            }
            
            // Reload projects to update the UI
            await this.loadUserProjects(this.userId)
            
        } catch (error) {
            console.error('❌ Failed to delete project:', error)
            throw error
        } finally {
            this._loading.setValue(false)
        }
    }

    /**
     * Upload project files to Supabase Storage (like opendaw-old)
     */
    async uploadProjectFiles(projectId: string, files: {
        projectFile?: File
        metaFile?: File  
        coverFile?: File
        bundleFile?: File
    }): Promise<{
        project_file_url?: string
        project_meta_url?: string
        project_cover_url?: string
        project_bundle_url?: string
    }> {
        if (!this.userId) {
            throw new Error('ProjectService: User not initialized')
        }

        const basePath = `${this.userId}/${projectId}`
        const uploadedUrls: any = {}

        try {
            // Upload project file (.od)
            if (files.projectFile) {
                const filePath = `${basePath}/project.od`
                const { error } = await this.supabase.storage
                    .from('projects')
                    .upload(filePath, files.projectFile, { upsert: true })

                if (error) throw error
                
                const { data: publicUrl } = this.supabase.storage
                    .from('projects')
                    .getPublicUrl(filePath)
                
                uploadedUrls.project_file_url = publicUrl.publicUrl
            }

            // Upload meta file (.json)
            if (files.metaFile) {
                const filePath = `${basePath}/meta.json`
                const { error } = await this.supabase.storage
                    .from('projects')
                    .upload(filePath, files.metaFile, { upsert: true })

                if (error) throw error
                
                const { data: publicUrl } = this.supabase.storage
                    .from('projects')
                    .getPublicUrl(filePath)
                
                uploadedUrls.project_meta_url = publicUrl.publicUrl
            }

            // Upload cover image
            if (files.coverFile) {
                const filePath = `${basePath}/image.bin`
                const { error } = await this.supabase.storage
                    .from('projects')
                    .upload(filePath, files.coverFile, { upsert: true })

                if (error) throw error
                
                const { data: publicUrl } = this.supabase.storage
                    .from('projects')
                    .getPublicUrl(filePath)
                
                uploadedUrls.project_cover_url = publicUrl.publicUrl
            }

            // Upload bundle file (.odb)
            if (files.bundleFile) {
                const filePath = `${basePath}/bundle.odb`
                const { error } = await this.supabase.storage
                    .from('projects')
                    .upload(filePath, files.bundleFile, { upsert: true })

                if (error) throw error
                
                const { data: publicUrl } = this.supabase.storage
                    .from('projects')
                    .getPublicUrl(filePath)
                
                uploadedUrls.project_bundle_url = publicUrl.publicUrl
            }

            console.log('📤 Project files uploaded successfully')
            return uploadedUrls

        } catch (error) {
            console.error('❌ Failed to upload project files:', error)
            throw error
        }
    }

    /**
     * Update project files URLs in database (calls the RPC function like opendaw-old)
     */
    async updateProjectFiles(projectId: string, urls: {
        project_file_url?: string
        project_meta_url?: string  
        project_cover_url?: string
        project_bundle_url?: string
        file_size_bytes?: number
    }): Promise<void> {
        if (!this.userId) {
            throw new Error('ProjectService: User not initialized')
        }

        try {
            const { error } = await this.supabase.rpc('update_project_files', {
                p_project_id: projectId,
                p_user_id: this.userId,
                p_project_file_url: urls.project_file_url || null,
                p_project_meta_url: urls.project_meta_url || null,
                p_project_cover_url: urls.project_cover_url || null,
                p_project_bundle_url: urls.project_bundle_url || null,
                p_file_size_bytes: urls.file_size_bytes || null
            })

            if (error) throw error
            
            console.log(`📝 Project ${projectId} file URLs updated in database`)
            
        } catch (error) {
            console.error('❌ Failed to update project files:', error)
            throw error
        }
    }

    /**
     * Set current project (for chatbot integration later)
     */
    setCurrentProject(project: Project | null): void {
        this._currentProject.setValue(project)
        console.log('📌 Current project set:', project?.name || 'None')
    }

    /**
     * Download project from Supabase to OPFS (exactly like opendaw-old)
     * Returns UUID in bytes format for loading
     */
    async downloadProjectFromSupabase(projectId: string): Promise<Uint8Array> {
        if (!this.userId) {
            throw new Error('ProjectService: User not initialized')
        }

        try {
            console.log(`📥 ProjectService: Downloading project ${projectId} from Supabase...`)

            // Get project info from Supabase (like opendaw-old)
            const { data: project, error } = await this.supabase
                .from('projects')
                .select('*')
                .eq('id', projectId)
                .eq('user_id', this.userId)
                .single()

            if (error) throw error
            if (!project) throw new Error('Project not found')

            // Always generate a new UUID for local project (like opendaw-old)
            const uuid = this.generateRandomUuid()
            
            // Create signed URLs for private bucket access (like opendaw-old)
            const basePath = `${this.userId}/${projectId}`
            const signedUrls = await Promise.allSettled([
                this.createSignedUrl(`${basePath}/project.od`),
                this.createSignedUrl(`${basePath}/meta.json`),
                this.createSignedUrl(`${basePath}/image.bin`)
            ])

            // Check for signed URL errors (like opendaw-old)
            if (signedUrls[0].status === 'rejected') {
                throw new Error(`Failed to create signed URL for project file: ${signedUrls[0].reason}`)
            }
            if (signedUrls[1].status === 'rejected') {
                throw new Error(`Failed to create signed URL for meta file: ${signedUrls[1].reason}`)
            }

            // Download project files using signed URLs (like opendaw-old)
            const downloads = await Promise.allSettled([
                this.downloadFile(signedUrls[0].value, 'project.od'),
                this.downloadFile(signedUrls[1].value, 'meta.json'), 
                signedUrls[2].status === 'fulfilled' ? this.downloadFile(signedUrls[2].value, 'image.bin') : Promise.resolve(null)
            ])

            const [projectResult, metaResult, coverResult] = downloads

            // Check for download errors (like opendaw-old)
            if (projectResult.status === 'rejected') {
                throw new Error(`Failed to download project file: ${projectResult.reason}`)
            }
            if (metaResult.status === 'rejected') {
                throw new Error(`Failed to download meta file: ${metaResult.reason}`)
            }

            // Write files to OPFS using the same method as opendaw-old
            const uuidString = this.uuidBytesToString(uuid)
            await Promise.all([
                this.writeToOPFS(`projects/v1/${uuidString}/project.od`, new Uint8Array(projectResult.value)),
                this.writeToOPFS(`projects/v1/${uuidString}/meta.json`, new Uint8Array(metaResult.value)),
                coverResult.status === 'fulfilled' && coverResult.value 
                    ? this.writeToOPFS(`projects/v1/${uuidString}/image.bin`, new Uint8Array(coverResult.value))
                    : Promise.resolve()
            ])

            console.log(`✅ ProjectService: Project ${projectId} downloaded successfully to OPFS as ${uuidString}`)
            
            // Set as current project for cloud sync
            this.setCurrentProject(project)

            return uuid

        } catch (error) {
            console.error('❌ ProjectService: Failed to download project:', error)
            throw error
        }
    }

    /**
     * Creates a signed URL for accessing private storage files (like opendaw-old)
     */
    private async createSignedUrl(filePath: string): Promise<string> {
        const { data, error } = await this.supabase.storage
            .from('projects')
            .createSignedUrl(filePath, 3600) // Valid for 1 hour

        if (error) {
            // image.bin is optional and might not exist for all projects
            if (filePath.endsWith('/image.bin') && error.message?.includes('Object not found')) {
                console.log(`ℹ️ Optional file not found: ${filePath} (this is normal)`)
            } else {
                console.error(`❌ Failed to create signed URL for ${filePath}:`, error)
            }
            throw error
        }

        console.log(`🔐 Created signed URL for ${filePath}`)
        return data.signedUrl
    }

    /**
     * Helper method to download a file from URL with detailed error handling (like opendaw-old)
     */
    private async downloadFile(url: string, filename: string): Promise<ArrayBuffer> {
        console.log(`📥 Downloading ${filename}...`)
        console.log(`🔗 URL: ${url.substring(0, 100)}...`)
        
        try {
            const response = await fetch(url)
            if (!response.ok) {
                const errorText = await response.text().catch(() => 'No error details')
                console.error(`❌ HTTP ${response.status} ${response.statusText} for ${filename}`)
                console.error(`❌ Error details:`, errorText)
                throw new Error(`Failed to download ${filename}: ${response.status} ${response.statusText}. Details: ${errorText}`)
            }
            
            const arrayBuffer = await response.arrayBuffer()
            console.log(`✅ Downloaded ${filename} (${arrayBuffer.byteLength} bytes)`)
            
            return arrayBuffer
        } catch (error) {
            if (error instanceof TypeError && error.message.includes('fetch')) {
                throw new Error(`Network error downloading ${filename}: ${error.message}`)
            }
            throw error
        }
    }

    /**
     * Write file to OPFS using same directory structure as opendaw-old
     */
    private async writeToOPFS(path: string, data: Uint8Array): Promise<void> {
        try {
            const opfsRoot = await navigator.storage.getDirectory()
            
            // Split path into directory parts and filename
            const pathParts = path.split('/')
            const filename = pathParts.pop()! // Remove and get the last part (filename)
            
            // Navigate through directory structure, creating as needed
            let currentDir = opfsRoot
            for (const dirName of pathParts) {
                if (dirName) { // Skip empty parts
                    try {
                        currentDir = await currentDir.getDirectoryHandle(dirName)
                    } catch {
                        currentDir = await currentDir.getDirectoryHandle(dirName, { create: true })
                    }
                }
            }
            
            // Write file
            const fileHandle = await currentDir.getFileHandle(filename, { create: true })
            const writable = await fileHandle.createWritable()
            await writable.write(data.buffer as ArrayBuffer) // Convert Uint8Array to ArrayBuffer
            await writable.close()
            
            console.log(`✅ Wrote ${path} to OPFS (${data.byteLength} bytes)`)
        } catch (error) {
            console.error(`❌ Failed to write ${path} to OPFS:`, error)
            throw error
        }
    }

    /**
     * Generate random UUID bytes (16 bytes)
     */
    private generateRandomUuid(): Uint8Array {
        const uuid = new Uint8Array(16)
        crypto.getRandomValues(uuid)
        return uuid
    }

    /**
     * Convert UUID bytes to string format
     */
    private uuidBytesToString(uuid: Uint8Array): string {
        const hex = Array.from(uuid, byte => byte.toString(16).padStart(2, '0')).join('')
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
    }

    /**
     * Clean up service state (called on logout)
     */
    cleanup(): void {
        this._projects.setValue([])
        this._currentProject.setValue(null)
        this._loading.setValue(false)
        this.userId = null
        this.isInitialized = false
        console.log('🧹 ProjectService: Cleaned up')
    }
}
