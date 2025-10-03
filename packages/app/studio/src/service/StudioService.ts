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
    readonly layout = {
        systemOpen: new DefaultObservableValue<boolean>(false),
        helpVisible: new DefaultObservableValue<boolean>(true),
        screen: new DefaultObservableValue<Nullable<Workspace.ScreenKeys>>("default"),
        showPrompter: new DefaultObservableValue<boolean>(false),
        songCreationProgress: new DefaultObservableValue<number>(0), // 0-100 progress
        isSongCreating: new DefaultObservableValue<boolean>(false) // Loading state
    } as const
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
    async executeRemoteToolWithSecretAddress(secretAddress: string): Promise<{ success: boolean; message: string; resultSecretAddress?: string }> {
        if (!this.hasProfile) {
            throw new Error('No project is currently open')
        }
        
        try {
            console.log(`🔐 Executing tools from secure payload`)
            
            // Track progress during tool execution (will be updated by interval)
            
            // Extract current project data (no audio files, just structure)
            const projectData = this.extractProjectData()
            
            // DEBUG: Check what we extract from current project
            console.log(`🔍 [DRUMFIX-EXTRACT] ========== EXTRACTING PROJECT DATA ==========`)
            console.log(`🔍 [DRUMFIX-EXTRACT] Extracted project with ${projectData.tracks?.length || 0} tracks`)
            if (projectData.tracks) {
                projectData.tracks.forEach((t: any, i: number) => {
                    console.log(`🔍 [DRUMFIX-EXTRACT] Track ${i}: "${t.name}" (${t.type})`)
                })
            }
            console.log(`🎹 [DEBUG-EXTRACT] Extracted project with ${projectData.tracks?.length || 0} tracks`)
            if (projectData.tracks) {
                projectData.tracks.forEach((track: any, index: number) => {
                    const noteRegions = track.noteRegions || []
                    const totalNotes = noteRegions.reduce((sum: number, region: any) => sum + (region.notes?.length || 0), 0)
                    console.log(`🎹 [DEBUG-EXTRACT] Track ${index} "${track.name}": ${noteRegions.length} regions, ${totalNotes} notes`)
                    
                    // 🔍 DEBUG: Show extracted parameters for each track
                    console.log(`🔍 [DEBUG-EXTRACT] Track "${track.name}" parameters:`, JSON.stringify(track.parameters, null, 2))
                    
                    // 🔍 DEBUG: Special logging for Sampler devices
                    if (track.type === 'SamplerDeviceBox' || track.type === 'NanoDeviceBox') {
                        console.log(`🎹 [DEBUG-EXTRACT] Sampler track found:`)
                        console.log(`  - Type: ${track.type}`)
                        console.log(`  - Name: ${track.name}`)
                        console.log(`  - Has instrumentUUID: ${track.parameters.instrumentUUID ? 'YES' : 'NO'}`)
                        console.log(`  - Has instrumentName: ${track.parameters.instrumentName ? 'YES' : 'NO'}`)
                        if (track.parameters.instrumentUUID) {
                            console.log(`  - InstrumentUUID: ${track.parameters.instrumentUUID}`)
                            console.log(`  - InstrumentName: ${track.parameters.instrumentName}`)
                        }
                    }
                })
            }
            
            // Send secret address to tool-executor (no tool names/args visible)
            // Simulate progress during tool execution (typical song creation has ~50 tools)
            const progressInterval = setInterval(() => {
                const current = this.layout.songCreationProgress.getValue()
                if (current < 95) { // Don't go to 100% until completion
                    this.layout.songCreationProgress.setValue(Math.min(95, current + 0.5))
                }
            }, 200) // Update every 200ms with 0.5% increments
            
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
            
            // Clear progress interval
            clearInterval(progressInterval)
            
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
            
            return {
                success: result.success,
                message: result.message,
                resultSecretAddress: result.resultSecretAddress
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
            default:
                return openDAWType // Keep other types as-is (TapeDeviceBox, etc.)
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
            console.log(`🔍 [EXTRACT-TRACKS] Starting track extraction...`)
            const audioUnits = project.rootBox.audioUnits.pointerHub.incoming()
            console.log(`🔍 [EXTRACT-TRACKS] Found ${audioUnits.length} audio units`)
            
            for (const audioUnitPointer of audioUnits) {
                const audioUnit = audioUnitPointer.box as any
                console.log(`🔍 [EXTRACT-TRACKS] Processing audio unit: ${audioUnit.constructor.name}`)
                
                const inputPointer = audioUnit.input?.pointerHub?.incoming()?.at(0)
                console.log(`🔍 [EXTRACT-TRACKS] Input pointer: ${inputPointer ? 'found' : 'null'}`)
                
                if (inputPointer) {
                    const instrumentBox = inputPointer.box as any
                    console.log(`🔍 [EXTRACT-TRACKS] Instrument box: ${instrumentBox.constructor.name}`)
                    console.log(`🔍 [EXTRACT-TRACKS] Instrument name: ${instrumentBox.label?.getValue?.() || 'Unnamed'}`)
                    
                    const trackData = {
                        uuid: audioUnit.address.uuid,
                        name: instrumentBox.label?.getValue?.() || 'Unnamed',
                        type: this.translateToGenericType(instrumentBox.constructor.name),
                        parameters: this.extractBoxParameters(instrumentBox),
                        noteRegions: this.extractNoteRegions(audioUnit),
                        audioRegions: this.extractAudioRegions(audioUnit),
                        effects: this.extractTrackEffects(audioUnit),
                        drumSetSamples: this.extractDrumSetSamples(instrumentBox) // Add DrumSet sample data
                    }
                    
                    console.log(`🔍 [EXTRACT-TRACKS] Created track data:`)
                    console.log(`  - Name: ${trackData.name}`)
                    console.log(`  - Type: ${trackData.type}`)
                    console.log(`  - Parameters keys: ${Object.keys(trackData.parameters).join(', ')}`)
                    
                    tracks.push(trackData)
                } else {
                    console.log(`⚠️ [EXTRACT-TRACKS] Skipped audio unit (no input pointer): ${audioUnit.constructor.name}`)
                }
            }
            
            console.log(`🔍 [EXTRACT-TRACKS] Final result: ${tracks.length} tracks extracted`)
            
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
            
            // 🔍 NEW: Extract instrument sample information for Nano devices
            console.log(`🔍 [EXTRACT-DEBUG] Processing ${box.constructor.name}: ${box.label?.getValue?.() || 'Unnamed'}`)
            
            if (box.constructor.name === 'NanoDeviceBox') {
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
                        
                        // Check if it's a note region
                        if (region.constructor.name === 'NoteRegionBox') {
                            console.log(`🔍 [DEBUG] Found NoteRegionBox:`)
                            console.log(`  - Constructor: ${region.constructor.name}`)
                            console.log(`  - Position: ${region.position?.getValue?.() || 'undefined'}`)
                            console.log(`  - Duration: ${region.duration?.getValue?.() || 'undefined'}`)
                            console.log(`  - Events field:`, region.events)
                            console.log(`  - Events type:`, typeof region.events)
                            console.log(`  - Events constructor:`, region.events?.constructor?.name)
                            console.log(`  - Region keys:`, Object.keys(region))
                            console.log(`  - Region prototype:`, Object.getPrototypeOf(region)?.constructor?.name)
                            
                            const notes: any[] = []
                            
                            // Try to extract notes with safe error handling
                            try {
                                // Use a safer approach to extract notes
                                const extractedNotes = this.safeExtractNotesFromRegion(region)
                                notes.push(...extractedNotes)
                                console.log(`✅ Safely extracted ${extractedNotes.length} notes from region`)
                            } catch (extractError) {
                                console.warn('⚠️ Could not extract notes from region, preserving empty region:', extractError)
                                // Keep notes array empty to avoid crashes, but preserve region structure
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
    
    /**
     * Safely extract notes from a region without causing pointer errors
     */
    private safeExtractNotesFromRegion(region: any): any[] {
        const notes: any[] = []
        
        try {
            // Try to access the region's events using a different approach
            // Instead of following pointers, try to access the box graph directly
            
            // Get the events field value directly
            const eventsField = region.events
            console.log('🔍 [DEBUG-SAFE] Events field:', eventsField)
            console.log('🔍 [DEBUG-SAFE] Events field keys:', eventsField ? Object.keys(eventsField) : 'no keys')
            console.log('🔍 [DEBUG-SAFE] Events field prototype:', eventsField ? Object.getPrototypeOf(eventsField) : 'no prototype')
            
            if (!eventsField) {
                console.log('🔍 No events field found in region')
                return notes
            }
            
            // Try different ways to get the target
            console.log('🔍 [DEBUG-SAFE] eventsField.target:', eventsField.target)
            console.log('🔍 [DEBUG-SAFE] eventsField._target:', eventsField._target)
            console.log('🔍 [DEBUG-SAFE] eventsField.getValue:', typeof eventsField.getValue)
            
            // Try to get the target UUID from different possible locations
            let targetUuid = null
            
            // Method 1: PointerField targetAddress getter
            try {
                const targetAddress = eventsField.targetAddress
                console.log('🔍 [DEBUG-SAFE] Method 1 - targetAddress:', targetAddress)
                if (targetAddress && targetAddress.nonEmpty && targetAddress.nonEmpty()) {
                    targetUuid = targetAddress.unwrap().uuid
                    console.log('🔍 [DEBUG-SAFE] Method 1 - extracted UUID from targetAddress:', targetUuid)
                }
            } catch (e) {
                console.log('🔍 [DEBUG-SAFE] Method 1 failed:', e)
            }
            
            // Method 2: PointerField targetVertex getter (THE CORRECT WAY!)
            if (!targetUuid) {
                try {
                    const targetVertex = eventsField.targetVertex
                    console.log('🔍 [DEBUG-SAFE] Method 2 - targetVertex:', targetVertex)
                    console.log('🔍 [DEBUG-SAFE] Method 2 - targetVertex type:', typeof targetVertex)
                    console.log('🔍 [DEBUG-SAFE] Method 2 - targetVertex constructor:', targetVertex?.constructor?.name)
                    
                    if (targetVertex && targetVertex.nonEmpty && targetVertex.nonEmpty()) {
                        const vertex = targetVertex.unwrap()
                        console.log('🔍 [DEBUG-SAFE] Method 2 - unwrapped vertex:', vertex)
                        console.log('🔍 [DEBUG-SAFE] Method 2 - vertex.box:', vertex.box)
                        console.log('🔍 [DEBUG-SAFE] Method 2 - vertex.address:', vertex.address)
                        targetUuid = vertex.address?.uuid
                        console.log('🔍 [DEBUG-SAFE] Method 2 - extracted UUID from targetVertex:', targetUuid)
                        
                        // Now try to get the actual collection box and its events
                        if (vertex.box && targetUuid) {
                            const collection = vertex.box
                            console.log('🔍 [DEBUG-SAFE] Method 2 - collection box:', collection.constructor?.name)
                            
                            // Try to get events from collection
                            const collectionEventsPointer = collection.events?.pointerHub?.incoming()
                            console.log('🔍 [DEBUG-SAFE] Method 2 - collection events pointer:', collectionEventsPointer?.length || 0)
                            
                            if (collectionEventsPointer && collectionEventsPointer.length > 0) {
                                for (const notePointer of collectionEventsPointer) {
                                    try {
                                        const note = notePointer.box
                                        const noteData = {
                                            position: note.position?.getValue() || 0,
                                            duration: note.duration?.getValue() || 960,
                                            pitch: note.pitch?.getValue() || 60,
                                            velocity: note.velocity?.getValue() || 0.8,
                                            chance: note.chance?.getValue() || 100
                                        }
                                        notes.push(noteData)
                                        console.log('🔍 [DEBUG-SAFE] Method 2 - FOUND NOTE:', noteData)
                                    } catch (noteError) {
                                        console.warn('Warning: Could not extract note from collection:', noteError)
                                    }
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.log('🔍 [DEBUG-SAFE] Method 2 failed:', e)
                }
            }
            
            // Method 3: Try to access private fields
            if (!targetUuid) {
                try {
                    const privateTargetAddress = (eventsField as any)['#targetAddress']
                    console.log('🔍 [DEBUG-SAFE] Method 3 - #targetAddress:', privateTargetAddress)
                    if (privateTargetAddress && privateTargetAddress.nonEmpty && privateTargetAddress.nonEmpty()) {
                        targetUuid = privateTargetAddress.unwrap().uuid
                        console.log('🔍 [DEBUG-SAFE] Method 3 - extracted UUID from #targetAddress:', targetUuid)
                    }
                } catch (e) {
                    console.log('🔍 [DEBUG-SAFE] Method 3 failed:', e)
                }
            }
            
            console.log('🔍 [DEBUG-SAFE] Final target UUID:', targetUuid)
            
            if (!targetUuid) {
                console.log('🔍 No target UUID found in events field')
                return notes
            }
            
            // Find the collection box in the graph by UUID
            const project = this.project
            if (!project) {
                console.log('🔍 No current project for box graph lookup')
                return notes
            }
            
            // Look for the collection in the box graph
            const collectionOption = project.boxGraph.findBox(targetUuid)
            if (!collectionOption || collectionOption.isEmpty()) {
                console.log('🔍 Collection not found in box graph')
                return notes
            }
            
            const collection = collectionOption.unwrap()
            console.log(`🔍 Found collection: ${collection.constructor.name}`)
            console.log(`🔍 Collection keys:`, Object.keys(collection))
            
            // Now access the events field of the collection (cast to any for access)
            const collectionEventsField = (collection as any).events
            console.log(`🔍 Collection events field:`, collectionEventsField)
            console.log(`🔍 Collection events field type:`, typeof collectionEventsField)
            console.log(`🔍 Collection events field constructor:`, collectionEventsField?.constructor?.name)
            
            if (!collectionEventsField) {
                console.log('🔍 No events field in collection')
                return notes
            }
            
            // Get incoming pointers to the collection's events (notes point TO the collection)
            const notePointers = collectionEventsField.pointerHub?.incoming()
            console.log(`🔍 Note pointers from collection.events.pointerHub.incoming():`, notePointers?.length || 0)
            
            if (!notePointers || notePointers.length === 0) {
                console.log('🔍 No note pointers found in collection')
                return notes
            }
            
            console.log(`🔍 Found ${notePointers.length} note pointers`)
            
            // Extract note data
            for (const notePointer of notePointers) {
                try {
                    const note = notePointer.box
                    const noteData = {
                        position: note.position?.getValue() || 0,
                        duration: note.duration?.getValue() || 960,
                        pitch: note.pitch?.getValue() || 60,
                        velocity: note.velocity?.getValue() || 0.8,
                        chance: note.chance?.getValue() || 100
                    }
                    notes.push(noteData)
                    console.log(`✅ Extracted note: pitch=${noteData.pitch}, pos=${noteData.position}`)
                } catch (noteError) {
                    console.warn('Warning: Could not extract individual note:', noteError)
                }
            }
            
        } catch (error) {
            console.warn('Warning: Safe note extraction failed:', error)
        }
        
        return notes
    }
    
    /**
     * Extract audio region references (no actual audio data)
     */
    private extractAudioRegions(_audioUnit: any): any[] {
        // Similar to extractNoteRegions but for AudioRegionBox
        // Returns references to audio files, not the files themselves
        return []
    }
    
    /**
     * Extract DrumSet drum samples data (index, name, excluded status)
     */
    private extractDrumSetSamples(instrumentBox: any): any[] {
        try {
            // Only extract samples if this is a PlayfieldDeviceBox  
            if (instrumentBox.constructor.name !== 'PlayfieldDeviceBox') {
                return []
            }
            
            console.log('🥁 Extracting DrumSet samples from:', instrumentBox.constructor.name)
            
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
            console.warn('❌ [DEBUG] Error extracting sample file UUID:', error)
            console.warn('❌ [DEBUG] Error stack:', error instanceof Error ? error.stack : 'No stack trace available')
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
                    effects.push({
                        uuid: effect.address.uuid,
                        type: this.translateToGenericType(effect.constructor.name),
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
            
            // Back to the working approach: reconstruct project
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
        
        console.log(`🔍 [DRUMFIX-RECONSTRUCT] ========== RECONSTRUCTING PROJECT ==========`)
        console.log(`🔍 [DRUMFIX-RECONSTRUCT] Tracks to add: ${projectData.tracks?.length || 0}`)
        if (projectData.tracks) {
            projectData.tracks.forEach((t: any, i: number) => {
                console.log(`🔍 [DRUMFIX-RECONSTRUCT] Track ${i}: "${t.name}" (${t.type})`)
            })
        }
        
        const newProject = Project.new(this)
        console.log(`🔍 [DRUMFIX-RECONSTRUCT] New empty project created`)
        
        // Add tracks based on server modifications
        if (projectData.tracks) {
            for (const trackData of projectData.tracks) {
                await this.addTrackFromData(newProject, trackData)
            }
        }
        
        console.log(`🔍 [DRUMFIX-RECONSTRUCT] Project reconstruction complete`)
        
        // Handle effects separately (they modify existing tracks)
        if (projectData.tracks) {
            for (const trackData of projectData.tracks) {
                if (trackData.effects && trackData.effects.length > 0) {
                    await this.addEffectsToTrack(newProject, trackData)
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
            console.log(`🔍 [DRUMFIX-ADD-TRACK] ========== ADDING TRACK FROM DATA ==========`)
            console.log(`🔍 [DRUMFIX-ADD-TRACK] Track name: "${trackData.name}"`)
            console.log(`🔍 [DRUMFIX-ADD-TRACK] Track type: "${trackData.type}"`)
            
            const {InstrumentFactories} = await import('@opendaw/studio-core')
            console.log(`🔍 [DRUMFIX-ADD-TRACK] InstrumentFactories loaded:`, Object.keys(InstrumentFactories))
            
            let trackBox: any = null
            
            // First transaction: Create instrument and apply parameters
            project.editing.modify(() => {
                let factory
                switch (trackData.type) {
                    case 'TapeDeviceBox':
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
                        console.log(`🔍 [DRUMFIX-ADD-TRACK] Skipping AudioBusBox track: ${trackData.name}`)
                        return
                    default:
                        console.log(`🚨 [DRUMFIX-ADD-TRACK] Unknown instrument type: ${trackData.type}`)
                        console.warn(`Unknown instrument type: ${trackData.type}`)
                        return
                }
                
                console.log(`🔍 [DRUMFIX-ADD-TRACK] Factory selected:`, factory ? 'YES' : 'NO')
                console.log(`🔍 [DRUMFIX-ADD-TRACK] Creating instrument with name: "${trackData.name}"`)
                const result = project.api.createInstrument(factory, { name: trackData.name })
                console.log(`🔍 [DRUMFIX-ADD-TRACK] Instrument created successfully`)
                const instrumentBox = result.instrumentBox
                trackBox = result.trackBox // Store for MIDI notes
                
                // Apply parameters (using any type to avoid TypeScript issues)
                if (trackData.parameters) {
                    try {
                        const anyInstrumentBox = instrumentBox as any
                        
                        // Apply parameters based on instrument type
                        if (trackData.type === 'TapeDeviceBox') {
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
                    console.log(`🎵 Creating region with ${regionData.notes?.length || 0} notes at position ${regionData.position}`)
                    
                    // Create note event collection (like ProjectApi.createNoteRegion)
                    const collection = NoteEventCollectionBox.create(project.boxGraph, UUID.generate())
                    
                    // Create note region (like ProjectApi.createNoteRegion)
                    NoteRegionBox.create(project.boxGraph, UUID.generate(), box => {
                        box.position.setValue(regionData.position || 0)
                        box.duration.setValue(regionData.duration || 1920)
                        box.label.setValue("Generated Melody")
                        box.hue.setValue(ColorCodes.forTrackType(0)) // TrackType.Notes = 0
                        box.mute.setValue(false)
                        box.loopDuration.setValue(regionData.duration || 1920) // Loop sur toute la durée de la mélodie
                        box.events.refer(collection.owners)
                        box.regions.refer(trackBox.regions)
                    })
                    
                    // Add individual note events (like RecordMidi)
                    for (const noteData of regionData.notes || []) {
                        NoteEventBox.create(project.boxGraph, UUID.generate(), box => {
                            box.position.setValue(noteData.position || 0)
                            box.duration.setValue(noteData.duration || 480)
                            box.pitch.setValue(noteData.pitch || 60)
                            box.velocity.setValue(noteData.velocity || 0.8)
                            box.events.refer(collection.events)
                        })
                    }
                    
                    console.log(`✅ Created MIDI region with ${regionData.notes?.length || 0} notes`)
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
                    
                    // Add effect to track
                    const effectBox = project.api.insertEffect(targetTrack.audioEffects, factory)
                    
                    // Apply effect parameters if any
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
        // Step 1: Save locally to OPFS with user-chosen name
        await this.profileService.saveAs()
        
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
        // Switch to default view when starting from scratch
        this.switchScreen("default")
    }

    private async executeToolCallsWithSecretAddress(
        secretAddress: string,
        userId: string,
        projectId: string,
        _secretLoadingCode?: string,
        isBringUpDrums?: boolean,
        searchQuery?: string
    ): Promise<void> {
        try {
            console.log('🔧 [DEBUG] Executing tools with secure payload')
            console.log('🔧 [DEBUG] isBringUpDrums:', isBringUpDrums, 'searchQuery:', searchQuery)
            
            // Use the existing method that includes projectData
            const toolResults = await this.executeRemoteToolWithSecretAddress(secretAddress)
            
            if (toolResults.success) {
                console.log('✅ Tools executed successfully')
                
                // Send tool results back to song-creator-agent  
                const followupPayload = {
                    resultSecretAddress: toolResults.resultSecretAddress,
                    userId: userId,
                    projectId: projectId,
                    isBringUpDrums: isBringUpDrums || false,
                    searchQuery: searchQuery || ''
                };
                
                console.log('🔧 [DEBUG] Sending follow-up to song-creator-agent:', JSON.stringify(followupPayload, null, 2));
                
                const followupResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/router`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY || ''}`,
                        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY || ''
                    },
                    body: JSON.stringify({
                        route: 'song-creator-agent',
                        ...followupPayload
                    })
                })
                
                if (followupResponse.ok) {
                    const followupResult = await followupResponse.json()
                    console.log('✅ Song creator follow-up completed:', followupResult.message)
                    
                    // Check if song-creator wants to execute more tools (iterative like chatbot)
                    if (followupResult.success && followupResult.send_to_execution && followupResult.secretAddress) {
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
                            followupResult.searchQuery || searchQuery
                        )
                    } else {
                        console.log('🎵 Song creator finished - no more tools to execute')
                    }
                } else {
                    console.error('❌ Song creator follow-up failed:', followupResponse.status)
                }
            } else {
                console.error('❌ Tool execution failed:', toolResults.message)
            }
            
        } catch (error) {
            console.error('❌ Tool execution error:', error)
        }
    }

    async handleSongPrompt(prompt: string): Promise<void> {
        console.log('🎵 Song prompt received:', prompt)
        
        try {
            // Start loading state
            this.layout.isSongCreating.setValue(true)
            this.layout.songCreationProgress.setValue(0)
            
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
            
            // Call song-creator-agent through router
            console.log('🔧 [DEBUG] Calling song-creator-agent with:', { message: prompt, userId, projectId })
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
                        route: 'song-creator-agent',
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
            
            if (result.success && result.send_to_execution) {
                // Handle tool execution similar to chatbot
                console.log('🔧 [DEBUG] Song creator returned tools to execute')
                console.log('🔧 [DEBUG] result.isBringUpDrums:', result.isBringUpDrums, 'result.searchQuery:', result.searchQuery)
                
                if (result.secretAddress) {
                    // Execute server-side tools via tool-executor with progress tracking
                    console.log('🔧 [DEBUG] Calling executeToolCallsWithSecretAddress with isBringUpDrums:', result.isBringUpDrums, 'searchQuery:', result.searchQuery)
                    await this.executeToolCallsWithSecretAddress(
                        result.secretAddress,
                        userId,
                        projectId,
                        result.secretLoadingCode,
                        result.isBringUpDrums,
                        result.searchQuery
                    )
                }
                
                // Complete loading and hide prompter after delay (only after ALL iterations are done)
                console.log('🎵 All song creation iterations completed')
                this.layout.songCreationProgress.setValue(100)
                setTimeout(() => {
                    this.hidePrompter()
                }, 1000) // Wait 1 second at 100%
            } else if (result.success) {
                console.log('✅ Song creation completed:', result.message)
                this.layout.songCreationProgress.setValue(100)
                setTimeout(() => {
                    this.hidePrompter()
                }, 1000) // Wait 1 second at 100%
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
}