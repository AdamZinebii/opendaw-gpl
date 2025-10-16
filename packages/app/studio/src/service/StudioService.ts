import {
    assert,
    DefaultObservableValue,
    EmptyExec,
    Func,
    int,
    isDefined,
    Notifier,
    Nullable,
    Observer,
    Option,
    panic,
    Procedure,
    Progress,
    Provider,
    safeRead,
    Subscription,
    Terminator,
    UUID
} from "@opendaw/lib-std"
import {TimelineRange} from "@/ui/timeline/TimelineRange.ts"
import {initAppMenu} from "@/service/app-menu"
import {Snapping} from "@/ui/timeline/Snapping.ts"
import {PanelContents} from "@/ui/workspace/PanelContents.tsx"
import {createPanelFactory} from "@/ui/workspace/PanelFactory.tsx"
import {SpotlightDataSupplier} from "@/ui/spotlight/SpotlightDataSupplier.ts"
import {Workspace} from "@/ui/workspace/Workspace.ts"
import {PanelType} from "@/ui/workspace/PanelType.ts"
import {Dialogs} from "@/ui/components/dialogs.tsx"
import {BuildInfo} from "@/BuildInfo.ts"
import {MidiDeviceAccess} from "@/midi/devices/MidiDeviceAccess"
import {SamplePlayback} from "@/service/SamplePlayback"
import {Shortcuts} from "@/service/Shortcuts"
import {ProjectProfileService} from "./ProjectProfileService"
import {StudioSignal} from "./StudioSignal"
import {Projects} from "@/project/Projects"
import {SampleDialogs} from "@/ui/browse/SampleDialogs"
import {AudioOutputDevice} from "@/audio/AudioOutputDevice"
import {FooterLabel} from "@/service/FooterLabel"
import {RouteLocation} from "@opendaw/lib-jsx"
import {PPQN} from "@opendaw/lib-dsp"
import {Browser, ConsoleCommands, Errors, Files} from "@opendaw/lib-dom"
import {Promises} from "@opendaw/lib-runtime"
import {ExportStemsConfiguration, Sample} from "@opendaw/studio-adapters"
import {Xml} from "@opendaw/lib-xml"
import {Address} from "@opendaw/lib-box"
import {MetaDataSchema} from "@opendaw/lib-dawproject"
import {Recovery} from "@/Recovery.ts"
import {MIDILearning} from "@/midi/devices/MIDILearning"
import {ProjectService} from "@/service/ProjectService.ts"
import {AuthService} from "@/service/AuthService.ts"
import {FutureSampleApi} from "@/service/SampleApi"
import {
    AudioWorklets,
    DawProject,
    DawProjectImport,
    EngineFacade,
    EngineWorklet,
    MainThreadSampleManager,
    Project,
    ProjectEnv,
    ProjectMeta,
    ProjectProfile,
    RestartWorklet
} from "@opendaw/studio-core"
import {AudioOfflineRenderer} from "@/audio/AudioOfflineRenderer"
import {ProjectDialogs} from "@/project/ProjectDialogs"
import {AudioImporter} from "@/audio/AudioImport"
import {FilePickerAcceptTypes} from "@/ui/FilePickerAcceptTypes"

/**
 * I am just piling stuff after stuff in here to boot the environment.
 * I suppose this gets cleaned up sooner or later.
 */

const range = new TimelineRange({padding: 12})
range.minimum = PPQN.fromSignature(3, 8)
range.maxUnits = PPQN.fromSignature(128, 1)
range.showUnitInterval(0, PPQN.fromSignature(16, 1))

const snapping = new Snapping(range)

export class StudioService implements ProjectEnv {
    #progressInterval: ReturnType<typeof setInterval> | null = null
    
    readonly layout = {
        systemOpen: new DefaultObservableValue<boolean>(false),
        helpVisible: new DefaultObservableValue<boolean>(true),
        screen: new DefaultObservableValue<Nullable<Workspace.ScreenKeys>>("default"),
        showPrompter: new DefaultObservableValue<boolean>(false),
        songCreationProgress: new DefaultObservableValue<number>(0), // 0-100 progress
        isSongCreating: new DefaultObservableValue<boolean>(false) // Loading state
    } as const
    readonly preview = {
        isActive: new DefaultObservableValue<boolean>(false),
        showModal: new DefaultObservableValue<boolean>(false), // Show modal after loading
        isApplying: new DefaultObservableValue<boolean>(false), // Loading state when applying to DAW
        project: new DefaultObservableValue<any | null>(null), // Observable preview project
        profile: new DefaultObservableValue<any | null>(null), // Observable preview profile
        originalProjectData: null as { profile: ProjectProfile, uuid: UUID.Format } | null,
        originalProjectId: null as string | null, // Supabase project ID for song-maker/retry calls
        currentPrompt: null as string | null,
        projectName: null as string | null, // AI-generated project name
        editingRegion: new DefaultObservableValue<any | null>(null), // Observable: Region being edited in preview
        sections: new DefaultObservableValue<any[]>([]) // Observable: Song sections from LLM
    }
    readonly transport = {
        loop: new DefaultObservableValue<boolean>(false)
    } as const
    readonly timeline = {
        range,
        snapping,
        clips: {
            count: new DefaultObservableValue(3),
            visible: new DefaultObservableValue(true)
        },
        followPlaybackCursor: new DefaultObservableValue(true),
        primaryVisible: new DefaultObservableValue(true)
    } as const
    readonly menu = initAppMenu(this)
    readonly profileService = new ProjectProfileService(this)
    readonly projectService: ProjectService | null = null
    readonly authService: AuthService | null = null
    readonly panelLayout = new PanelContents(createPanelFactory(this))
    readonly spotlightDataSupplier = new SpotlightDataSupplier()
    readonly samplePlayback: SamplePlayback
    // noinspection JSUnusedGlobalSymbols
    readonly _shortcuts = new Shortcuts(this) // TODO reference will be used later in a key-mapping configurator
    readonly recovery = new Recovery(this)
    readonly midiLearning = new MIDILearning(this)
    readonly engine = new EngineFacade()
    readonly dialogs: ProjectEnv.Dialogs = {
        info: (headline: string, message: string, okText: string): Promise<void> =>
            Dialogs.info({headline, message, okText}),
        approve: (headline: string, message: string, approveText: string, cancelText: string): Promise<boolean> =>
            Dialogs.approve({headline, message, approveText, cancelText}).then(() => true, () => false)
    }

    readonly #signals = new Notifier<StudioSignal>()

    #factoryFooterLabel: Option<Provider<FooterLabel>> = Option.None

    #midi: Option<MidiDeviceAccess> = Option.None

    constructor(readonly audioContext: AudioContext,
                readonly audioWorklets: AudioWorklets,
                readonly audioDevices: AudioOutputDevice,
                readonly sampleAPI: FutureSampleApi,
                readonly sampleManager: MainThreadSampleManager,
                readonly buildInfo: BuildInfo) {
        this.samplePlayback = new SamplePlayback(audioContext)
        
        // Initialize cloud services for project management
        try {
            (this as any).authService = new AuthService();
            (this as any).projectService = new ProjectService()
            
            // Initialize ProjectService when user is available
            this.authService!.user.catchupAndSubscribe((userObservable) => {
                const user = userObservable.getValue()
                if (user) {
                    this.projectService!.initialize(user.id)
                    console.log('📁 StudioService: ProjectService initialized for user:', user.email)
                }
            })
        } catch (error) {
            console.warn('⚠️ StudioService: Cloud services not available:', error)
            // Services will remain null and save will work in local-only mode
        }
        
        const lifeTime = new Terminator()
        const observer = (optProfile: Option<ProjectProfile>) => {
            const root = RouteLocation.get().path === "/"
            if (root) {this.layout.screen.setValue(null)}
            lifeTime.terminate()
            if (optProfile.nonEmpty()) {
                const profile = optProfile.unwrap()
                const {project, meta} = profile
                console.debug(`switch to %c${meta.name}%c`, "color: hsl(25, 69%, 63%)", "color: inherit")
                const {timelineBox, editing, userEditingManager} = project
                const loopState = this.transport.loop
                const loopEnabled = timelineBox.loopArea.enabled
                loopState.setValue(loopEnabled.getValue())
                lifeTime.ownAll(
                    project,
                    loopState.subscribe(value => editing.modify(() => loopEnabled.setValue(value.getValue()))),
                    userEditingManager.timeline.catchupAndSubscribe(option => option
                        .ifSome(() => this.panelLayout.showIfAvailable(PanelType.ContentEditor))),
                    timelineBox.durationInPulses.catchupAndSubscribe(owner => range.maxUnits = owner.getValue() + PPQN.Bar)
                )
                range.showUnitInterval(0, PPQN.fromSignature(16, 1))

                // -------------------------------
                // Show views if content available
                // -------------------------------
                //
                // Markers
                if (timelineBox.markerTrack.markers.pointerHub.nonEmpty()) {
                    this.timeline.primaryVisible.setValue(true)
                }
                // Clips
                const maxClipIndex: int = project.rootBoxAdapter.audioUnits.adapters()
                    .reduce((max, unit) => Math.max(max, unit.tracks.values()
                        .reduce((max, track) => Math.max(max, track.clips.collection.getMinFreeIndex()), 0)), 0)
                if (maxClipIndex > 0) {
                    this.timeline.clips.count.setValue(maxClipIndex + 1)
                    this.timeline.clips.visible.setValue(true)
                } else {
                    this.timeline.clips.count.setValue(3)
                    this.timeline.clips.visible.setValue(false)
                }
                let screen: Nullable<Workspace.ScreenKeys> = null
                const restart: RestartWorklet = {
                    unload: async (event: unknown) => {
                        screen = this.layout.screen.getValue()
                        // we need to restart the screen to subscribe to new broadcaster instances
                        this.switchScreen(null)
                        this.engine.releaseWorklet()
                        await Dialogs.info({
                            headline: "Audio-Engine Error",
                            message: String(safeRead(event, "message") ?? event),
                            okText: "Restart"
                        })
                    },
                    load: (engine: EngineWorklet) => {
                        this.engine.setWorklet(engine)
                        this.switchScreen(screen)
                    }
                }
                this.engine.setWorklet(project.startAudioWorklet(this.audioWorklets, restart))
                if (root) {this.switchScreen("default")}
            } else {
                this.engine.releaseWorklet()
                range.maxUnits = PPQN.fromSignature(128, 1)
                range.showUnitInterval(0, PPQN.fromSignature(16, 1))
                this.layout.screen.setValue("dashboard")
            }
        }
        this.profileService.catchupAndSubscribe(owner => observer(owner.getValue()))

        ConsoleCommands.exportAccessor("box.graph.boxes",
            () => this.runIfProject(({boxGraph}) => boxGraph.debugBoxes()))
        ConsoleCommands.exportMethod("box.graph.lookup",
            (address: string) => this.runIfProject(({boxGraph}) => boxGraph.findVertex(Address.decode(address)).match({
                none: () => "not found",
                some: vertex => vertex.toString()
            })).match({none: () => "no project", some: value => value}))
        ConsoleCommands.exportAccessor("box.graph.dependencies",
            () => this.runIfProject(project => project.boxGraph.debugDependencies()))

        if (!Browser.isLocalHost()) {
            window.addEventListener("beforeunload", (event: Event) => {
                if (!navigator.onLine) {event.preventDefault()}
                if (this.hasProfile && (this.profile.hasChanges() || !this.project.editing.isEmpty())) {
                    event.preventDefault()
                }
            })
        }

        this.spotlightDataSupplier.registerAction("Create Synth", EmptyExec)
        this.spotlightDataSupplier.registerAction("Create Drumcomputer", EmptyExec)
        this.spotlightDataSupplier.registerAction("Create ModularSystem", EmptyExec)

        const configLocalStorageBoolean = (value: DefaultObservableValue<boolean>,
                                           item: string,
                                           set: Procedure<boolean>,
                                           defaultValue: boolean = false) => {
            value.setValue((localStorage.getItem(item) ?? String(defaultValue)) === String(true))
            value.catchupAndSubscribe(owner => {
                const bool = owner.getValue()
                set(bool)
                try {localStorage.setItem(item, String(bool))} catch (_reason: any) {}
            })
        }

        configLocalStorageBoolean(this.layout.helpVisible, "help-visible",
            visible => document.body.classList.toggle("help-hidden", !visible), true)

        this.recovery.restoreSession().then(optSession => {
            if (optSession.nonEmpty()) {
                this.profileService.setValue(optSession)
            }
        }, EmptyExec)
    }

    get sampleRate(): number {return this.audioContext.sampleRate}

    get midi(): Option<MidiDeviceAccess> {return this.#midi}

    panicEngine(): void {this.runIfProject(({engine}) => engine.panic())}

    async closeProject() {
        RouteLocation.get().navigateTo("/")
        if (!this.hasProfile) {
            this.switchScreen("dashboard")
            return
        }
        if (this.project.editing.isEmpty()) {
            this.profileService.setValue(Option.None)
        } else {
            try {
                await Dialogs.approve({headline: "Closing Project?", message: "You will lose all progress!"})
            } catch (error) {
                if (!Errors.isAbort(error)) {panic(String(error))}
                return
            }
            this.profileService.setValue(Option.None)
        }
    }

    cleanSlate(): void {
        this.profileService.setValue(Option.wrap(
            new ProjectProfile(UUID.generate(), Project.new(this), ProjectMeta.init("Untitled"), Option.None)))
        // Reset song creation state
        this.layout.songCreationProgress.setValue(0)
        this.layout.isSongCreating.setValue(false)
        // Show prompter for new projects
        this.layout.showPrompter.setValue(true)
    }

    /**
     * Execute tools using secret address (ultra-secret)
     */
    async executeRemoteToolWithSecretAddress(secretAddress: string): Promise<{ success: boolean; message: string; resultSecretAddress?: string; sections?: any[]; projectName?: string }> {
        if (!this.hasProfile) {
            throw new Error('No project is currently open')
        }
        
        try {
            console.log(`🔐 Executing tools from secure payload`)
            
            // Track progress during tool execution (will be updated by interval)
            
            // Extract project data (from PREVIEW if in preview mode, otherwise active project)
            const isPreviewMode = this.preview.isActive.getValue() && this.preview.project.getValue()
            if (isPreviewMode) {
                console.log('📌 [TOOL-EXECUTOR] PREVIEW MODE ACTIVE - extracting from preview project')
            } else {
                console.log('📌 [TOOL-EXECUTOR] Normal mode - extracting from active project')
            }
            
            const projectData = isPreviewMode
                ? this.extractProjectDataFrom(this.preview.project.getValue()!, this.preview.profile.getValue()!)
                : this.extractProjectData()
            
            // Extract project data (from PREVIEW if in preview mode, otherwise active project)
            
            // Send secret address to tool-executor (no tool names/args visible)
            // Progress is now tracked by startProgressInterval() called at the beginning of song creation
            
            const toolExecutorPayload = {
                secretAddress: secretAddress,  // Only secret address, no tool data
                projectData: projectData,
                userId: this.authService?.getCurrentUser()?.id,
                projectId: this.projectService?.currentProject?.getValue()?.id
            };
            
            console.log('🔐 [DEBUG] Sending to tool-executor:', JSON.stringify({
                ...toolExecutorPayload,
                projectData: `[${toolExecutorPayload.projectData?.tracks?.length || 0} tracks]` // Don't log full project data
            }, null, 2));
            
            const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/router`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY
                },
                body: JSON.stringify({
                    route: 'tool-executor',
                    ...toolExecutorPayload
                })
            })
            
            if (!response.ok) {
                const errorText = await response.text()
                throw new Error(`Server error: ${response.status} ${errorText}`)
            }
            
            const result = await response.json()
            
            // DEBUG: Check what we receive back from tool-executor
            if (result.modifiedProjectData?.tracks) {
                console.log(`🎹 [DEBUG-RECEIVE] Received project with ${result.modifiedProjectData.tracks.length} tracks`)
                result.modifiedProjectData.tracks.forEach((track: any, index: number) => {
                    const noteRegions = track.noteRegions || []
                    const totalNotes = noteRegions.reduce((sum: number, region: any) => sum + (region.notes?.length || 0), 0)
                    console.log(`🎹 [DEBUG-RECEIVE] Track ${index} "${track.name}": ${noteRegions.length} regions, ${totalNotes} notes`)
                })
            }
            
            if (result.success && result.modifiedProjectData) {
                // Apply the changes returned from server
                console.log('🔍 [DRUMFIX-BEFORE] Project state BEFORE applyProjectChanges:')
                console.log('🔍 [DRUMFIX-BEFORE] Current tracks:', this.extractProjectData().tracks?.length || 0)
                if (this.extractProjectData().tracks) {
                    this.extractProjectData().tracks.forEach((t: any, i: number) => {
                        console.log(`🔍 [DRUMFIX-BEFORE] Track ${i}: ${t.name} (${t.type})`)
                    })
                }
                
                await this.applyProjectChanges(result.modifiedProjectData)
                console.log('✅ Secret tool execution completed and applied')
                
                console.log('🔍 [DRUMFIX-AFTER] Project state AFTER applyProjectChanges:')
                console.log('🔍 [DRUMFIX-AFTER] Current tracks:', this.extractProjectData().tracks?.length || 0)
                if (this.extractProjectData().tracks) {
                    this.extractProjectData().tracks.forEach((t: any, i: number) => {
                        console.log(`🔍 [DRUMFIX-AFTER] Track ${i}: ${t.name} (${t.type})`)
                    })
                }
            }
            
            // Store sections if provided (for preview mode)
            if (result.sections && result.sections.length > 0) {
                console.log('📊 [SECTIONS] Received', result.sections.length, 'sections from tool-executor')
                this.preview.sections.setValue(result.sections)
            }
            
            return {
                success: result.success,
                message: result.message,
                resultSecretAddress: result.resultSecretAddress,
                sections: result.sections,
                projectName: result.projectName
            }
            
        } catch (error) {
            console.error('❌ Secret tool execution failed:', error)
            return {
                success: false,
                message: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
            }
        }
    }

    /**
     * Execute a tool remotely on the server and apply the changes
     */
    async executeRemoteTool(toolId: string, params: any): Promise<{ success: boolean; message: string }> {
        if (!this.hasProfile) {
            throw new Error('No project is currently open')
        }
        
        try {
            console.log(`🛠️ Executing remote tool: ${toolId}`, params)
            
            // 1. Extract current project data (no audio files, just structure)
            const projectData = this.extractProjectData()
            
            // 🔍 DEBUG: Show what we're sending to tool executor
            console.log(`🔍 [TOOL-EXECUTE] Sending project data for ${toolId}:`)
            if (projectData.tracks) {
                projectData.tracks.forEach((track: any, index: number) => {
                    console.log(`🔍 [TOOL-EXECUTE] Track ${index} "${track.name}" (${track.type}):`)
                    if (track.type === 'SamplerDeviceBox' || track.type === 'NanoDeviceBox') {
                        console.log(`  - Has instrumentUUID: ${track.parameters.instrumentUUID ? 'YES' : 'NO'}`)
                        console.log(`  - Has instrumentName: ${track.parameters.instrumentName ? 'YES' : 'NO'}`)
                        if (track.parameters.instrumentUUID) {
                            console.log(`  - InstrumentUUID: ${track.parameters.instrumentUUID}`)
                            console.log(`  - InstrumentName: ${track.parameters.instrumentName}`)
                        }
                    }
                })
            }
            
            // 2. Send to router for processing
            const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/router`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY
                },
                body: JSON.stringify({
                    route: 'tool-executor',
                    toolId: toolId,
                    params: params,
                    projectData: projectData,
                    userId: this.authService?.getCurrentUser()?.id,
                    projectId: this.projectService?.currentProject?.getValue()?.id
                })
            })
            
            if (!response.ok) {
                const errorText = await response.text()
                throw new Error(`Server error: ${response.status} ${errorText}`)
            }
            
            const result = await response.json()
            
            if (result.success && result.modifiedProjectData) {
                // 3. Apply the changes returned from server
                await this.applyProjectChanges(result.modifiedProjectData)
                console.log('✅ Remote tool executed and applied successfully')
            }
            
            return {
                success: result.success,
                message: result.message
            }
            
        } catch (error) {
            console.error('❌ Remote tool execution failed:', error)
            return {
                success: false,
                message: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
            }
        }
    }
    
    /**
     * Translate openDAW-specific types to generic types for tool-executor
     */
    private translateToGenericType(openDAWType: string): string {
        switch (openDAWType) {
            case 'NanoDeviceBox':
                return 'SamplerDeviceBox'
            case 'PlayfieldDeviceBox':
                return 'DrumSetDeviceBox'
            case 'VaporisateurDeviceBox':
                return 'SynthesizerDeviceBox'
            case 'RevampDeviceBox':
                return 'EQDeviceBox'
            case 'TapeDeviceBox':
                return 'AudioPlayerDeviceBox'
            default:
                return openDAWType // Keep other types as-is
        }
    }

    /**
     * Extract project data structure (no audio files, just parameters and MIDI)
     */
    private extractProjectData(): any {
        const project = this.project
        const profile = this.profileService.getValue().unwrap()
        
        return {
            meta: profile.meta,
            bpm: project.bpm, // Include project BPM
            tracks: this.extractTracksData(project),
            timeline: this.extractTimelineData(project),
            effects: this.extractEffectsData(project)
        }
    }

    /**
     * Extract project data from a specific project (for preview mode)
     */
    private extractProjectDataFrom(project: any, profile: any): any {
        return {
            meta: profile.meta,
            bpm: project.bpm,
            tracks: this.extractTracksData(project),
            timeline: this.extractTimelineData(project),
            effects: this.extractEffectsData(project)
        }
    }
    
    /**
     * Extract track data (instruments and their parameters)
     */
    private extractTracksData(project: Project): any[] {
        const tracks: any[] = []
        
        try {
            const audioUnits = project.rootBox.audioUnits.pointerHub.incoming()
            
            for (const audioUnitPointer of audioUnits) {
                const audioUnit = audioUnitPointer.box as any
                
                const inputPointer = audioUnit.input?.pointerHub?.incoming()?.at(0)
                
                if (inputPointer) {
                    const instrumentBox = inputPointer.box as any
                    
                    const instrumentType = instrumentBox._originalType || this.translateToGenericType(instrumentBox.constructor.name)
                    
                    // Extract instrument parameters
                    const instrumentParams = this.extractBoxParameters(instrumentBox)
                    
                    // Extract track-level parameters (volume, panning from audioUnit)
                    if (audioUnit.volume?.getValue) {
                        instrumentParams.volume = audioUnit.volume.getValue()
                    }
                    if (audioUnit.panning?.getValue) {
                        instrumentParams.panning = audioUnit.panning.getValue()
                    }
                    if (audioUnit.mute?.getValue) {
                        instrumentParams.mute = audioUnit.mute.getValue()
                    }
                    
                    const trackData = {
                        uuid: audioUnit.address.uuid,
                        name: instrumentBox.label?.getValue?.() || 'Unnamed',
                        type: instrumentType,
                        parameters: instrumentParams,
                        noteRegions: this.extractNoteRegions(audioUnit),
                        audioRegions: this.extractAudioRegions(audioUnit),
                        effects: this.extractTrackEffects(audioUnit),
                        drumSetSamples: this.extractDrumSetSamples(instrumentBox) // Add DrumSet sample data
                    }
                    
                    tracks.push(trackData)
                }
            }
            
        } catch (error) {
            console.warn('Warning: Could not extract tracks data:', error)
        }
        
        return tracks
    }
    
    /**
     * Extract parameters from any box (instrument or effect)
     */
    private extractBoxParameters(box: any): any {
        const parameters: any = {}
        
        try {
            // Extract common parameters that most instruments have
            if (box.label?.getValue) parameters.label = box.label.getValue()
            if (box.flutter?.getValue) parameters.flutter = box.flutter.getValue()
            if (box.wow?.getValue) parameters.wow = box.wow.getValue()
            if (box.noise?.getValue) parameters.noise = box.noise.getValue()
            if (box.saturation?.getValue) parameters.saturation = box.saturation.getValue()
            if (box.tune?.getValue) parameters.tune = box.tune.getValue()
            if (box.cutoff?.getValue) parameters.cutoff = box.cutoff.getValue()
            if (box.resonance?.getValue) parameters.resonance = box.resonance.getValue()
            if (box.attack?.getValue) parameters.attack = box.attack.getValue()
            if (box.release?.getValue) parameters.release = box.release.getValue()
            if (box.waveform?.getValue) parameters.waveform = box.waveform.getValue()
            
            console.log(`🔍 [EXTRACT-DEBUG] Processing ${box.constructor.name}: ${box.label?.getValue?.() || 'Unnamed'}`)
            
            const boxType = (box as any)._originalType || box.constructor.name;
            if (boxType === 'SamplerDeviceBox' || boxType === 'NanoDeviceBox') {
                console.log(`🔍 [EXTRACT-DEBUG] Found Sampler device - checking for file pointer...`)
                console.log(`🔍 [EXTRACT-DEBUG] Box object keys:`, Object.keys(box))
                console.log(`🔍 [EXTRACT-DEBUG] Box prototype:`, Object.getPrototypeOf(box)?.constructor?.name)
                
                try {
                    // Use the SAME method as NanoDeviceEditor - catchupAndSubscribe to get current pointer
                    console.log(`🔍 [EXTRACT-DEBUG] Using catchupAndSubscribe like NanoDeviceEditor...`)
                    
                    // Get current pointer using catchupAndSubscribe (synchronous catchup)
                    let currentAudioFileBox: any = null
                    
                    // Create a temporary subscription to get the current state
                    const subscription = box.file.catchupAndSubscribe((pointer: any) => {
                        console.log(`🔍 [EXTRACT-DEBUG] Caught up with pointer:`, pointer ? 'found' : 'empty')
                        
                        pointer.targetVertex.match({
                            none: () => {
                                console.log(`🔍 [EXTRACT-DEBUG] No target vertex (empty pointer)`)
                            },
                            some: ({box: audioFileBox}: {box: any}) => {
                                currentAudioFileBox = audioFileBox
                                console.log(`🔍 [EXTRACT-DEBUG] Found AudioFileBox:`, audioFileBox?.constructor?.name)
                            }
                        })
                    })
                    
                    // Immediately terminate the subscription since we just needed the current state
                    subscription.terminate()
                    
                    if (currentAudioFileBox) {
                        const sampleUUID = currentAudioFileBox.address?.uuid
                        const sampleName = currentAudioFileBox.fileName?.getValue?.()
                        
                        // Convert UUID to proper string format using UUID.toString() from the lib
                        let sampleUUIDString = null
                        if (sampleUUID) {
                            try {
                                sampleUUIDString = UUID.toString(sampleUUID)
                            } catch (uuidError) {
                                console.error('❌ [EXTRACT-ERROR] Failed to convert UUID:', uuidError)
                            }
                        }
                        
                        console.log(`🔍 [EXTRACT-DEBUG] Raw UUID: ${sampleUUID}, String UUID: ${sampleUUIDString}, Name: ${sampleName}`)
                        
                        if (sampleUUIDString && sampleName) {
                            parameters.instrumentUUID = sampleUUIDString
                            parameters.instrumentName = sampleName
                            console.log(`🎹 [EXTRACT-SUCCESS] Found Nano instrument via catchupAndSubscribe: ${sampleName} (${sampleUUIDString})`)
                        } else {
                            console.log(`❌ [EXTRACT-DEBUG] Missing UUID or name - UUID: ${sampleUUIDString}, Name: ${sampleName}`)
                        }
                    } else {
                        console.log(`❌ [EXTRACT-DEBUG] No AudioFileBox found via catchupAndSubscribe`)
                        console.log(`🔍 [EXTRACT-DEBUG] This means the Nano track has no sample assigned yet`)
                    }
                    
                } catch (error) {
                    console.error('❌ [EXTRACT-ERROR] Failed to extract Nano sample information via catchupAndSubscribe:', error)
                    console.error('❌ [EXTRACT-ERROR] Box object:', box)
                    console.error('❌ [EXTRACT-ERROR] Error stack:', error instanceof Error ? error.stack : 'No stack available')
                }
            } else {
                console.log(`🔍 [EXTRACT-DEBUG] Skipping non-Nano device: ${box.constructor.name}`)
            }
            
        } catch (error) {
            console.warn('Warning: Could not extract some parameters:', error)
        }
        
        return parameters
    }
    
    /**
     * Extract MIDI note data from track (improved to catch all notes)
     */
    private extractNoteRegions(audioUnit: any): any[] {
        const noteRegions: any[] = []
        
        try {
            // Get tracks from audio unit
            const tracksPointer = audioUnit.tracks?.pointerHub?.incoming()
            if (!tracksPointer || tracksPointer.length === 0) {
                console.log('🔍 No tracks found for note extraction')
                return noteRegions
            }
            
            console.log(`🔍 Extracting notes from ${tracksPointer.length} tracks`)
            
            for (const trackPointer of tracksPointer) {
                const track = trackPointer.box
                console.log(`🔍 Processing track: ${track.constructor.name}`)
                
                const regionsPointer = track.regions?.pointerHub?.incoming()
                
                if (regionsPointer && regionsPointer.length > 0) {
                    console.log(`🔍 Found ${regionsPointer.length} regions in track`)
                    
                    for (const regionPointer of regionsPointer) {
                        const region = regionPointer.box
                        console.log(`🔍 Processing region: ${region.constructor.name}`)
                        
                        const regionType = (region as any)._originalType || region.constructor.name;
                        if (regionType === 'NoteRegionBox') {
                            const notes: any[] = []
                            
                            // Try multiple methods to extract notes
                            try {
                                console.log(`🔍 [NOTE-EXTRACT] Attempting to extract notes from region at ${region.position?.getValue()}`)
                                
                                // Method 1: Try via targetVertex (most reliable for box graph)
                                const targetVertex = region.events?.targetVertex
                                console.log(`🔍 [NOTE-EXTRACT] targetVertex:`, targetVertex)
                                
                                if (targetVertex && targetVertex.nonEmpty && targetVertex.nonEmpty()) {
                                    const collectionBox = targetVertex.unwrap().box
                                    console.log(`🔍 [NOTE-EXTRACT] Found collection via targetVertex:`, collectionBox.constructor.name)
                                    
                                    // Try to get notes from the collection
                                    const noteTargetVertex = collectionBox.events?.targetVertex
                                    if (noteTargetVertex && noteTargetVertex.nonEmpty && noteTargetVertex.nonEmpty()) {
                                        // Collection points to a linked list or array of notes
                                        console.log(`🔍 [NOTE-EXTRACT] Collection has events targetVertex`)
                                    }
                                    
                                    // Try pointer hub
                                    const notePointers = collectionBox.events?.pointerHub?.incoming() || []
                                    console.log(`🔍 [NOTE-EXTRACT] Found ${notePointers.length} note pointers via hub`)
                                    
                                    for (const notePointer of notePointers) {
                                        const noteBox = notePointer.box
                                        notes.push({
                                            position: noteBox.position?.getValue() || 0,
                                            duration: noteBox.duration?.getValue() || 480,
                                            pitch: noteBox.pitch?.getValue() || 60,
                                            velocity: noteBox.velocity?.getValue() || 0.8
                                        })
                                    }
                                    
                                    console.log(`✅ [NOTE-EXTRACT] Extracted ${notes.length} notes via targetVertex`)
                                } else {
                                    console.log('⚠️ [NOTE-EXTRACT] No targetVertex, trying pointer hub')
                                    
                                    // Method 2: Direct access via events pointer
                                    const eventsPointer = region.events?.pointerHub?.incoming()
                                    console.log(`🔍 [NOTE-EXTRACT] eventsPointer:`, eventsPointer)
                                    
                                    if (eventsPointer && eventsPointer.length > 0) {
                                        const collectionBox = eventsPointer[0].box
                                        const notePointers = collectionBox.events?.pointerHub?.incoming() || []
                                        
                                        console.log(`🔍 [NOTE-EXTRACT] Found ${notePointers.length} notes via pointer hub`)
                                        
                                        for (const notePointer of notePointers) {
                                            const noteBox = notePointer.box
                                            notes.push({
                                                position: noteBox.position?.getValue() || 0,
                                                duration: noteBox.duration?.getValue() || 480,
                                                pitch: noteBox.pitch?.getValue() || 60,
                                                velocity: noteBox.velocity?.getValue() || 0.8
                                            })
                                        }
                                    }
                                }
                                
                                console.log(`📝 [NOTE-EXTRACT] Final: ${notes.length} notes extracted from region`)
                            } catch (extractError) {
                                console.error('❌ [NOTE-EXTRACT] Error:', extractError)
                            }
                            
                            const regionData = {
                                position: region.position?.getValue() || 0,
                                duration: region.duration?.getValue() || 3840, // Default bar in openDAW PPQN
                                loopDuration: region.loopDuration?.getValue() || 3840,
                                notes: notes
                            }
                            
                            noteRegions.push(regionData)
                            console.log(`✅ Extracted region with ${notes.length} notes at position ${regionData.position}`)
                        }
                    }
                }
            }
            
            console.log(`🔍 Total extracted: ${noteRegions.length} regions with ${noteRegions.reduce((sum, r) => sum + r.notes.length, 0)} total notes`)
            
        } catch (error) {
            console.warn('Warning: Could not extract note regions:', error)
        }
        
        return noteRegions
    }
    
    
    private extractAudioRegions(audioUnit: any): any[] {
        const audioRegions: any[] = []
        
        try {
            const tracksPointer = audioUnit.tracks?.pointerHub?.incoming()
            if (!tracksPointer || tracksPointer.length === 0) {
                return audioRegions
            }
            
            for (const trackPointer of tracksPointer) {
                const track = trackPointer.box
                const regionsPointer = track.regions?.pointerHub?.incoming()
                
                if (regionsPointer && regionsPointer.length > 0) {
                    for (const regionPointer of regionsPointer) {
                        const region = regionPointer.box
                        const regionType = (region as any)._originalType || region.constructor.name
                        
                        if (regionType === 'AudioRegionBox') {
                            const fileRef = this.extractAudioFileReference(region.file)
                            
                            const regionData = {
                                position: region.position?.getValue() || 0,
                                duration: region.duration?.getValue() || 0,
                                loopDuration: region.loopDuration?.getValue() || 0,
                                loopOffset: region.loopOffset?.getValue() || 0,
                                hue: region.hue?.getValue() || 0,
                                label: region.label?.getValue() || 'Audio Region',
                                mute: region.mute?.getValue() || false,
                                gain: region.gain?.getValue() || 1.0,
                                file: fileRef
                            }
                            audioRegions.push(regionData)
                        }
                    }
                }
            }
        } catch (error) {
            console.warn('Warning: Could not extract audio regions:', error)
        }
        
        return audioRegions
    }
    
    private extractAudioFileReference(filePointer: any): any {
        try {
            if (!filePointer?.targetVertex) {
                return null
            }
            
            const targetVertex = filePointer.targetVertex
            
            if (targetVertex.nonEmpty && targetVertex.nonEmpty()) {
                const vertex = targetVertex.unwrap()
                const fileBox = vertex.box
                
                if (fileBox?.address?.uuid) {
                    const uuid = fileBox.address.uuid
                    const uuidString = UUID.toString(uuid)
                    const fileName = fileBox.fileName?.getValue?.() || 'audio.wav'
                    
                    return {
                        uuid: uuidString,
                        fileName: fileName
                    }
                }
            }
            
            return null
        } catch (error) {
            console.warn('Warning: Could not extract audio file reference:', error)
            return null
        }
    }
    
    /**
     * Extract DrumSet drum samples data (index, name, excluded status)
     */
    private extractDrumSetSamples(instrumentBox: any): any[] {
        try {
            const boxType = (instrumentBox as any)._originalType || instrumentBox.constructor.name;
            if (boxType !== 'DrumSetDeviceBox' && boxType !== 'PlayfieldDeviceBox') {
                return []
            }
            
            console.log('🥁 Extracting DrumSet samples from:', boxType)
            
            const samples: any[] = []
            
            // Get samples from the Playfield device
            const samplesPointer = instrumentBox.samples?.pointerHub?.incoming()
            
            if (samplesPointer && samplesPointer.length > 0) {
                console.log(`🥁 Extracting ${samplesPointer.length} Playfield samples`)
                
                for (const samplePointer of samplesPointer) {
                    try {
                        const sample = samplePointer.box
                        
                        // Extract sample data
                        console.log(`🔍 [DEBUG] Sample structure keys:`, Object.keys(sample))
                        console.log(`🔍 [DEBUG] Sample.file:`, !!sample.file)
                        console.log(`🔍 [DEBUG] Sample.file.targetVertex:`, !!sample.file?.targetVertex)
                        
                        const sampleData = {
                            index: sample.index?.getValue() || 60,
                            label: sample.label?.getValue() || 'Unknown Sample',
                            excluded: sample.exclude?.getValue() || false,
                            mute: sample.mute?.getValue() || false,
                            solo: sample.solo?.getValue() || false,
                            enabled: sample.enabled?.getValue() || true,
                            gate: sample.gate?.getValue() || 0,
                            pitch: sample.pitch?.getValue() || 0.0,
                            attack: sample.attack?.getValue() || 0.001,
                            release: sample.release?.getValue() || 0.020,
                            fileUUID: this.extractSampleFileUUID(sample)
                        }
                        
                        samples.push(sampleData)
                        console.log(`✅ Extracted: UUID ${sampleData.fileUUID} (MIDI ${sampleData.index})`)
                        
                    } catch (sampleError) {
                        console.warn('Warning: Could not extract individual Playfield sample:', sampleError)
                    }
                }
                
                // Sort by MIDI index for consistent display
                samples.sort((a, b) => a.index - b.index)
                
            } else {
                console.log('🥁 [DEBUG] No samples found in Playfield device')
            }
            
            console.log(`🥁 [DEBUG] Total extracted Playfield samples: ${samples.length}`)
            return samples
            
        } catch (error) {
            console.warn('Warning: Could not extract Playfield samples:', error)
            return []
        }
    }
    
    /**
     * Extract audio file UUID from a sample box
     */
    private extractSampleFileUUID(sample: any): string | null {
        try {
            console.log(`🔍 [DEBUG] Extracting UUID from sample with keys:`, Object.keys(sample))
            
            // Try multiple approaches to access the file reference
            if (sample.file?.targetVertex) {
                const targetVertex = sample.file.targetVertex
                console.log(`🔍 [DEBUG] targetVertex exists, has keys:`, Object.keys(targetVertex))
                
                // Approach 1: Try unwrapOrNull (seen in PlayfieldSampleBoxAdapter)
                if (targetVertex.unwrapOrNull) {
                    const vertex = targetVertex.unwrapOrNull()
                    if (vertex) {
                        console.log(`🔍 [DEBUG] unwrapOrNull success, vertex keys:`, Object.keys(vertex))
                        const fileBox = vertex.box
                        if (fileBox?.address?.uuid) {
                            const uuid = fileBox.address.uuid
                            const uuidString = Array.from(uuid as number[]).map((b: number) => b.toString(16).padStart(2, '0')).join('')
                            const formattedUUID = `${uuidString.slice(0, 8)}-${uuidString.slice(8, 12)}-${uuidString.slice(12, 16)}-${uuidString.slice(16, 20)}-${uuidString.slice(20)}`
                            console.log(`✅ [DEBUG] Extracted file UUID: ${formattedUUID}`)
                            return formattedUUID
                        } else {
                            console.log(`⚠️ [DEBUG] No address.uuid in fileBox`)
                        }
                    } else {
                        console.log(`⚠️ [DEBUG] unwrapOrNull returned null`)
                    }
                }
                
                // Approach 2: Try match pattern
                if (targetVertex.match) {
                    let extractedUUID: string | null = null
                    targetVertex.match({
                        some: (vertex: any) => {
                            console.log(`🔍 [DEBUG] match.some vertex keys:`, Object.keys(vertex))
                            const fileBox = vertex.box
                            if (fileBox?.address?.uuid) {
                                const uuid = fileBox.address.uuid
                                const uuidString = Array.from(uuid as number[]).map((b: number) => b.toString(16).padStart(2, '0')).join('')
                                const formattedUUID = `${uuidString.slice(0, 8)}-${uuidString.slice(8, 12)}-${uuidString.slice(12, 16)}-${uuidString.slice(16, 20)}-${uuidString.slice(20)}`
                                console.log(`✅ [DEBUG] Extracted file UUID via match: ${formattedUUID}`)
                                extractedUUID = formattedUUID
                            }
                        },
                        none: () => {
                            console.log(`⚠️ [DEBUG] match.none - no file assigned`)
                        }
                    })
                    if (extractedUUID) return extractedUUID
                }
                
                // Approach 3: Try nonEmpty check and direct access
                if (targetVertex.nonEmpty && targetVertex.nonEmpty()) {
                    console.log(`🔍 [DEBUG] targetVertex nonEmpty, trying direct unwrap`)
                    if (targetVertex.unwrap) {
                        const vertex = targetVertex.unwrap()
                        console.log(`🔍 [DEBUG] unwrap success, vertex keys:`, Object.keys(vertex))
                        const fileBox = vertex.box
                        if (fileBox?.address?.uuid) {
                            const uuid = fileBox.address.uuid
                            const uuidString = Array.from(uuid as number[]).map((b: number) => b.toString(16).padStart(2, '0')).join('')
                            const formattedUUID = `${uuidString.slice(0, 8)}-${uuidString.slice(8, 12)}-${uuidString.slice(12, 16)}-${uuidString.slice(16, 20)}-${uuidString.slice(20)}`
                            console.log(`✅ [DEBUG] Extracted file UUID via unwrap: ${formattedUUID}`)
                            return formattedUUID
                        }
                    }
                }
            } else {
                console.log(`⚠️ [DEBUG] sample.file.targetVertex is undefined`)
            }
            
            console.log(`⚠️ [DEBUG] Could not extract UUID - returning null`)
            return null
        } catch (error) {
            console.error('❌ [DEBUG] Error extracting sample file UUID:', error)
            console.error('❌ [DEBUG] Error stack:', error instanceof Error ? error.stack : 'No stack trace available')
            return null
        }
    }
    
    /**
     * Extract effects from a track
     */
    private extractTrackEffects(audioUnit: any): any[] {
        const effects: any[] = []
        
        try {
            const audioEffectsPointer = audioUnit.audioEffects?.pointerHub?.incoming()
            if (audioEffectsPointer) {
                for (const effectPointer of audioEffectsPointer) {
                    const effect = effectPointer.box
                    const effectType = (effect as any)._originalType || this.translateToGenericType(effect.constructor.name)
                    effects.push({
                        uuid: effect.address.uuid,
                        type: effectType,
                        parameters: this.extractBoxParameters(effect)
                    })
                }
            }
        } catch (error) {
            console.warn('Warning: Could not extract effects:', error)
        }
        
        return effects
    }
    
    /**
     * Extract timeline data
     */
    private extractTimelineData(_project: Project): any {
        return {
            // Timeline structure without audio data
            duration: 0, // Simplified for now
            // Add other timeline properties as needed
        }
    }
    
    /**
     * Extract global effects data
     */
    private extractEffectsData(_project: Project): any[] {
        // Extract master bus effects, etc.
        return []
    }
    
    /**
     * Apply changes returned from server
     */
    private async applyProjectChanges(modifiedProjectData: any): Promise<void> {
        try {
            console.log('🔄 Applying project changes from server...')
            
            // If in preview mode, apply to PREVIEW project, NOT the active one!
            if (this.preview.isActive.getValue() && this.preview.profile.getValue()) {
                console.log('📌 PREVIEW MODE: Applying changes to PREVIEW project (NOT main project)')
                const currentPreviewProject = this.preview.project.getValue()
                console.log('📊 Preview project BEFORE:', currentPreviewProject?.rootBoxAdapter.audioUnits.adapters().length || 0, 'tracks')
                const previewProfile = this.preview.profile.getValue()!
                
                // Create new project with modified data
                const newProject = await this.reconstructProjectFromData(modifiedProjectData)
                console.log('📊 New project FROM SERVER:', newProject.rootBoxAdapter.audioUnits.adapters().length, 'tracks')
                
                // Re-initialize audio engine for new preview project
                console.log('🔊 Re-initializing preview audio engine...')
                newProject.startAudioWorklet(this.audioWorklets, {
                    unload: async (event: unknown) => {
                        console.error('Preview engine error:', event)
                    },
                    load: () => {
                        console.log('✅ Preview engine reloaded')
                    }
                })
                
                // Update PREVIEW profile (not active profile!)
                const newPreviewProfile = new ProjectProfile(
                    previewProfile.uuid,
                    newProject,
                    modifiedProjectData.meta || previewProfile.meta,
                    previewProfile.cover
                )
                
                this.preview.project.setValue(newProject)
                this.preview.profile.setValue(newPreviewProfile)
                console.log('✅ Preview project changes applied successfully (main project untouched!)')
                console.log('📊 Preview project NOW has:', newProject.rootBoxAdapter.audioUnits.adapters().length, 'tracks')
                
            } else {
                // Normal mode: apply to active project
                console.log('📌 NORMAL MODE: Applying changes to active project')
                const currentProfile = this.profileService.getValue().unwrap()
                
                // Create a new project with the modified data
                const newProject = await this.reconstructProjectFromData(modifiedProjectData)
                
                // Update the profile with the new project
                const newProfile = new ProjectProfile(
                    currentProfile.uuid,
                    newProject,
                    modifiedProjectData.meta || currentProfile.meta,
                    currentProfile.cover
                )
                
                this.profileService.setValue(Option.wrap(newProfile))
                console.log('✅ Project changes applied successfully')
            }
            
        } catch (error) {
            console.error('❌ Failed to apply project changes:', error)
            throw error
        }
    }
    
    
    /**
     * Reconstruct project from server-modified data
     */
    private async reconstructProjectFromData(projectData: any): Promise<Project> {
        // This is where we'll rebuild the project from the modified data
        // For now, create a new project and add the tracks/effects
        
        const newProject = Project.new(this)
        
        // Apply BPM if present in modified data
        if (projectData.bpm) {
            console.log(`🎵 [RECONSTRUCT] Applying BPM: ${projectData.bpm}`)
            newProject.editing.modify(() => {
                newProject.timelineBoxAdapter.box.bpm.setValue(projectData.bpm)
            })
            console.log(`✅ [RECONSTRUCT] BPM set to ${projectData.bpm}`)
        }
        
        // Add tracks based on server modifications
        if (projectData.tracks) {
            for (const trackData of projectData.tracks) {
                await this.addTrackFromData(newProject, trackData)
            }
        }
        
        
        if (projectData.tracks) {
            for (const trackData of projectData.tracks) {
                if (trackData.effects && trackData.effects.length > 0) {
                    await this.addEffectsToTrack(newProject, trackData)
                }
                if (trackData.audioRegions && trackData.audioRegions.length > 0) {
                    await this.addAudioRegionsToTrack(newProject, trackData)
                }
            }
        }
        
        return newProject
    }
    
    /**
     * Add a track to project from data structure
     */
    private async addTrackFromData(project: Project, trackData: any): Promise<void> {
        try {
            const {InstrumentFactories} = await import('@opendaw/studio-core')
            
            let trackBox: any = null
            
            // First transaction: Create instrument and apply parameters
            project.editing.modify(() => {
                let factory
                switch (trackData.type) {
                    case 'TapeDeviceBox':
                    case 'AudioPlayerDeviceBox':
                        factory = InstrumentFactories.Tape
                        break
                    // NEW generic names
                    case 'SynthesizerDeviceBox':
                        factory = InstrumentFactories.Vaporisateur
                        break
                    case 'SamplerDeviceBox':
                        factory = InstrumentFactories.Nano
                        break
                    case 'DrumSetDeviceBox':
                        factory = InstrumentFactories.Playfield
                        break
                    // OLD names (backward compatibility)
                    case 'VaporisateurDeviceBox':
                        factory = InstrumentFactories.Vaporisateur
                        break
                    case 'NanoDeviceBox':
                        factory = InstrumentFactories.Nano
                        break
                    case 'PlayfieldDeviceBox':
                        factory = InstrumentFactories.Playfield
                        break
                    // Skip non-instrument types
                    case 'AudioBusBox':
                        return
                    default:
                        console.warn(`Unknown instrument type: ${trackData.type}`)
                        return
                }
                
                const result = project.api.createInstrument(factory, { name: trackData.name })
                const instrumentBox = result.instrumentBox
                trackBox = result.trackBox;
                (instrumentBox as any)._originalType = trackData.type
                
                // Apply parameters (using any type to avoid TypeScript issues)
                if (trackData.parameters) {
                    try {
                        const anyInstrumentBox = instrumentBox as any
                        
                        // Apply parameters based on instrument type
                        if (trackData.type === 'TapeDeviceBox' || trackData.type === 'AudioPlayerDeviceBox') {
                            if (trackData.parameters.flutter !== undefined && anyInstrumentBox.flutter?.setValue) {
                                anyInstrumentBox.flutter.setValue(trackData.parameters.flutter)
                            }
                            if (trackData.parameters.wow !== undefined && anyInstrumentBox.wow?.setValue) {
                                anyInstrumentBox.wow.setValue(trackData.parameters.wow)
                            }
                            if (trackData.parameters.noise !== undefined && anyInstrumentBox.noise?.setValue) {
                                anyInstrumentBox.noise.setValue(trackData.parameters.noise)
                            }
                            if (trackData.parameters.saturation !== undefined && anyInstrumentBox.saturation?.setValue) {
                                anyInstrumentBox.saturation.setValue(trackData.parameters.saturation)
                            }
                        } else if (trackData.type === 'SynthesizerDeviceBox' || trackData.type === 'VaporisateurDeviceBox') {
                            if (trackData.parameters.tune !== undefined && anyInstrumentBox.tune?.setValue) {
                                anyInstrumentBox.tune.setValue(trackData.parameters.tune)
                            }
                            if (trackData.parameters.cutoff !== undefined && anyInstrumentBox.cutoff?.setValue) {
                                anyInstrumentBox.cutoff.setValue(trackData.parameters.cutoff)
                            }
                            if (trackData.parameters.resonance !== undefined && anyInstrumentBox.resonance?.setValue) {
                                anyInstrumentBox.resonance.setValue(trackData.parameters.resonance)
                            }
                            if (trackData.parameters.attack !== undefined && anyInstrumentBox.attack?.setValue) {
                                anyInstrumentBox.attack.setValue(trackData.parameters.attack)
                            }
                            if (trackData.parameters.release !== undefined && anyInstrumentBox.release?.setValue) {
                                anyInstrumentBox.release.setValue(trackData.parameters.release)
                            }
                            if (trackData.parameters.waveform !== undefined && anyInstrumentBox.waveform?.setValue) {
                                anyInstrumentBox.waveform.setValue(trackData.parameters.waveform)
                            }
                        } else if (trackData.type === 'SamplerDeviceBox' || trackData.type === 'NanoDeviceBox') {
                            // ✨ NEW: Handle instrument sample assignment for Sampler tracks
                            if (trackData.parameters.instrumentUUID && trackData.parameters.instrumentName) {
                                // Store parameters for later processing (outside editing.modify)
                                (trackData as any)._pendingInstrumentSetup = {
                                    instrumentBox: anyInstrumentBox,
                                    instrumentUUID: trackData.parameters.instrumentUUID,
                                    instrumentName: trackData.parameters.instrumentName,
                                    trackName: trackData.name
                                }
                            }
                        }
                        
                        // Apply mute parameter for all track types
                        if (trackData.parameters.mute !== undefined && anyInstrumentBox.mute?.setValue) {
                            anyInstrumentBox.mute.setValue(trackData.parameters.mute)
                            console.log(`🔇 Applied mute: ${trackData.parameters.mute} to ${trackData.name}`)
                        }
                        
                    } catch (e) {
                        console.warn(`Could not apply parameters to ${trackData.type}:`, e)
                    }
                }
            })
            
            // Handle pending Nano instrument setup (outside editing.modify transaction)
            if ((trackData as any)._pendingInstrumentSetup) {
                await this.setupNanoInstrument(project, (trackData as any)._pendingInstrumentSetup)
            }
            
            // Second transaction: Add MIDI notes (outside the first transaction)
            if (trackBox && trackData.noteRegions && trackData.noteRegions.length > 0) {
                await this.addMidiNotesToTrack(project, trackBox, trackData.noteRegions)
            }
            
            // Third transaction: Apply track-level parameters (volume, panning) to AudioUnitBox
            if (trackData.parameters && (trackData.parameters.volume !== undefined || trackData.parameters.panning !== undefined)) {
                // Find the AudioUnitBox by track name (much simpler than UUID comparison!)
                const audioUnits = project.rootBox.audioUnits.pointerHub.incoming()
                const audioUnitPointer = audioUnits.find(p => {
                    const inputPointer = (p.box as any).input?.pointerHub?.incoming()?.at(0)
                    if (!inputPointer) return false
                    const instrumentBox = inputPointer.box as any
                    const trackName = instrumentBox.label?.getValue?.() || ''
                    return trackName === trackData.name
                })
                
                if (audioUnitPointer) {
                    const audioUnitBox = audioUnitPointer.box as any
                    console.log(`🔍 [TRACK-PARAMS] Found AudioUnitBox for "${trackData.name}"`)
                    console.log(`🔍 [TRACK-PARAMS] audioUnitBox.volume exists: ${!!audioUnitBox.volume}`)
                    console.log(`🔍 [TRACK-PARAMS] audioUnitBox.panning exists: ${!!audioUnitBox.panning}`)
                    
                    project.editing.modify(() => {
                        // Apply volume parameter if present
                        if (trackData.parameters.volume !== undefined && audioUnitBox.volume?.setValue) {
                            console.log(`🔊 [TRACK-PARAMS] Setting volume to ${trackData.parameters.volume}dB`)
                            audioUnitBox.volume.setValue(trackData.parameters.volume)
                            console.log(`🔊 [TRACK-PARAMS] Volume set successfully, new value: ${audioUnitBox.volume.getValue()}`)
                        }
                        
                        // Apply panning parameter if present
                        if (trackData.parameters.panning !== undefined && audioUnitBox.panning?.setValue) {
                            console.log(`↔️ [TRACK-PARAMS] Setting panning to ${trackData.parameters.panning}`)
                            audioUnitBox.panning.setValue(trackData.parameters.panning)
                            console.log(`↔️ [TRACK-PARAMS] Panning set successfully, new value: ${audioUnitBox.panning.getValue()}`)
                        }
                    })
                } else {
                    console.warn(`⚠️ [TRACK-PARAMS] Could not find AudioUnitBox for track: ${trackData.name}`)
                }
            }
            
        } catch (error) {
            console.error('❌ Failed to add track from data:', error)
        }
    }
    
    /**
     * Setup Nano instrument sample using the same strategy as manual device editor
     */
    private async setupNanoInstrument(project: Project, setupInfo: any): Promise<void> {
        try {
            console.log(`🎹 [STUDIO] Setting up instrument: ${setupInfo.instrumentName} (${setupInfo.instrumentUUID})`)
            
            // Import the strategy that NanoDeviceEditor uses
            const {SampleSelectStrategy} = await import('@/ui/devices/SampleSelector')
            const {AudioFileBox} = await import('@opendaw/studio-boxes')
            const {UUID} = await import('@opendaw/lib-std')
            
            // Use the SAME approach as NanoDeviceEditor - create sample object and use strategy
            const sample = {
                uuid: setupInfo.instrumentUUID,
                name: setupInfo.instrumentName,
                bpm: 120,
                duration: 3.0,
                sample_rate: 44100
            }
            
            // Import Option before the transaction
            const {Option} = await import('@opendaw/lib-std')
            
            // Use the strategy to properly handle the sample assignment
            project.editing.modify(() => {
                const strategy = SampleSelectStrategy.forPointerField(setupInfo.instrumentBox.file)
                const sampleUUID = UUID.parse(sample.uuid)
                
                const audioFileBox = project.boxGraph.findBox(sampleUUID)
                    .unwrapOrElse(() => AudioFileBox.create(project.boxGraph, sampleUUID, box => {
                        box.fileName.setValue(sample.name)
                    }))
                
                // Use the strategy to replace - same as newSample() does
                strategy.replace(Option.wrap(audioFileBox as any))
                
                console.log(`✅ [STUDIO] Nano track "${setupInfo.trackName}" now uses ${setupInfo.instrumentName} via strategy`)
            })
            
        } catch (error) {
            console.warn(`⚠️ [STUDIO] Could not set Nano instrument sample:`, error)
            // Continue without crashing - will use default sample
        }
    }
    
    /**
     * Add MIDI notes to track (separate transaction to avoid conflicts)
     */
    private async addMidiNotesToTrack(project: Project, trackBox: any, noteRegions: any[]): Promise<void> {
        try {
            const {NoteEventBox, NoteEventCollectionBox, NoteRegionBox} = await import('@opendaw/studio-boxes')
            const {ColorCodes} = await import('@opendaw/studio-core')
            
            console.log(`📝 Adding ${noteRegions.length} note regions to track`)
            
            // Separate transaction for MIDI notes (to avoid nested transaction conflicts)
            project.editing.modify(() => {
                for (const regionData of noteRegions) {
                    
                    const collection = NoteEventCollectionBox.create(project.boxGraph, UUID.generate());
                    (collection as any)._originalType = 'NoteEventCollectionBox'
                    
                    NoteRegionBox.create(project.boxGraph, UUID.generate(), box => {
                        box.position.setValue(regionData.position || 0)
                        box.duration.setValue(regionData.duration || 1920)
                        box.label.setValue("Generated Melody")
                        box.hue.setValue(ColorCodes.forTrackType(0))
                        box.mute.setValue(false)
                        box.loopDuration.setValue(regionData.duration || 1920)
                        box.events.refer(collection.owners)
                        box.regions.refer(trackBox.regions);
                        (box as any)._originalType = 'NoteRegionBox'
                    })
                    
                    for (const noteData of regionData.notes || []) {
                        NoteEventBox.create(project.boxGraph, UUID.generate(), box => {
                            box.position.setValue(noteData.position || 0)
                            box.duration.setValue(noteData.duration || 480)
                            box.pitch.setValue(noteData.pitch || 60)
                            box.velocity.setValue(noteData.velocity || 0.8)
                            box.events.refer(collection.events);
                            (box as any)._originalType = 'NoteEventBox'
                        })
                    }
                }
            })
            
        } catch (error) {
            console.error('❌ Failed to add MIDI notes to track:', error)
        }
    }
    
    /**
     * Add effects to an existing track
     */
    private async addEffectsToTrack(project: Project, trackData: any): Promise<void> {
        try {
            const {EffectFactories} = await import('@opendaw/studio-core')
            
            // Find the track by name in the project
            const targetTrack = this.findTrackByNameInProject(project, trackData.name)
            if (!targetTrack) {
                console.warn(`❌ Could not find track "${trackData.name}" to add effects`)
                return
            }
            
            // Add each effect to the track
            for (const effectData of trackData.effects) {
                project.editing.modify(() => {
                    let factory
                    switch (effectData.type) {
                        case 'StereoToolDeviceBox':
                            factory = EffectFactories.AudioNamed.StereoTool
                            break
                        case 'DelayDeviceBox':
                            factory = EffectFactories.AudioNamed.Delay
                            break
                        case 'ReverbDeviceBox':
                            factory = EffectFactories.AudioNamed.Reverb
                            break
                        case 'EQDeviceBox':
                            factory = EffectFactories.AudioNamed.Revamp
                            break
                        case 'RevampDeviceBox':
                            factory = EffectFactories.AudioNamed.Revamp
                            break
                        case 'ModularDeviceBox':
                            factory = EffectFactories.AudioNamed.Modular
                            break
                        default:
                            console.warn(`Unknown effect type: ${effectData.type}`)
                            return
                    }
                    
                    const effectBox = project.api.insertEffect(targetTrack.audioEffects, factory)
                    
                    if (effectBox) {
                        (effectBox as any)._originalType = effectData.type
                    }
                    
                    if (effectData.parameters && effectBox) {
                        const anyEffectBox = effectBox as any
                        for (const [key, value] of Object.entries(effectData.parameters)) {
                            if (anyEffectBox[key]?.setValue) {
                                try {
                                    anyEffectBox[key].setValue(value)
                                } catch (e) {
                                    console.warn(`Could not set effect parameter ${key}:`, e)
                                }
                            }
                        }
                    }
                    
                    console.log(`✅ Added ${effectData.type} to track: ${trackData.name}`)
                })
            }
        } catch (error) {
            console.error('❌ Failed to add effects to track:', error)
        }
    }
    
    /**
     * Find a track by name in the project
     */
    private async addAudioRegionsToTrack(project: Project, trackData: any): Promise<void> {
        try {
            const {AudioRegionBox, AudioFileBox} = await import('@opendaw/studio-boxes')
            const {UUID} = await import('@opendaw/lib-std')
            const {ColorCodes} = await import('@opendaw/studio-core')
            
            const targetTrack = this.findTrackByNameInProject(project, trackData.name)
            if (!targetTrack) {
                console.warn(`❌ Could not find track "${trackData.name}" to add audio regions`)
                return
            }
            
            const tracksPointer = targetTrack.tracks?.pointerHub?.incoming()
            if (!tracksPointer || tracksPointer.length === 0) {
                console.warn(`❌ No tracks found in audio unit for "${trackData.name}"`)
                return
            }
            
            const trackBox = tracksPointer[0].box
            
            // Pre-calculate durations for all audio regions
            const regionDurations = new Map<string, number>()
            for (const regionData of trackData.audioRegions) {
                if (regionData.file && regionData.file.uuid) {
                    const audioFileUUID = UUID.parse(regionData.file.uuid)
                    try {
                        const audioDurationSeconds = await this.getAudioDurationFromManifest(audioFileUUID)
                        const projectBPM = this.getProjectBPM(project)
                        const properDuration = Math.round(audioDurationSeconds * projectBPM / 60.0 * 960) // PPQN formula
                        regionDurations.set(UUID.toString(audioFileUUID), properDuration)
                    } catch (error) {
                        console.warn(`⚠️ Could not calculate duration for ${UUID.toString(audioFileUUID)}, using fallback`)
                        regionDurations.set(UUID.toString(audioFileUUID), 38400) // Fallback: 20s at 120 BPM
                    }
                }
            }
            
            project.editing.modify(() => {
                for (const regionData of trackData.audioRegions) {
                    if (!regionData.file || !regionData.file.uuid) {
                        console.warn('⚠️ Audio region missing file reference, skipping')
                        continue
                    }
                    
                    const audioFileUUID = UUID.parse(regionData.file.uuid)
                    const properDuration = regionDurations.get(UUID.toString(audioFileUUID)) || 38400 // Fallback
                    
                    const audioFileBox = project.boxGraph.findBox(audioFileUUID)
                        .unwrapOrElse(() => AudioFileBox.create(project.boxGraph, audioFileUUID, box => {
                            box.fileName.setValue(regionData.file.fileName || 'audio.wav')
                        }))
                    
                    AudioRegionBox.create(project.boxGraph, UUID.generate(), box => {
                        box.position.setValue(regionData.position || 0)
                        box.duration.setValue(regionData.duration || properDuration)
                        box.loopDuration.setValue(regionData.loopDuration || regionData.duration || properDuration)
                        box.loopOffset.setValue(regionData.loopOffset || 0)
                        box.hue.setValue(regionData.hue || ColorCodes.forTrackType(0))
                        box.label.setValue(regionData.label || 'Audio Region')
                        box.mute.setValue(regionData.mute || false)
                        box.gain.setValue(regionData.gain || 1.0)
                        box.file.refer(audioFileBox)
                        box.regions.refer(trackBox.regions);
                        (box as any)._originalType = 'AudioRegionBox'
                    })
                }
                
                console.log(`✅ Added ${trackData.audioRegions.length} audio regions to track: ${trackData.name}`)
            })
        } catch (error) {
            console.error('❌ Failed to add audio regions to track:', error)
        }
    }

    /**
     * Get audio duration from manifest data
     */
    private async getAudioDurationFromManifest(audioFileUUID: UUID.Format): Promise<number> {
        try {
            // Use the SupabaseSampleAPI to get sample info
            const {SupabaseSampleAPI} = await import('@/service/SupabaseSampleAPI')
            const sampleAPI = SupabaseSampleAPI.get()
            const sample = await sampleAPI.get(audioFileUUID)
            return sample.duration || 20.0 // Fallback to 20 seconds if not found
        } catch (error) {
            console.warn(`⚠️ Could not get audio duration for ${UUID.toString(audioFileUUID)}, using default 20s:`, error)
            return 20.0 // Default fallback
        }
    }

    /**
     * Get project BPM
     */
    private getProjectBPM(project: Project): number {
        try {
            const bpm = project.bpm
            return bpm
        } catch (error) {
            console.warn(`⚠️ Could not get project BPM, using default 120: ${error}`)
            return 120 // Default BPM fallback
        }
    }
    
    private findTrackByNameInProject(project: Project, trackName: string): any {
        try {
            for (const audioUnitPointer of project.rootBox.audioUnits.pointerHub.incoming()) {
                const audioUnit = audioUnitPointer.box as any
                const inputPointer = audioUnit.input?.pointerHub?.incoming()?.at(0)
                
                if (inputPointer) {
                    const instrumentBox = inputPointer.box as any
                    const name = instrumentBox.label?.getValue?.() || 'Unnamed'
                    
                    if (name === trackName) {
                        return audioUnit
                    }
                }
            }
        } catch (error) {
            console.warn('Error finding track by name:', error)
        }
        return null
    }

    /**
     * Sync project to cloud after local save
     * This reads files from OPFS and uploads them to cloud storage
     */
    private async syncProjectToCloud(projectProfile: ProjectProfile): Promise<void> {
        if (!this.authService || !this.projectService) {
            console.log('ℹ️ Cloud services not available, skipping cloud sync')
            return
        }

        if (!this.projectService.isReady) {
            console.warn('⚠️ ProjectService not ready, skipping cloud sync')
            return
        }

        // Get current project ID (set when "New" is clicked in Dashboard)
        const currentProject = this.projectService.currentProject.getValue()
        if (!currentProject) {
            console.log('ℹ️ No current project set, creating new Supabase project...')
            // If no project is set, create one automatically
            try {
                const newProject = await this.projectService.createProject({
                    name: projectProfile.meta.name || 'Untitled',
                    description: ''
                })
                console.log('🆕 Auto-created Supabase project for save:', newProject.id)
            } catch (error) {
                console.error('❌ Failed to auto-create Supabase project:', error)
                return // Can't sync without a project
            }
        }

        const supabaseProject = this.projectService.currentProject.getValue()
        if (!supabaseProject) {
            console.warn('⚠️ Still no current project after creation attempt')
            return
        }

        try {
            console.log('🔄 StudioService: Starting sync to Supabase...')
            
            const projectUuid = projectProfile.uuid
            
            // Generate OPFS paths (projects/v1/{uuid-string}/filename)
            const uuidString = this.uuidToString(projectUuid)
            const projectFolder = `projects/v1/${uuidString}`
            
            // Read files from OPFS (browser local storage)
            const projectBuffer = await this.readFromOPFS(`${projectFolder}/project.od`)
            const metaBuffer = await this.readFromOPFS(`${projectFolder}/meta.json`)
            const coverBuffer = await this.readFromOPFSSafe(`${projectFolder}/image.bin`)

            // Create File objects for upload
            const files: any = {
                projectFile: new File([projectBuffer], 'project.od', { type: 'application/octet-stream' }),
                metaFile: new File([metaBuffer], 'meta.json', { type: 'application/json' })
            }

            if (coverBuffer) {
                files.coverFile = new File([coverBuffer], 'image.bin', { type: 'application/octet-stream' })
            }

            // Generate bundle (.odb) - ZIP containing everything 
            const bundleBuffer = await this.generateProjectBundle(projectProfile)
            files.bundleFile = new File([bundleBuffer], 'bundle.odb', { type: 'application/zip' })

            // Upload files to Supabase Storage
            const uploadedUrls = await this.projectService.uploadProjectFiles(supabaseProject.id, files)

            // Update database with file URLs
            await this.projectService.updateProjectFiles(supabaseProject.id, {
                ...uploadedUrls,
                file_size_bytes: projectBuffer.byteLength + metaBuffer.byteLength + 
                                (coverBuffer?.byteLength || 0) + bundleBuffer.byteLength
            })

            // Update project name if it changed from "Untitled"
            const projectName = projectProfile.meta.name
            if (projectName && projectName !== 'Untitled' && projectName !== supabaseProject.name) {
                await this.updateProjectName(supabaseProject.id, projectName)
            }

            console.log('✅ Project synced to cloud successfully')

        } catch (error) {
            console.error('❌ Failed to sync project to cloud:', error)
            throw error
        }
    }

    /**
     * Update project name in database
     */
    private async updateProjectName(projectId: string, name: string): Promise<void> {
        if (!this.projectService) return

        try {
            console.log(`📝 Updating project name to "${name}"...`)
            // Use the existing Supabase client from ProjectService
            await (this.projectService as any).supabase
                .from('projects')
                .update({ 
                    name: name,
                    updated_at: new Date().toISOString()
                })
                .eq('id', projectId)
                .eq('user_id', (this.projectService as any).userId)
            
            console.log(`✅ Project name updated to "${name}"`)
        } catch (error) {
            console.error('❌ Failed to update project name:', error)
            // Don't fail sync for name update errors
        }
    }

    /**
     * Read file from OPFS (browser local storage)
     */
    private async readFromOPFS(path: string): Promise<ArrayBuffer> {
        try {
            const opfsRoot = await navigator.storage.getDirectory()
            
            // Split path into directory parts and filename
            const pathParts = path.split('/')
            const filename = pathParts.pop()! // Remove and get the last part (filename)
            
            // Navigate through directory structure
            let currentDir = opfsRoot
            for (const dirName of pathParts) {
                if (dirName) { // Skip empty parts
                    currentDir = await currentDir.getDirectoryHandle(dirName)
                }
            }
            
            // Get file from the final directory
            const fileHandle = await currentDir.getFileHandle(filename)
            const file = await fileHandle.getFile()
            return await file.arrayBuffer()
        } catch (error) {
            console.error(`❌ Failed to read from OPFS: ${path}`, error)
            throw new Error(`Failed to read file: ${path}`)
        }
    }

    /**
     * Read file from OPFS safely (returns null if not found)
     */
    private async readFromOPFSSafe(path: string): Promise<ArrayBuffer | null> {
        try {
            return await this.readFromOPFS(path)
        } catch (error) {
            console.log(`ℹ️ Optional file not found: ${path}`)
            return null
        }
    }

    /**
     * Generate project bundle (.odb ZIP file)
     */
    private async generateProjectBundle(projectProfile: ProjectProfile): Promise<ArrayBuffer> {
        // For now, create a simple ZIP with basic project data
        // TODO: Implement full bundle generation when needed
        const { default: JSZip } = await import('jszip')
        const zip = new JSZip()
        
        const uuidString = this.uuidToString(projectProfile.uuid)
        const projectFolder = `projects/v1/${uuidString}`
        
        zip.file('version', '1')
        zip.file('uuid', new Uint8Array(projectProfile.uuid))
        zip.file('project.od', await this.readFromOPFS(`${projectFolder}/project.od`))
        zip.file('meta.json', JSON.stringify(projectProfile.meta, null, 2))
        
        const coverBuffer = await this.readFromOPFSSafe(`${projectFolder}/image.bin`)
        if (coverBuffer) {
            zip.file('image.bin', new Uint8Array(coverBuffer))
        }

        const blob = await zip.generateAsync({ type: 'arraybuffer' })
        return blob
    }

    /**
     * Convert UUID bytes to string format
     */
    private uuidToString(uuid: Uint8Array): string {
        // Convert bytes to hex string with dashes (standard UUID format)
        const hex = Array.from(uuid).map(b => b.toString(16).padStart(2, '0')).join('')
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
    }

    async save(): Promise<void> {
        // Step 1: Save locally to OPFS
        await this.profileService.save()
        
        // Step 2: Sync to cloud after successful local save
        const currentProfile = this.profileService.getValue()
        if (currentProfile.nonEmpty()) {
            try {
                await this.syncProjectToCloud(currentProfile.unwrap())
            } catch (error) {
                console.error('⚠️ Failed to sync project to cloud:', error)
                // Don't fail the save operation, just log the sync error
            }
        }
    }
    async saveAs(): Promise<void> {
        await this.profileService.saveAs()
        const currentProfile = this.profileService.getValue()
        if (currentProfile.nonEmpty()) {
            try {
                await this.syncProjectToCloud(currentProfile.unwrap())
            } catch (error) {
                console.error('⚠️ Failed to sync project to cloud:', error)
            }
        }
    }
    async saveAsDef(customName?: string): Promise<void> {
        await this.profileService.saveAsDef(customName)
        const currentProfile = this.profileService.getValue()
        if (currentProfile.nonEmpty()) {
            try {
                await this.syncProjectToCloud(currentProfile.unwrap())
            } catch (error) {
                console.error('⚠️ Failed to sync project to cloud:', error)
            }
        }
    }
    async browse(): Promise<void> {return this.profileService.browse()}
    async loadTemplate(name: string): Promise<unknown> {return this.profileService.loadTemplate(name)}
    async exportZip() {return this.profileService.exportBundle()}
    async importZip() {return this.profileService.importBundle()}
    async deleteProject(uuid: UUID.Format, meta: ProjectMeta): Promise<void> {
        if (this.profileService.getValue().ifSome(profile => UUID.equals(profile.uuid, uuid)) === true) {
            await this.closeProject()
        }
        const {status} = await Promises.tryCatch(Projects.deleteProject(uuid))
        if (status === "resolved") {
            this.#signals.notify({type: "delete-project", meta})
        }
    }

    async exportMixdown() {
        return this.profileService.getValue()
            .ifSome(async ({project, meta}) => {
                await this.audioContext.suspend()
                await AudioOfflineRenderer.start(project, meta, Option.None)
                this.audioContext.resume().then()
            })
    }

    async exportStems() {
        return this.profileService.getValue()
            .ifSome(async ({project, meta}) => {
                const {
                    status,
                    error,
                    value: config
                } = await Promises.tryCatch(ProjectDialogs.showExportStemsDialog(project))
                if (status === "rejected") {
                    console.log(error)
                    if (Errors.isAbort(error)) {return}
                    throw error
                }
                ExportStemsConfiguration.sanitizeExportNamesInPlace(config)
                await this.audioContext.suspend()
                await AudioOfflineRenderer.start(project, meta, Option.wrap(config))
                this.audioContext.resume().then(EmptyExec, EmptyExec)
            })
    }

    async browseForSamples(multiple: boolean = true) {
        const {error, status, value: files} = await SampleDialogs.nativeFileBrowser(multiple)
        if (status === "rejected") {
            if (Errors.isAbort(error)) {return} else {return panic(String(error)) }
        }
        const progress = new DefaultObservableValue(0.0)
        const progressDialog = Dialogs.progress(`Importing ${files.length === 1 ? "Sample" : "Samples"}...`, progress)
        const progressHandler = Progress.split(value => progress.setValue(value), files.length)
        const rejected: Array<string> = []
        for (const [index, file] of files.entries()) {
            const arrayBuffer = await file.arrayBuffer()
            const {
                status,
                error
            } = await Promises.tryCatch(this.importSample({
                name: file.name,
                arrayBuffer: arrayBuffer,
                progressHandler: progressHandler[index]
            }))
            if (status === "rejected") {rejected.push(String(error))}
        }
        progressDialog.close()
        if (rejected.length > 0) {
            await Dialogs.info({
                headline: "Sample Import Issues",
                message: `${rejected.join(", ")} could not be imported.`
            })
        }
    }

    async importSample({uuid, name, arrayBuffer, progressHandler = Progress.Empty}: {
        uuid?: UUID.Format,
        name: string,
        arrayBuffer: ArrayBuffer,
        progressHandler?: Progress.Handler
    }): Promise<Sample> {
        console.debug(`Importing '${name}' (${arrayBuffer.byteLength >> 10}kb)`)
        return AudioImporter.run(this.audioContext, {uuid, name, arrayBuffer, progressHandler})
            .then(sample => {
                this.#signals.notify({type: "import-sample", sample})
                return sample
            })
    }

    async saveFile() {return await this.profileService.saveFile()}
    async loadFile() {return this.profileService.loadFile()}

    async importDawproject() {
        const {status, value, error} =
            await Promises.tryCatch(Files.open({types: [FilePickerAcceptTypes.DawprojectFileType]}))
        if (status === "rejected") {
            if (Errors.isAbort(error)) {return}
            return panic(String(error))
        }
        const file = value.at(0)
        if (!isDefined(file)) {return}
        const arrayBuffer = await file.arrayBuffer()
        const {project: projectSchema, resources} = await DawProject.decode(arrayBuffer)
        const importResult = await Promises.tryCatch(DawProjectImport.read(projectSchema, resources))
        if (importResult.status === "rejected") {
            return Dialogs.info({headline: "Import Error", message: String(importResult.error)})
        }
        const {skeleton, audioIds} = importResult.value
        await Promise.all(audioIds
            .map(uuid => resources.fromUUID(uuid))
            .map(resource => this.importSample({
                uuid: resource.uuid,
                name: resource.name,
                arrayBuffer: resource.buffer
            })))
        this.profileService.fromProject(Project.skeleton(this, skeleton), "Dawproject")
    }

    async exportDawproject() {
        if (!this.hasProfile) {return}
        const {project, meta} = this.profile
        const {status, error, value: zip} = await Promises.tryCatch(DawProject.encode(project, Xml.element({
            title: meta.name,
            year: new Date().getFullYear().toString(),
            website: import.meta.env.VITE_APP_WEBSITE || "https://example.com"
        }, MetaDataSchema)))
        if (status === "rejected") {
            return Dialogs.info({headline: "Export Error", message: String(error)})
        } else {
            const {status, error} = await Promises.tryCatch(Files.save(zip,
                {types: [FilePickerAcceptTypes.DawprojectFileType]}))
            if (status === "rejected" && !Errors.isAbort(error)) {
                return error
            } else {
                return
            }
        }
    }

    fromProject(project: Project, name: string): void {this.profileService.fromProject(project, name)}

    runIfProject<R>(procedure: Func<Project, R>): Option<R> {
        return this.profileService.getValue().map(({project}) => procedure(project))
    }

    get project(): Project {return this.profile.project}
    get profile(): ProjectProfile {return this.profileService.getValue().unwrap("No profile available")}
    get hasProfile(): boolean {return this.profileService.getValue().nonEmpty()}

    subscribeSignal<T extends StudioSignal["type"]>(
        observer: Observer<Extract<StudioSignal, { type: T }>>, type: T): Subscription {
        return this.#signals.subscribe(signal => {
            if (signal.type === type) {
                observer(signal as Extract<StudioSignal, { type: T }>)
            }
        })
    }

    switchScreen(key: Nullable<Workspace.ScreenKeys>): void {
        this.layout.screen.setValue(key)
        RouteLocation.get().navigateTo("/")
    }

    hidePrompter(): void {
        this.layout.showPrompter.setValue(false)
        this.layout.isSongCreating.setValue(false)
        this.layout.songCreationProgress.setValue(0)
        this.stopProgressInterval()
        // Switch to default view when starting from scratch
        this.switchScreen("default")
    }

    private startProgressInterval(): void {
        // Clear any existing interval
        this.stopProgressInterval()
        
        // Start continuous progress advancement: 0.5% every 0.2 seconds until 95%
        this.#progressInterval = setInterval(() => {
            const current = this.layout.songCreationProgress.getValue()
            if (current < 95) {
                this.layout.songCreationProgress.setValue(Math.min(95, current + 0.5))
            }
        }, 200) // Update every 200ms with 0.5% increments
    }

    private stopProgressInterval(): void {
        if (this.#progressInterval) {
            clearInterval(this.#progressInterval)
            this.#progressInterval = null
        }
    }

    private completeSongCreation(): void {
        // Guard against multiple completion attempts
        if (this.layout.songCreationProgress.getValue() === 100) {
            console.log('🎵 Song creation already completed, skipping duplicate completion')
            return
        }
        
        console.log('🎵 Completing song creation')
        this.stopProgressInterval()
        this.layout.songCreationProgress.setValue(100)
        
        // After loading completes, show preview modal (if in preview mode)
        setTimeout(() => {
            this.hidePrompter()
            
            // Show preview modal if we're in preview mode
            if (this.preview.isActive.getValue()) {
                console.log('✨ Showing preview modal after loading complete')
                this.preview.showModal.setValue(true)
            }
        }, 1000) // Wait 1 second at 100%
    }

    /**
     * Create preview workspace - new empty project for song preview
     * IMPORTANT: Original project stays active! Preview is stored separately.
     */
    private async createPreviewWorkspace(prompt: string): Promise<void> {
        console.log('🎬 Creating SEPARATE preview workspace (original project stays active)')
        
        // Save reference to current project (will stay active!)
        const currentProfile = this.profileService.getValue()
        if (currentProfile.isEmpty()) {
            throw new Error('No active project to create preview from')
        }
        
        const profile = currentProfile.unwrap()
        this.preview.originalProjectData = {
            profile: profile,
            uuid: profile.uuid
        }
        this.preview.currentPrompt = prompt
        
        console.log('💾 Original project saved (STAYS ACTIVE):', profile.meta.name)
        
        // Create new empty preview project (SEPARATE, not active)
        const {Project, ProjectProfile, ProjectMeta} = await import('@opendaw/studio-core')
        const previewProject = Project.new(this)
        
        // Initialize preview project's audio engine for playback
        console.log('🔊 Initializing preview project audio engine...')
        previewProject.startAudioWorklet(this.audioWorklets, {
            unload: async (event: unknown) => {
                console.error('Preview engine error:', event)
            },
            load: () => {
                console.log('✅ Preview engine loaded')
            }
        })
        // Don't connect to main engine facade - preview has its own playback
        
        // Create preview profile
        const previewProfile = new ProjectProfile(
            UUID.generate(),
            previewProject,
            ProjectMeta.init('🎵 Preview'),
            Option.None,
            false
        )
        
        // Store preview separately (DO NOT set as active profile!)
        this.preview.project.setValue(previewProject)
        this.preview.profile.setValue(previewProfile)
        this.preview.isActive.setValue(true)
        
        console.log('✅ Preview project created SEPARATELY (original project still active in main workspace)')
        console.log('📌 Preview project will receive tool executions, NOT the original!')
    }

    /**
     * Accept preview - merge preview tracks into original project
     */
    async acceptPreview(): Promise<void> {
        console.log('✅ Accepting preview - merging to original project')
        
        if (!this.preview.project.getValue() || !this.preview.originalProjectData) {
            console.error('❌ No preview data to apply')
            return
        }
        
        try {
            // Stop preview playback before applying
            const previewProject = this.preview.project.getValue()
            if (previewProject?.engine) {
                previewProject.engine.stop()
                console.log('⏹️ Stopped preview playback before applying')
            }
            
            // Show loading state
            this.preview.isApplying.setValue(true)
            
            // Hide preview modal
            this.preview.showModal.setValue(false)
            
            // IMPORTANT: Invalidate manifest cache to ensure new audio files are found
            try {
                const {SupabaseSampleAPI} = await import('@/service/SupabaseSampleAPI')
                const sampleAPI = SupabaseSampleAPI.get()
                sampleAPI.invalidateCache()
                console.log('🔄 [APPLY-PREVIEW] Invalidated manifest cache before applying preview')
            } catch (cacheError) {
                console.warn('⚠️ [APPLY-PREVIEW] Failed to invalidate cache:', cacheError)
            }
            
            // Extract all tracks/data from preview project
            const previewData = this.extractProjectDataFrom(this.preview.project.getValue()!, this.preview.profile.getValue()!)
            
            console.log(`📋 Merging ${previewData.tracks?.length || 0} tracks from preview to original project`)
            
            // DEBUG: Log note regions being extracted
            previewData.tracks?.forEach((track: any, index: number) => {
                const noteCount = track.noteRegions?.reduce((sum: number, r: any) => sum + (r.notes?.length || 0), 0) || 0
                console.log(`  📝 Track ${index} "${track.name}": ${track.noteRegions?.length || 0} regions, ${noteCount} total notes`)
            })
            
            // IMPORTANT: Deactivate preview mode BEFORE restoring original project
            this.preview.isActive.setValue(false)
            
            // Restore original project
            this.profileService.setValue(Option.wrap(this.preview.originalProjectData.profile))
            
            console.log('📌 Preview deactivated, now applying changes to MAIN project')
            
            // Now apply preview changes to it (this will merge the tracks)
            await this.applyProjectChanges(previewData)
            
            // Apply modified arrangements based on sections
            const sections = this.preview.sections.getValue()
            if (sections && sections.length > 0) {
                console.log(`🎵 Applying modified arrangements based on ${sections.length} sections`)
                
                // Convert sections to arrangement tool calls
                const trackArrangements = new Map<string, any[]>()
                
                sections.forEach((section: any) => {
                    section.tracks.forEach((trackName: string) => {
                        const existing = trackArrangements.get(trackName) || []
                        existing.push([section.startBar, section.endBar])
                        trackArrangements.set(trackName, existing)
                    })
                })
                
                console.log(`📊 Applying arrangements for ${trackArrangements.size} tracks based on modified sections`)
                
                // Execute arrangements on the now-restored original project
                // NOTE: Must be sequential because each arrangeInTrack modifies the project data
                for (const [trackName, timeArrangement] of trackArrangements) {
                    const toolResponse = await this.executeRemoteTool('arrangeInTrack', {
                        trackName,
                        timeArrangement
                    })
                    
                    if (toolResponse.success) {
                        console.log(`✅ Arrangement applied for track "${trackName}"`)
                    } else {
                        console.error(`❌ Failed to apply arrangement for track "${trackName}":`, toolResponse.message)
                    }
                }
            }
            
            console.log('✅ Preview merged successfully!')
            
            // Save project name before clearing state
            const projectNameToSave = this.preview.projectName
            
            // Clear preview state and hide loading IMMEDIATELY
            this.clearPreviewState()
            this.preview.isApplying.setValue(false)
            
            // Save in background (don't await, don't block user)
            if (projectNameToSave) {
                console.log(`💾 [BACKGROUND-SAVE] Starting background save with name: ${projectNameToSave}`)
                
                // Run save in background without blocking
                this.saveProjectInBackground(projectNameToSave).catch(error => {
                    console.error('❌ [BACKGROUND-SAVE] Failed:', error)
                })
            } else {
                console.log('⚠️ [BACKGROUND-SAVE] No AI-generated project name available, skipping auto-save')
            }
            
        } catch (error) {
            // If error occurs, still clear state and hide loading
            console.error('❌ Error in acceptPreview:', error)
            this.clearPreviewState()
            this.preview.isApplying.setValue(false)
            throw error
        }
    }

    /**
     * Save project in background without blocking UI
     */
    private async saveProjectInBackground(projectName: string): Promise<void> {
        try {
            const currentProfile = this.profileService.getValue()
            if (currentProfile && 'unwrap' in currentProfile) {
                const profile = currentProfile.unwrap()
                
                // Save the project with custom name
                if (!profile.saved()) {
                    console.log('🆕 [BACKGROUND-SAVE] New project, using saveAsDef() with custom name')
                    await this.saveAsDef(projectName)
                } else {
                    console.log('💾 [BACKGROUND-SAVE] Existing project, updating name and saving')
                    profile.meta.name = projectName
                    await this.save()
                }
                
                console.log('✅ [BACKGROUND-SAVE] Project saved successfully with name:', projectName)
            }
        } catch (error) {
            console.error('❌ [BACKGROUND-SAVE] Save failed:', error)
            // Don't propagate error - save is optional background operation
        }
    }

    /**
     * Reject preview - discard preview and keep original project
     */
    async rejectPreview(): Promise<void> {
        console.log('❌ Rejecting preview - discarding preview project')
        
        if (!this.preview.isActive.getValue()) {
            console.warn('No active preview to reject')
            return
        }
        
        // Hide modal first
        this.preview.showModal.setValue(false)
        
        // Original project is already active - just clear preview state
        console.log('✅ Preview discarded, original project unchanged')
        
        // Clear preview state
        this.clearPreviewState()
    }

    /**
     * Regenerate song - reject preview and create new one with same prompt
     */
    async regeneratePreview(): Promise<void> {
        console.log('🔄 Regenerating preview')
        
        const prompt = this.preview.currentPrompt
        if (!prompt) {
            console.warn('No prompt stored for regeneration')
            return
        }
        
        // Reject current preview first
        await this.rejectPreview()
        
        // Trigger new song creation with same prompt
        await this.handleSongPrompt(prompt)
    }

    /**
     * Clear preview state
     */
    private clearPreviewState(): void {
        this.preview.isActive.setValue(false)
        this.preview.isApplying.setValue(false)
        this.preview.project.setValue(null)
        this.preview.profile.setValue(null)
        this.preview.editingRegion.setValue(null)
        this.preview.sections.setValue([])
        this.preview.originalProjectData = null
        this.preview.originalProjectId = null
        this.preview.currentPrompt = null
        this.preview.projectName = null
    }

    private async executeToolCallsWithSecretAddress(
        secretAddress: string,
        userId: string,
        projectId: string,
        _secretLoadingCode?: string,
        isBringUpDrums?: boolean,
        searchQuery?: string,
        stateAddress?: string
    ): Promise<void> {
        // Guard against multiple completion attempts
        if (this.layout.songCreationProgress.getValue() === 100) {
            console.log('🎵 Song creation already completed, skipping duplicate execution')
            return
        }
        try {
            console.log('🔧 [DEBUG] Executing tools with secure payload')
            console.log('🔧 [DEBUG] isBringUpDrums:', isBringUpDrums, 'searchQuery:', searchQuery)
            
            // Use the existing method that includes projectData
            const toolResults = await this.executeRemoteToolWithSecretAddress(secretAddress)
            
            if (toolResults.success) {
                console.log('✅ Tools executed successfully')
                
                // Determine which route to use based on presence of stateAddress
                const route = stateAddress ? 'song-maker' : 'song-creator-agent'
                
                // Send tool results back to song-maker or song-creator-agent
                const followupPayload = stateAddress ? {
                    resultSecretAddress: stateAddress,  // Use stateAddress for song-maker
                    userId: userId,
                    projectId: projectId
                } : {
                    resultSecretAddress: toolResults.resultSecretAddress,
                    userId: userId,
                    projectId: projectId,
                    isBringUpDrums: isBringUpDrums || false,
                    searchQuery: searchQuery || ''
                };
                
                console.log(`🔧 [DEBUG] Sending follow-up to ${route}:`, JSON.stringify(followupPayload, null, 2));
                
                const followupResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/router`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY || ''}`,
                        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY || ''
                    },
                    body: JSON.stringify({
                        route: route,
                        ...followupPayload
                    })
                })
                
                if (followupResponse.ok) {
                    const followupResult = await followupResponse.json()
                    console.log('✅ Song creator follow-up completed:', followupResult.message)
                    
                    // Check if song-creator wants to execute more tools (iterative like chatbot)
                    if (followupResult.success && followupResult.send_to_execution && followupResult.secretAddress) {
                        // For song-maker: If we had a stateAddress but followup doesn't return one, it means STEP 2 is done
                        const isSongMakerStep2Complete = stateAddress && !followupResult.stateAddress
                        
                        if (isSongMakerStep2Complete) {
                            console.log('🎵 Song-maker STEP 2 - executing final tools (add content) without recursion')
                            
                            // Execute STEP 2 tools ONE LAST TIME (addMelodyGenerationToTrack, addAudioToAudioPlayer)
                            // Sections will be received from tool-executor response
                            const step2Results = await this.executeRemoteToolWithSecretAddress(followupResult.secretAddress)
                            console.log('✅ Song-maker STEP 2 tools executed:', step2Results.success)
                            if (step2Results.sections) {
                                console.log('📊 [SECTIONS] Received', step2Results.sections.length, 'sections from tool execution')
                            }
                            
                            // Store project name if provided in step 2 response
                            if (step2Results.projectName) {
                                this.preview.projectName = step2Results.projectName
                                console.log(`✨ [PROJECT-NAME] AI generated project name (from step 2): ${step2Results.projectName}`)
                            }
                            // Fall through to completion below (no recursion)
                        } else {
                            console.log('🔄 Song creator returned more tools to execute - continuing iteratively')
                            console.log('🔍 [DRUMFIX-RECURSIVE] ========== ABOUT TO MAKE RECURSIVE CALL ==========')
                            console.log('🔍 [DRUMFIX-RECURSIVE] Current project state before recursive call:')
                            console.log('🔍 [DRUMFIX-RECURSIVE] Tracks:', this.extractProjectData().tracks?.length || 0)
                            if (this.extractProjectData().tracks) {
                                this.extractProjectData().tracks.forEach((t: any, i: number) => {
                                    console.log(`🔍 [DRUMFIX-RECURSIVE] Track ${i}: "${t.name}" (${t.type})`)
                                })
                            }
                            
                            // Recursively execute more tools
                            await this.executeToolCallsWithSecretAddress(
                                followupResult.secretAddress,
                                userId,
                                projectId,
                                followupResult.secretLoadingCode,
                                followupResult.isBringUpDrums || isBringUpDrums,
                                followupResult.searchQuery || searchQuery,
                                followupResult.stateAddress  // Only pass NEW stateAddress, not old one
                            )
                            return  // Don't fall through to completion - recursion will handle it
                        }
                    }
                    
                    // Completion (reached when no more tools OR song-maker STEP 2 is done)
                    if (true) {
                        console.log('🎵 Song creator finished - no more tools to execute')
                        
                        // Complete loading FIRST, before saving (so progress bar always reaches 100%)
                        console.log('🎵 All song creation iterations completed')
                        this.completeSongCreation()
                        
                        // Trigger automatic save to cloud in background (don't block completion)
                        console.log('💾 [SONG-AUTOSAVE] Song creation complete, saving in background...')
                        
                        // Don't await - let it run in background without blocking completion
                        void (async () => {
                            try {
                                // Get current profile and log its state
                                const currentProfile = this.profileService?.getValue()
                                console.log('🔍 [SONG-AUTOSAVE] Current profile exists:', currentProfile ? 'Yes' : 'No')
                                
                                if (currentProfile && 'unwrap' in currentProfile) {
                                    const profile = currentProfile.unwrap()
                                    console.log('📊 [SONG-AUTOSAVE] Project state - saved:', profile.saved(), 'name:', profile.meta?.name)
                                    
                                    // Log the entire profile for debugging
                                    console.log('📋 [SONG-AUTOSAVE] Full profile state:', {
                                        saved: profile.saved(),
                                        hasChanges: profile.hasChanges(),
                                        meta: profile.meta,
                                        uuid: profile.uuid
                                    })
                                    
                                    // Save based on project state
                                    if (!profile.saved()) {
                                        console.log('🆕 [SONG-AUTOSAVE] New project detected, using saveAsDef()')
                                        await this.saveAsDef()
                                    } else {
                                        console.log('💾 [SONG-AUTOSAVE] Existing project, using regular save()')
                                        await this.save()
                                    }
                                    
                                    // Verify the state after save
                                    const updatedProfile = this.profileService?.getValue()
                                    if (updatedProfile && 'unwrap' in updatedProfile) {
                                        const updated = updatedProfile.unwrap()
                                        console.log('✅ [SONG-AUTOSAVE] After save - saved:', updated.saved(), 'name:', updated.meta?.name)
                                    }
                                } else {
                                    console.warn('⚠️ [SONG-AUTOSAVE] No active profile available')
                                }
                            } catch (error) {
                                console.error('❌ [SONG-AUTOSAVE] Auto-save failed:', error)
                                // Save failure won't affect user experience since completion already happened
                            }
                        })()
                    }
                } else {
                    console.error('❌ Song creator follow-up failed:', followupResponse.status)
                    
                    // Complete loading even if follow-up failed
                    console.log('🎵 Song creation completed with errors')
                    this.completeSongCreation()
                }
            } else {
                console.error('❌ Tool execution failed:', toolResults.message)
                
                // Complete loading even if tool execution failed
                console.log('🎵 Song creation completed with tool execution errors')
                this.completeSongCreation()
            }
            
        } catch (error) {
            console.error('❌ Tool execution error:', error)
            
            // Complete loading even if there was an error
            console.log('🎵 Song creation completed with errors')
            this.completeSongCreation()
        }
    }

    async handleSongPrompt(prompt: string): Promise<void> {
        console.log('🎵 Song prompt received:', prompt)
        
        // Guard against multiple song creation attempts
        if (this.layout.isSongCreating.getValue()) {
            console.log('🎵 Song creation already in progress, ignoring duplicate request')
            return
        }
        
        try {
            // Start loading state and progress interval immediately
            this.layout.isSongCreating.setValue(true)
            this.layout.songCreationProgress.setValue(0)
            this.startProgressInterval() // Démarre l'avancement automatique de 0.5% toutes les 0.2s jusqu'à 95%
            
            // Create preview workspace FIRST (before any API calls)
            await this.createPreviewWorkspace(prompt)
            
            // Get current project and user info (using same pattern as Chatbot)
            const userId = this.authService?.getCurrentUser()?.id
            if (!userId) {
                throw new Error('User not authenticated')
            }
            
            // Get project ID from ProjectService
            let projectId = this.projectService?.currentProject?.getValue()?.id
            
            // Fallback: Try to get from profile service (for loaded projects)
            if (!projectId) {
                const profile = this.profileService.getValue()
                if (profile && 'unwrap' in profile) {
                    const unwrapped = (profile as any).unwrap()
                    projectId = unwrapped?.cloudId || null
                }
            }
            
            if (!userId || !projectId) {
                throw new Error('Missing user or project ID')
            }
            
            // Store project ID in preview for retry functionality
            this.preview.originalProjectId = projectId
            
            // Call song-maker through router
            console.log('🔧 [DEBUG] Calling song-maker with:', { message: prompt, userId, projectId })
            console.log('🔧 [DEBUG] Using router for song creation request')
            
            let response
            try {
                response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/router`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY || ''}`,
                        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY || ''
                    },
                    body: JSON.stringify({
                        route: 'song-maker',
                        message: prompt,
                        userId: userId,
                        projectId: projectId
                    })
                })
                console.log('🔧 [DEBUG] Fetch completed successfully')
            } catch (fetchError) {
                console.error('🔧 [DEBUG] Fetch failed with error:', fetchError)
                throw fetchError
            }
            
            console.log('🔧 [DEBUG] Song creator response status:', response.status, 'ok:', response.ok)
            
            if (!response.ok) {
                const errorText = await response.text()
                console.error('🔧 [DEBUG] Song creator error response:', errorText)
                throw new Error(`Song creator API error: ${response.status} ${errorText}`)
            }
            
            let result
            try {
                console.log('🔧 [DEBUG] Parsing JSON response...')
                result = await response.json()
                console.log('🔧 [DEBUG] JSON parsing completed successfully')
            } catch (jsonError) {
                console.error('🔧 [DEBUG] JSON parsing failed:', jsonError)
                const responseText = await response.text()
                console.error('🔧 [DEBUG] Raw response text:', responseText)
                throw new Error(`Failed to parse JSON response: ${jsonError}`)
            }
            
            console.log('🔧 [DEBUG] Song creator initial response:', JSON.stringify(result, null, 2))
            console.log('🔧 [DEBUG] Initial response isBringUpDrums:', result.isBringUpDrums, 'searchQuery:', result.searchQuery)
            
            // Store project name if provided
            if (result.projectName) {
                this.preview.projectName = result.projectName
                console.log(`✨ [PROJECT-NAME] AI generated project name: ${result.projectName}`)
            }
            
            if (result.success && result.send_to_execution) {
                // Handle tool execution similar to chatbot
                console.log('🔧 [DEBUG] Song maker returned tools to execute')
                console.log('🔧 [DEBUG] result.stateAddress:', result.stateAddress)
                
                if (result.secretAddress) {
                    // Execute server-side tools via tool-executor with progress tracking
                    console.log('🔧 [DEBUG] Calling executeToolCallsWithSecretAddress with stateAddress:', result.stateAddress)
                    await this.executeToolCallsWithSecretAddress(
                        result.secretAddress,
                        userId,
                        projectId,
                        result.secretLoadingCode,
                        false,  // Not bringUpDrums
                        '',     // No search query
                        result.stateAddress  // Pass state address for follow-up
                    )
                }
                
                // Complete loading and hide prompter after delay (only after ALL iterations are done)
                console.log('🎵 All song creation iterations completed')
                this.completeSongCreation()
            } else if (result.success) {
                console.log('✅ Song creation completed:', result.message)
                
                // Complete loading FIRST, before saving (so progress bar always reaches 100%)
                this.completeSongCreation()
                
                // Trigger automatic save to cloud in background (don't block completion)
                console.log('💾 [SONG-AUTOSAVE] Song creation complete, saving in background...')
                
                // Don't await - let it run in background without blocking completion
                void (async () => {
                    try {
                        // Get current profile and log its state
                        const currentProfile = this.profileService?.getValue()
                        console.log('🔍 [SONG-AUTOSAVE] Current profile exists:', currentProfile ? 'Yes' : 'No')
                        
                        if (currentProfile && 'unwrap' in currentProfile) {
                            const profile = currentProfile.unwrap()
                            console.log('📊 [SONG-AUTOSAVE] Project state - saved:', profile.saved(), 'name:', profile.meta?.name)
                            
                            // Log the entire profile for debugging
                            console.log('📋 [SONG-AUTOSAVE] Full profile state:', {
                                saved: profile.saved(),
                                hasChanges: profile.hasChanges(),
                                meta: profile.meta,
                                uuid: profile.uuid
                            })
                            
                            // Save based on project state
                            if (!profile.saved()) {
                                console.log('🆕 [SONG-AUTOSAVE] New project detected, using saveAsDef()')
                                await this.saveAsDef()
                            } else {
                                console.log('💾 [SONG-AUTOSAVE] Existing project, using regular save()')
                                await this.save()
                            }
                            
                            // Verify the state after save
                            const updatedProfile = this.profileService?.getValue()
                            if (updatedProfile && 'unwrap' in updatedProfile) {
                                const updated = updatedProfile.unwrap()
                                console.log('✅ [SONG-AUTOSAVE] After save - saved:', updated.saved(), 'name:', updated.meta?.name)
                            }
                        } else {
                            console.warn('⚠️ [SONG-AUTOSAVE] No active profile available')
                        }
                    } catch (error) {
                        console.error('❌ [SONG-AUTOSAVE] Auto-save failed:', error)
                        // Save failure won't affect user experience since completion already happened
                    }
                })()
            } else {
                throw new Error(result.error || 'Song creation failed')
            }
            
        } catch (error) {
            console.error('❌ Song creation error:', error)
            // Still hide prompter on error to prevent UI lock
            this.hidePrompter()
            // TODO: Show error message to user
        }
    }

    registerFooter(factory: Provider<FooterLabel>): void {
        this.#factoryFooterLabel = Option.wrap(factory)
    }

    factoryFooterLabel(): Option<Provider<FooterLabel>> {return this.#factoryFooterLabel}

    resetPeaks(): void {this.#signals.notify({type: "reset-peaks"})}

    async verifyProject() {
        if (!this.hasProfile) {return}
        const {boxGraph, rootBox, userInterfaceBox, masterBusBox, timelineBox} = this.project
        assert(rootBox.isAttached(), "[verify] rootBox is not attached")
        assert(userInterfaceBox.isAttached(), "[verify] userInterfaceBox is not attached")
        assert(masterBusBox.isAttached(), "[verify] masterBusBox is not attached")
        assert(timelineBox.isAttached(), "[verify] timelineBox is not attached")
        const result = boxGraph.verifyPointers()
        await Dialogs.info({message: `Project is okay. All ${result.count} pointers are fine.`})
    }

    /**
     * Retry melody generation for a MIDI track
     */
    async retryMelody(trackName: string, projectId: string, project: Project, audioUnit: any): Promise<void> {
        console.log(`🔄 [RETRY-MELODY] Starting retry for track "${trackName}"`)
        
        try {
            // Initialize Supabase client
            const { createClient } = await import('@supabase/supabase-js')
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://tsfjukrkryhbypjcnepg.supabase.co'
            const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
            const supabase = createClient(supabaseUrl, supabaseKey)

            // Step 1: Call retry-melody edge function
            const response = await fetch(`${supabaseUrl}/functions/v1/retry-melody`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${supabaseKey}`,
                    'apikey': supabaseKey
                },
                body: JSON.stringify({
                    trackName,
                    projectId
                })
            })

            if (!response.ok) {
                const errorText = await response.text()
                throw new Error(`Retry melody failed: ${response.status} - ${errorText}`)
            }

            const result = await response.json()
            console.log('✅ [RETRY-MELODY] Generation result:', result)

            // Step 2: Fetch the MIDI file URL from generations-metadata (melody only, not full)
            console.log('📊 [RETRY-MELODY] Fetching metadata for generation_id:', result.generation_id)
            
            // Add timeout to prevent infinite loading
            const metadataPromise = supabase
                .from('generations-metadata')
                .select('melody_link, input_parameters')
                .eq('id', result.generation_id)
                .single()
            
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Metadata fetch timeout after 10s')), 10000)
            )
            
            const { data: metadata, error: metaError } = await Promise.race([
                metadataPromise,
                timeoutPromise
            ]) as any

            console.log('📊 [RETRY-MELODY] Metadata fetch completed')
            console.log('📊 [RETRY-MELODY] Metadata:', metadata)
            console.log('📊 [RETRY-MELODY] Error:', metaError)

            if (metaError) {
                console.error('❌ [RETRY-MELODY] Metadata fetch error:', metaError)
                throw new Error(`Failed to fetch generation metadata: ${metaError?.message}`)
            }
            
            if (!metadata) {
                console.error('❌ [RETRY-MELODY] No metadata returned')
                throw new Error('No metadata found for generation')
            }

            console.log('📥 [RETRY-MELODY] MIDI URL (melody only):', metadata.melody_link)
            console.log('📊 [RETRY-MELODY] Generation params:', metadata.input_parameters)

            // Step 3: Download and parse MIDI file (melody only)
            console.log('⬇️ [RETRY-MELODY] Downloading MIDI from:', metadata.melody_link)
            const midiResponse = await fetch(metadata.melody_link)
            if (!midiResponse.ok) {
                console.error('❌ [RETRY-MELODY] MIDI download failed:', midiResponse.status)
                throw new Error(`Failed to download MIDI: ${midiResponse.status}`)
            }

            console.log('📦 [RETRY-MELODY] Converting to ArrayBuffer...')
            const midiArrayBuffer = await midiResponse.arrayBuffer()
            console.log('📦 [RETRY-MELODY] ArrayBuffer size:', midiArrayBuffer.byteLength, 'bytes')
            
            console.log('🎼 [RETRY-MELODY] Importing MidiFile decoder...')
            const { MidiFile } = await import('@opendaw/lib-midi')
            
            console.log('🎼 [RETRY-MELODY] Decoding MIDI...')
            const midiFile = MidiFile.decoder(midiArrayBuffer).decode()

            console.log('🎵 [RETRY-MELODY] Parsed MIDI file with', midiFile.tracks.length, 'tracks')
            console.log('🎵 [RETRY-MELODY] MIDI timeDivision:', midiFile.timeDivision)

            // Step 4: Extract notes from MIDI and convert ticks to PPQN (same as tool-executor)
            const midiTimeDivision = midiFile.timeDivision || 96 // Pozalabs uses 96
            const targetPPQN = 960 // OpenDAW PPQN (same as tool-executor)
            
            console.log('🔄 [RETRY-MELODY] Converting MIDI ticks to PPQN:', {
                midiTimeDivision,
                targetPPQN,
                conversionRatio: targetPPQN / midiTimeDivision
            })
            
            const notes: any[] = []
            for (const track of midiFile.tracks) {
                for (const [_, events] of track.controlEvents) {
                    const noteMap = new Map()
                    
                    for (const event of events) {
                        if (event.type === 144) { // NOTE_ON
                            noteMap.set(event.param0, {
                                startTicks: event.ticks,
                                pitch: event.param0,
                                velocity: event.param1 / 127
                            })
                        } else if (event.type === 128) { // NOTE_OFF
                            const noteStart = noteMap.get(event.param0)
                            if (noteStart) {
                                const durationTicks = Math.max(midiTimeDivision / 8, event.ticks - noteStart.startTicks)
                                // Convert MIDI ticks to openDAW PPQN (960 per quarter note) - same as tool-executor
                                const positionPPQN = Math.floor(noteStart.startTicks / midiTimeDivision * 960)
                                const durationPPQN = Math.floor(durationTicks / midiTimeDivision * 960)
                                notes.push({
                                    position: positionPPQN,
                                    duration: durationPPQN,
                                    pitch: noteStart.pitch,
                                    velocity: noteStart.velocity
                                })
                                noteMap.delete(event.param0)
                            }
                        }
                    }
                }
            }

            console.log('🎹 [RETRY-MELODY] Extracted', notes.length, 'notes')

            // Step 5: Clear existing regions and add new notes
            console.log('📦 [RETRY-MELODY] Importing studio boxes...')
            const {NoteEventBox, NoteEventCollectionBox, NoteRegionBox} = await import('@opendaw/studio-boxes')
            const {ColorCodes} = await import('@opendaw/studio-core')
            
            console.log('🔍 [RETRY-MELODY] Getting trackBox from audioUnit...')
            const trackBox = audioUnit.tracks.values()[0]
            if (!trackBox) {
                console.error('❌ [RETRY-MELODY] No track found in audio unit')
                throw new Error('No track found in audio unit')
            }
            console.log('✅ [RETRY-MELODY] TrackBox found:', trackBox)
            
            // Calculate region duration
            const regionDuration = notes.length > 0 
                ? Math.max(...notes.map(n => n.position + n.duration))
                : 1920
            console.log('📏 [RETRY-MELODY] Region duration:', regionDuration)

            // Clear existing regions and add new notes in ONE transaction
            console.log('🔄 [RETRY-MELODY] Starting modify transaction...')
            project.editing.modify(() => {
                // Step 1: VRAIMENT supprimer toutes les régions existantes
                const regions = trackBox.regions.collection.asArray()
                console.log(`🗑️ [RETRY-MELODY] Clearing ${regions.length} existing regions`)
                
                // Méthode 1: Terminer chaque région
                for (let i = regions.length - 1; i >= 0; i--) {
                    const region = regions[i]
                    try {
                        region.box.terminate()
                    } catch (e) {
                        console.warn(`⚠️ Could not terminate region ${i}:`, e)
                    }
                }
                
                // Méthode 2: Clear la collection directement
                try {
                    trackBox.regions.collection.clear()
                } catch (e) {
                    console.warn(`⚠️ Could not clear collection:`, e)
                }
                
                // Step 2: Créer une nouvelle région pour CHAQUE section (loop de 16 bars)
                // Calculer combien de sections de 16 bars on a
                const barsPerSection = 16
                const ppqnPerBar = 1920 // 4 beats * 480 ppqn
                const ppqnPerSection = barsPerSection * ppqnPerBar // 30720
                const totalSections = 8 // 8 sections de 16 bars = 128 bars total
                
                console.log(`🔄 [RETRY-MELODY] Creating ${totalSections} looped sections...`)
                
                for (let sectionIndex = 0; sectionIndex < totalSections; sectionIndex++) {
                    const sectionStartPosition = sectionIndex * ppqnPerSection
                    
                    // Créer une nouvelle collection pour cette section
                    const collection = NoteEventCollectionBox.create(project.boxGraph, UUID.generate())
                    
                    // Créer la région pour cette section
                    NoteRegionBox.create(project.boxGraph, UUID.generate(), box => {
                        box.position.setValue(sectionStartPosition)
                        box.duration.setValue(regionDuration)
                        box.label.setValue(`Regenerated Melody (Loop ${sectionIndex + 1})`)
                        box.hue.setValue(ColorCodes.forTrackType(0))
                        box.mute.setValue(false)
                        box.loopDuration.setValue(regionDuration)
                        box.events.refer(collection.owners)
                        box.regions.refer(trackBox.box.regions)
                    })
                    
                    // Ajouter les mêmes notes à chaque section (loop)
                    for (const note of notes) {
                        NoteEventBox.create(project.boxGraph, UUID.generate(), box => {
                            box.position.setValue(note.position)
                            box.duration.setValue(note.duration)
                            box.pitch.setValue(note.pitch)
                            box.velocity.setValue(note.velocity)
                            box.events.refer(collection.events)
                        })
                    }
                }
                
                console.log(`✅ [RETRY-MELODY] Added ${notes.length} notes x ${totalSections} sections`)
                console.log('🔚 [RETRY-MELODY] Modify transaction complete')
            })

            console.log('✅ [RETRY-MELODY] Successfully replaced melody - ALL DONE!')

        } catch (error) {
            console.error('❌ [RETRY-MELODY] Error:', error)
            const errorMessage = error instanceof Error ? error.message : String(error)
            await Dialogs.info({
                headline: 'Retry Failed',
                message: `Failed to regenerate melody: ${errorMessage}`
            })
            throw error
        }
    }

    /**
     * Retry audio generation for an audio track
     */
    async retryAudio(trackName: string, projectId: string, project: Project, audioUnit: any, customDescription?: string): Promise<void> {
        console.log(`🔄 [RETRY-AUDIO] Starting retry for track "${trackName}"`, {customDescription})
        
        try {
            // Get Supabase URL and key
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://tsfjukrkryhbypjcnepg.supabase.co'
            const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

            // Step 1: Call retry-audio edge function
            const response = await fetch(`${supabaseUrl}/functions/v1/retry-audio`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${supabaseKey}`,
                    'apikey': supabaseKey
                },
                body: JSON.stringify({
                    trackName,
                    projectId,
                    customDescription: customDescription || null
                })
            })

            if (!response.ok) {
                const errorText = await response.text()
                throw new Error(`Retry audio failed: ${response.status} - ${errorText}`)
            }

            const result = await response.json()
            console.log('✅ [RETRY-AUDIO] Generation result:', result)

            // Step 2: Get audio file URL and info
            console.log('📊 [RETRY-AUDIO] Audio UUID:', result.uuid)
            const audioUrl = `${supabaseUrl}/storage/v1/object/public/pozalabs-audio/${result.filename}`
            console.log('📥 [RETRY-AUDIO] Audio URL:', audioUrl)

            // Step 3: Update audio track with new audio
            const trackBox = audioUnit.tracks.values()[0]
            if (!trackBox) {
                throw new Error('No track found in audio unit')
            }

            // Calculate proper duration based on audio length and SAMPLE BPM
            const audioDurationSeconds = result.durationSeconds || 20.0
            const sampleBPM = result.sampleBpm || 120
            const properDuration = Math.round(audioDurationSeconds * sampleBPM / 60.0 * 960) // PPQN formula
            
            console.log(`🎵 [RETRY-AUDIO] Duration calculation:`, {
                audioDurationSeconds,
                sampleBPM,
                properDuration
            })

            // Import required boxes
            const {AudioRegionBox, AudioFileBox} = await import('@opendaw/studio-boxes')
            const {UUID} = await import('@opendaw/lib-std')
            const {ColorCodes} = await import('@opendaw/studio-core')

            project.editing.modify(() => {
                // Clear existing regions
                const regions = trackBox.regions.collection.asArray()
                console.log(`🗑️ [RETRY-AUDIO] Clearing ${regions.length} existing regions`)
                
                for (let i = regions.length - 1; i >= 0; i--) {
                    const region = regions[i]
                    try {
                        region.box.terminate()
                    } catch (e) {
                        console.warn(`⚠️ Could not terminate region ${i}:`, e)
                    }
                }
                
                try {
                    trackBox.regions.collection.clear()
                } catch (e) {
                    console.warn(`⚠️ Could not clear collection:`, e)
                }

                console.log('✅ [RETRY-AUDIO] Regions cleared')

                // Create AudioFileBox for the new audio file
                // Use result.uuid as the box ID (it identifies the file in storage)
                const fileUuid = UUID.parse(result.uuid)
                const audioFileBox = project.boxGraph.findBox(fileUuid)
                    .unwrapOrElse(() => AudioFileBox.create(project.boxGraph, fileUuid, box => {
                        box.fileName.setValue(result.filename)
                    }))

                // Create 8 looped audio regions (same as song-maker does)
                const barsPerSection = 16
                const ppqnPerBar = 1920
                const ppqnPerSection = barsPerSection * ppqnPerBar // 30720
                const totalSections = 8

                console.log(`🔄 [RETRY-AUDIO] Creating ${totalSections} looped audio sections...`)

                for (let sectionIndex = 0; sectionIndex < totalSections; sectionIndex++) {
                    const sectionStartPosition = sectionIndex * ppqnPerSection

                    // Create audio region for this section
                    AudioRegionBox.create(project.boxGraph, UUID.generate(), box => {
                        box.position.setValue(sectionStartPosition)
                        box.duration.setValue(properDuration)
                        box.label.setValue(`Audio Loop ${sectionIndex + 1}`)
                        box.hue.setValue(ColorCodes.forTrackType(1)) // Audio track color
                        box.mute.setValue(false)
                        box.loopDuration.setValue(properDuration)
                        box.loopOffset.setValue(0)
                        box.gain.setValue(1.0)
                        
                        // Reference the audio file
                        box.file.refer(audioFileBox)
                        
                        box.regions.refer(trackBox.box.regions)
                    })
                }

                console.log(`✅ [RETRY-AUDIO] Added ${totalSections} audio regions`)
            })

            console.log('✅ [RETRY-AUDIO] Audio retry complete!')

        } catch (error) {
            console.error('❌ [RETRY-AUDIO] Error:', error)
            const errorMessage = error instanceof Error ? error.message : String(error)
            await Dialogs.info({
                headline: 'Retry Failed',
                message: `Failed to regenerate audio: ${errorMessage}`
            })
            throw error
        }
    }

    /**
     * Retry MIDI melody by converting it to audio with a custom prompt
     */
    async retryMelodyWithAudio(trackName: string, projectId: string, project: Project, audioUnit: any, customPrompt: string): Promise<void> {
        console.log(`🔄 [RETRY-MELODY-TO-AUDIO] Converting MIDI track "${trackName}" to audio`, {customPrompt})
        
        try {
            // Get Supabase URL and key
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://tsfjukrkryhbypjcnepg.supabase.co'
            const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

            // Step 1: Call retry-melody-to-audio edge function
            const response = await fetch(`${supabaseUrl}/functions/v1/retry-melody-to-audio`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${supabaseKey}`,
                    'apikey': supabaseKey
                },
                body: JSON.stringify({
                    trackName,
                    projectId,
                    customPrompt
                })
            })

            if (!response.ok) {
                const errorText = await response.text()
                throw new Error(`Retry melody-to-audio failed: ${response.status} - ${errorText}`)
            }

            const result = await response.json()
            console.log('✅ [RETRY-MELODY-TO-AUDIO] Generation result:', result)

            // Step 2: Get track
            const trackBox = audioUnit.tracks.values()[0]
            if (!trackBox) {
                throw new Error('No track found in audio unit')
            }

            // Calculate proper duration based on audio length and SAMPLE BPM
            const audioDurationSeconds = result.durationSeconds || 20.0
            const sampleBPM = result.sampleBpm || 120
            const properDuration = Math.round(audioDurationSeconds * sampleBPM / 60.0 * 960) // PPQN formula
            
            console.log(`🎵 [RETRY-MELODY-TO-AUDIO] Duration calculation:`, {
                audioDurationSeconds,
                sampleBPM,
                properDuration
            })

            // Import required boxes and factories
            const {AudioRegionBox, AudioFileBox} = await import('@opendaw/studio-boxes')
            const {UUID} = await import('@opendaw/lib-std')
            const {ColorCodes, InstrumentFactories} = await import('@opendaw/studio-core')
            
            // Store track name and position before deleting
            const oldTrackName = trackName
            const oldMuteValue = audioUnit.namedParameter.mute.getValue()
            const oldSoloValue = audioUnit.namedParameter.solo.getValue()
            const audioUnitIndex = project.rootBoxAdapter.audioUnits.adapters().indexOf(audioUnit)
            
            console.log(`🔄 [RETRY-MELODY-TO-AUDIO] Converting MIDI track to audio track...`)
            console.log(`📊 [RETRY-MELODY-TO-AUDIO] Old track: ${oldTrackName}, index: ${audioUnitIndex}`)
            
            // Delete the old AudioUnit with its MIDI device
            project.editing.modify(() => {
                audioUnit.box.delete()
                console.log(`✅ [RETRY-MELODY-TO-AUDIO] Deleted old MIDI AudioUnit`)
            })
            
            // Create a new AudioUnit with TapeDevice at the same position
            let newAudioUnit: any
            project.editing.modify(() => {
                const result = project.api.createInstrument(InstrumentFactories.Tape, {
                    index: audioUnitIndex,
                    name: oldTrackName
                })
                newAudioUnit = result
                
                // Restore mute/solo state
                result.audioUnitBox.mute.setValue(oldMuteValue)
                result.audioUnitBox.solo.setValue(oldSoloValue)
                
                console.log(`✅ [RETRY-MELODY-TO-AUDIO] Created new Tape AudioUnit at index ${audioUnitIndex}`)
            })
            
            // Get the new trackBox
            const newTrackBox = newAudioUnit.trackBox
            
            console.log(`✅ [RETRY-MELODY-TO-AUDIO] Track converted from MIDI to Audio`)

            // Add audio regions to the new track
            project.editing.modify(() => {
                // Create AudioFileBox for the new audio file
                const fileUuid = UUID.parse(result.uuid)
                const audioFileBox = project.boxGraph.findBox(fileUuid)
                    .unwrapOrElse(() => AudioFileBox.create(project.boxGraph, fileUuid, box => {
                        box.fileName.setValue(result.filename)
                    }))

                // Create 8 looped audio regions (same as song-maker does)
                const barsPerSection = 16
                const ppqnPerBar = 1920
                const ppqnPerSection = barsPerSection * ppqnPerBar // 30720
                const totalSections = 8

                console.log(`🔄 [RETRY-MELODY-TO-AUDIO] Creating ${totalSections} looped audio sections...`)

                for (let sectionIndex = 0; sectionIndex < totalSections; sectionIndex++) {
                    const sectionStartPosition = sectionIndex * ppqnPerSection

                    // Create audio region for this section
                    AudioRegionBox.create(project.boxGraph, UUID.generate(), box => {
                        box.position.setValue(sectionStartPosition)
                        box.duration.setValue(properDuration)
                        box.label.setValue(`Audio Loop ${sectionIndex + 1}`)
                        box.hue.setValue(ColorCodes.forTrackType(1)) // Audio track color
                        box.mute.setValue(false)
                        box.loopDuration.setValue(properDuration)
                        box.loopOffset.setValue(0)
                        box.gain.setValue(1.0)
                        
                        // Reference the audio file
                        box.file.refer(audioFileBox)
                        
                        box.regions.refer(newTrackBox.box.regions)
                    })
                }

                console.log(`✅ [RETRY-MELODY-TO-AUDIO] Added ${totalSections} audio regions to new TapeDevice track`)
            })

            console.log('✅ [RETRY-MELODY-TO-AUDIO] MIDI track converted to audio successfully!')
            
            // IMPORTANT: Invalidate manifest cache so new audio file is found during "Apply to DAW"
            try {
                const {SupabaseSampleAPI} = await import('@/service/SupabaseSampleAPI')
                const sampleAPI = SupabaseSampleAPI.get()
                sampleAPI.invalidateCache()
                console.log('🔄 [RETRY-MELODY-TO-AUDIO] Invalidated manifest cache for new audio file')
            } catch (cacheError) {
                console.warn('⚠️ [RETRY-MELODY-TO-AUDIO] Failed to invalidate cache:', cacheError)
            }

        } catch (error) {
            console.error('❌ [RETRY-MELODY-TO-AUDIO] Error:', error)
            const errorMessage = error instanceof Error ? error.message : String(error)
            await Dialogs.info({
                headline: 'MIDI to Audio Conversion Failed',
                message: `Failed to convert MIDI to audio: ${errorMessage}`
            })
            throw error
        }
    }
}