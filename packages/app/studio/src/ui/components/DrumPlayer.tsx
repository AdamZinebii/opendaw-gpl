import {Lifecycle, UUID} from "@opendaw/lib-std"
import {StudioService} from "@/service/StudioService"
import {PPQN, dbToGain} from "@opendaw/lib-dsp"
import {createElement} from "@opendaw/lib-jsx"
import {AudioData} from "@opendaw/studio-adapters"

interface MidiNote {
    position: number
    duration: number
    pitch: number
    velocity: number
}

interface DrumAssignment {
    [midiNote: string]: string // e.g., "60": "https://...Kick.mid"
}

interface DrumPlayerProps {
    lifecycle: Lifecycle
    assignment: DrumAssignment
    studioService: StudioService | null
}

export const DrumPlayer = ({lifecycle: _lifecycle, assignment, studioService}: DrumPlayerProps) => {
    let isPlaying = false
    let allMidiNotes: MidiNote[] = []
    let drumSamples: Map<number, AudioData> = new Map() // MIDI note -> loaded sample
    
    // Extract BPM from assignment URLs (e.g., "Pop-120BPM_4" -> 120)
    const extractBPMFromAssignment = (assignment: DrumAssignment): number => {
        // Get the first URL to extract BPM from folder name
        const firstUrl = Object.values(assignment)[0]
        if (!firstUrl) return 120 // Default fallback
        
        // Match pattern like "Pop-120BPM_4" or "HipHop-83BPM_5"
        const bpmMatch = firstUrl.match(/(\d+)BPM/i)
        if (bpmMatch && bpmMatch[1]) {
            const bpm = parseInt(bpmMatch[1])
            console.log(`🎵 [DrumPlayer] Extracted BPM: ${bpm} from ${firstUrl}`)
            return bpm
        }
        
        console.warn(`⚠️ [DrumPlayer] Could not extract BPM from ${firstUrl}, using default 120`)
        return 120 // Default fallback
    }
    
    const drumBPM = extractBPMFromAssignment(assignment)
    const secondsPerQuarter = 60 / drumBPM // Calculate timing based on extracted BPM
    
    const canvas = <canvas width="400" height="32" /> as HTMLCanvasElement
    const playButton = <button class="drum-play-btn">
        <svg class="play-icon" width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M8 5v14l11-7z" fill="currentColor"/>
        </svg>
        <svg class="pause-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" style="display: none">
            <rect x="6" y="4" width="4" height="16" fill="currentColor"/>
            <rect x="14" y="4" width="4" height="16" fill="currentColor"/>
        </svg>
    </button> as HTMLButtonElement
    
    const statusButton = <button class="drum-status-btn" title="Drum assignment status">
        <span class="status-text">Loading...</span>
        <svg class="status-icon" width="10" height="10" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
            <path d="M12 6v6l4 2" stroke="currentColor" stroke-width="2"/>
        </svg>
    </button> as HTMLButtonElement
    
    const bpmDisplay = <div class="drum-bpm-display" title={`Detected tempo: ${drumBPM} BPM`}>
        <span class="bpm-text">{drumBPM} BPM</span>
    </div> as HTMLDivElement
    
    const element = (
        <div class="drum-player-component">
            <div class="drum-controls">
                {playButton}
                {statusButton}
                {bpmDisplay}
                <div class="drum-canvas-container">
                    {canvas}
                </div>
            </div>
            <style>{`
                .drum-player-component {
                    background: rgba(0, 0, 0, 0.15);
                    backdrop-filter: blur(20px);
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    border-radius: 12px;
                    padding: 12px;
                    margin: 8px 0;
                    box-shadow: 
                        0 4px 16px rgba(0, 0, 0, 0.2),
                        0 1px 4px rgba(0, 0, 0, 0.1),
                        inset 0 1px 0 rgba(255, 255, 255, 0.1);
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    position: relative;
                    overflow: hidden;
                    width: 280px;
                    min-width: 280px;
                    height: 80px;
                    min-height: 80px;
                    flex-shrink: 0;
                    display: block !important;
                    visibility: visible !important;
                    opacity: 1 !important;
                }
                
                .drum-player-component::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    height: 1px;
                    background: linear-gradient(90deg, 
                        transparent, 
                        rgba(255,255,255,0.2) 50%, 
                        transparent);
                }

                .drum-player-component:hover {
                    transform: translateY(-2px);
                    box-shadow: 
                        0 12px 40px rgba(0, 0, 0, 0.25),
                        0 4px 12px rgba(0, 0, 0, 0.15),
                        inset 0 1px 0 rgba(255, 255, 255, 0.15);
                }

                .drum-controls {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .drum-play-btn {
                    width: 32px;
                    height: 32px;
                    border-radius: 50%;
                    border: none;
                    background: rgba(0, 0, 0, 0.2);
                    backdrop-filter: blur(10px);
                    color: #ff6b35;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    box-shadow: 
                        0 2px 8px rgba(0, 0, 0, 0.15),
                        inset 0 1px 0 rgba(255, 255, 255, 0.1);
                    position: relative;
                    overflow: hidden;
                }

                .drum-play-btn::before {
                    content: '';
                    position: absolute;
                    inset: 0;
                    border-radius: 50%;
                    padding: 1px;
                    background: linear-gradient(135deg, 
                        rgba(255,107,53,0.3) 0%, 
                        transparent 50%,
                        rgba(0,0,0,0.2) 100%);
                    mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
                    mask-composite: xor;
                }

                .drum-play-btn:hover {
                    transform: scale(1.08);
                    background: rgba(255, 107, 53, 0.15);
                    color: #ff8c69;
                    box-shadow: 
                        0 6px 20px rgba(255, 107, 53, 0.3),
                        inset 0 1px 0 rgba(255, 255, 255, 0.2);
                }

                .drum-play-btn:active {
                    transform: scale(0.95);
                }

                .drum-play-btn.playing {
                    background: rgba(255, 107, 53, 0.25);
                    color: #ff6b35;
                    box-shadow: 
                        0 4px 12px rgba(255, 107, 53, 0.4),
                        inset 0 1px 0 rgba(255, 255, 255, 0.2);
                }

                .play-icon, .pause-icon {
                    width: 12px;
                    height: 12px;
                    fill: currentColor;
                    transition: all 0.2s ease;
                }

                .playing .play-icon {
                    display: none;
                }

                .playing .pause-icon {
                    display: block !important;
                }

                .drum-status-btn {
                    height: 32px;
                    padding: 0 12px;
                    border-radius: 16px;
                    border: none;
                    background: rgba(0, 0, 0, 0.15);
                    backdrop-filter: blur(10px);
                    color: rgba(255, 255, 255, 0.8);
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 11px;
                    font-weight: 500;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    box-shadow: 
                        0 2px 8px rgba(0, 0, 0, 0.15),
                        inset 0 1px 0 rgba(255, 255, 255, 0.1);
                    position: relative;
                    overflow: hidden;
                }

                .drum-status-btn:hover {
                    background: rgba(0, 0, 0, 0.2);
                    transform: translateY(-1px);
                    box-shadow: 
                        0 4px 12px rgba(0, 0, 0, 0.25),
                        inset 0 1px 0 rgba(255, 255, 255, 0.15);
                }

                .drum-status-btn:active {
                    transform: translateY(0);
                }

                .status-text {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    white-space: nowrap;
                    text-overflow: ellipsis;
                    overflow: hidden;
                    max-width: 80px;
                }

                .status-icon {
                    width: 10px;
                    height: 10px;
                    fill: none;
                    stroke: currentColor;
                    opacity: 0.7;
                    transition: all 0.2s ease;
                }

                .drum-status-btn:hover .status-icon {
                    opacity: 1;
                }
                
                .drum-bpm-display {
                    display: flex;
                    align-items: center;
                    padding: 4px 8px;
                    background: rgba(255, 140, 66, 0.1);
                    border: 1px solid rgba(255, 140, 66, 0.3);
                    border-radius: 6px;
                    margin-left: 8px;
                }
                
                .bpm-text {
                    font-size: 11px;
                    font-weight: 600;
                    color: #ff8c42;
                    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
                    letter-spacing: 0.5px;
                }

                .drum-canvas-container {
                    flex: 1;
                    background: rgba(0, 0, 0, 0.1);
                    border: 1px solid rgba(255, 255, 255, 0.05);
                    border-radius: 8px;
                    padding: 6px;
                    position: relative;
                    overflow: hidden;
                }

                .drum-canvas {
                    width: 100%;
                    height: 32px;
                    border-radius: 6px;
                    background: linear-gradient(135deg, 
                        rgba(255, 107, 53, 0.1) 0%, 
                        rgba(139, 69, 19, 0.05) 100%);
                    display: block;
                    cursor: pointer;
                    transition: all 0.3s ease;
                }

                .drum-canvas:hover {
                    background: linear-gradient(135deg, 
                        rgba(255, 107, 53, 0.15) 0%, 
                        rgba(139, 69, 19, 0.08) 100%);
                }

                .status-loading {
                    color: #fbbf24;
                }

                .status-ready {
                    color: #10b981;
                }

                .status-error {
                    color: #ef4444;
                }
            `}</style>
        </div>
    ) as HTMLElement

    // Track active sources for stop functionality
    let activeSources: AudioBufferSourceNode[] = []
    let playbackTimeout: ReturnType<typeof setTimeout> | null = null

    // Toggle play/pause states using CSS classes
    const setPlayIcon = () => {
        playButton.classList.remove('playing')
    }
    
    const setPauseIcon = () => {
        playButton.classList.add('playing')
    }

    // Update status display
    const updateStatus = (text: string, className: string = '') => {
        const statusText = statusButton.querySelector('.status-text') as HTMLElement
        if (statusText) {
            statusText.textContent = text
            statusButton.className = `drum-status-btn ${className}`
        }
    }

    // Load and parse all MIDI files from assignment
    const loadDrumAssignment = async () => {
        try {
            console.log('🥁 Loading drum assignment...')
            updateStatus('Loading...', 'status-loading')
            
            allMidiNotes = []
            const midiPromises: Promise<void>[] = []
            
            // Load each MIDI file in the assignment
            for (const [midiNoteStr, midiUrl] of Object.entries(assignment)) {
                const midiNote = parseInt(midiNoteStr)
                
                const promise = (async () => {
                    try {
                        console.log(`🎵 Loading MIDI for note ${midiNote}: ${midiUrl}`)
                        
                        const response = await fetch(midiUrl)
                        if (!response.ok) {
                            throw new Error(`Failed to load MIDI: ${response.status}`)
                        }
                        
                        const arrayBuffer = await response.arrayBuffer()
                        const midiData = new Uint8Array(arrayBuffer)
                        
                        // Parse MIDI and assign to the specific MIDI note
                        const notes = await parseMidiData(midiData)
                        
                        // Override the pitch of all notes to match the assigned MIDI note
                        const assignedNotes = notes.map(note => ({
                            ...note,
                            pitch: midiNote // Force all notes to play on the assigned channel
                        }))
                        
                        allMidiNotes.push(...assignedNotes)
                        console.log(`✅ Loaded ${assignedNotes.length} notes for MIDI ${midiNote}`)
                        
                    } catch (error) {
                        console.error(`❌ Failed to load MIDI for note ${midiNote}:`, error)
                    }
                })()
                
                midiPromises.push(promise)
            }
            
            // Wait for all MIDI files to load
            await Promise.all(midiPromises)
            
            console.log(`✅ Total loaded notes: ${allMidiNotes.length}`)
            renderDrums()
            
            // Load Playfield drum samples
            await loadPlayfieldSamples()
            
            updateStatus(`${Object.keys(assignment).length} drums`, 'status-ready')
            console.log('✅ Drum assignment loading completed successfully')
            
        } catch (error) {
            console.error('❌ Failed to load drum assignment:', error)
            updateStatus('Error', 'status-error')
        }
    }

    // Parse MIDI data using working custom parser (no library dependency)
    const parseMidiData = async (data: Uint8Array): Promise<MidiNote[]> => {
        console.log('🎵 Custom MIDI parser starting...')
        const notes: MidiNote[] = []
        
        try {
            // Read MIDI header to get actual time division
            if (data.length < 14) {
                throw new Error('MIDI file too small')
            }
            
            // Check MIDI header "MThd"
            if (data[0] !== 0x4D || data[1] !== 0x54 || data[2] !== 0x68 || data[3] !== 0x64) {
                throw new Error('Invalid MIDI header')
            }
            
            // Get actual time division from header (bytes 12-13)
            const timeDivision = (data[12] << 8) | data[13]
            console.log(`🥁 MIDI time division: ${timeDivision} ticks per quarter note`)
            
            // Skip MIDI header (14 bytes)
            let pos = 14
            
            while (pos < data.length - 8) {
                // Look for track header "MTrk"
                if (data[pos] === 0x4D && data[pos + 1] === 0x54 && 
                    data[pos + 2] === 0x72 && data[pos + 3] === 0x6B) {
                    
                    const trackLength = (data[pos + 4] << 24) | (data[pos + 5] << 16) | 
                                      (data[pos + 6] << 8) | data[pos + 7]
                    const trackStart = pos + 8
                    const trackEnd = trackStart + trackLength
                    
                    console.log(`🎶 Processing track: ${trackLength} bytes`)
                    
                    // Parse track events
                    let trackPos = trackStart
                    let currentTime = 0
                    let runningStatus = 0
                    const activeNotes = new Map<number, {startTime: number, velocity: number}>()
                    
                    while (trackPos < trackEnd) {
                        // Read variable-length delta time
                        const deltaResult = readVariableLength(data, trackPos)
                        const deltaTime = deltaResult.value
                        trackPos = deltaResult.nextPos
                        currentTime += deltaTime
                        
                        if (trackPos >= trackEnd) break
                        
                        // Read status byte
                        let status = data[trackPos]
                        
                        // Handle running status
                        if (status < 0x80) {
                            status = runningStatus
                        } else {
                            runningStatus = status
                            trackPos++
                        }
                        
                        // Process MIDI events
                        const messageType = status & 0xF0
                        
                        if (messageType === 0x90) { // Note On
                            if (trackPos + 1 >= trackEnd) break
                            const pitch = data[trackPos++]
                            const velocity = data[trackPos++]
                            
                            if (velocity > 0) {
                                // Real note on
                                activeNotes.set(pitch, {
                                    startTime: currentTime,
                                    velocity: velocity / 127
                                })
                            } else {
                                // Note off (velocity 0)
                                const noteStart = activeNotes.get(pitch)
                                if (noteStart) {
                                    const duration = Math.max(PPQN.Quarter / 8, currentTime - noteStart.startTime)
                                    notes.push({
                                        position: Math.floor(noteStart.startTime * PPQN.Quarter / timeDivision), // Convert from MIDI ticks to PPQN
                                        duration: Math.floor(duration * PPQN.Quarter / timeDivision),
                                        pitch: pitch,
                                        velocity: noteStart.velocity
                                    })
                                    activeNotes.delete(pitch)
                                }
                            }
                            
                        } else if (messageType === 0x80) { // Note Off
                            if (trackPos + 1 >= trackEnd) break
                            const pitch = data[trackPos++]
                            trackPos++ // Skip velocity
                            
                            const noteStart = activeNotes.get(pitch)
                            if (noteStart) {
                                const duration = Math.max(PPQN.Quarter / 8, currentTime - noteStart.startTime)
                                notes.push({
                                    position: Math.floor(noteStart.startTime * PPQN.Quarter / timeDivision),
                                    duration: Math.floor(duration * PPQN.Quarter / timeDivision),
                                    pitch: pitch,
                                    velocity: noteStart.velocity
                                })
                                activeNotes.delete(pitch)
                            }
                            
                        } else if (messageType === 0xB0) { // Control Change
                            if (trackPos + 1 >= trackEnd) break
                            trackPos += 2 // Skip controller and value
                            
                        } else if (messageType === 0xC0) { // Program Change
                            if (trackPos >= trackEnd) break
                            trackPos++ // Skip program number
                            
                        } else if (messageType === 0xE0) { // Pitch Bend
                            if (trackPos + 1 >= trackEnd) break
                            trackPos += 2 // Skip LSB and MSB
                            
                        } else if (status === 0xFF) { // Meta Event
                            if (trackPos >= trackEnd) break
                            trackPos++ // Skip meta type
                            const lengthResult = readVariableLength(data, trackPos)
                            const length = lengthResult.value
                            trackPos = lengthResult.nextPos + length
                            
                        } else if (status === 0xF0 || status === 0xF7) { // SysEx
                            const lengthResult = readVariableLength(data, trackPos)
                            const length = lengthResult.value
                            trackPos = lengthResult.nextPos + length
                            
                        } else {
                            // Skip unknown event
                            trackPos++
                        }
                    }
                    
                    // Handle remaining active notes
                    for (const [pitch, noteData] of activeNotes) {
                        notes.push({
                            position: Math.floor(noteData.startTime * PPQN.Quarter / timeDivision),
                            duration: PPQN.Quarter / 2, // Default quarter note
                            pitch: pitch,
                            velocity: noteData.velocity
                        })
                    }
                    
                    pos = trackEnd
                } else {
                    pos++
                }
            }
            
            console.log(`✅ Custom parser extracted ${notes.length} notes`)
            if (notes.length > 0) {
                console.log('📋 First few notes:', notes.slice(0, 3))
            }
            
        } catch (error) {
            console.error('Custom MIDI parsing error:', error)
        }
        
        return notes.sort((a, b) => a.position - b.position)
    }

    // Helper function to read MIDI variable-length quantity
    const readVariableLength = (data: Uint8Array, pos: number): {value: number, nextPos: number} => {
        let value = 0
        let byte: number
        
        do {
            if (pos >= data.length) break
            byte = data[pos++]
            value = (value << 7) | (byte & 0x7F)
        } while (byte & 0x80)
        
        return { value, nextPos: pos }
    }

    // Load Playfield drum samples (TR-909 style samples)
    const loadPlayfieldSamples = async () => {
        if (!studioService) return
        
        try {
            console.log('🥁 Loading Playfield drum samples...')
            
            // TR-909 sample UUIDs (from InstrumentFactories.ts)
            const tr909Samples = {
                60: UUID.parse("8bb2c6e8-9a6d-4d32-b7ec-1263594ef367"), // 909 Bassdrum
                61: UUID.parse("0017fa18-a5eb-4d9d-b6f2-e2ddd30a3010"), // 909 Snare
                62: UUID.parse("28d14cb9-1dc6-4193-9dd7-4e881f25f520"), // 909 Low Tom
                63: UUID.parse("21f92306-d6e7-446c-a34b-b79620acfefc"), // 909 Mid Tom
                64: UUID.parse("ad503883-8a72-46ab-a05b-a84149953e17"), // 909 High Tom
                65: UUID.parse("cfee850b-7658-4d08-9e3b-79d196188504"), // 909 Rimshot
                66: UUID.parse("32a6f36f-06eb-4b84-bb57-5f51103eb9e6"), // 909 Clap
                67: UUID.parse("e0ac4b39-23fb-4a56-841d-c9e0ff440cab"), // 909 Closed Hat
                68: UUID.parse("51c5eea4-391c-4743-896a-859692ec1105"), // 909 Open Hat
                69: UUID.parse("42a56ff6-89b6-4f2e-8a66-5a41d316f4cb"), // 909 Crash
                70: UUID.parse("87cde966-b799-4efc-a994-069e703478d3"), // 909 Ride
            }
            
            // Load samples for the MIDI notes used in assignment
            const samplePromises: Promise<void>[] = []
            
            for (const midiNoteStr of Object.keys(assignment)) {
                const midiNote = parseInt(midiNoteStr)
                const sampleUUID = tr909Samples[midiNote as keyof typeof tr909Samples]
                
                if (sampleUUID) {
                    const promise = (async () => {
                        try {
                            console.log(`🎵 Loading sample for MIDI ${midiNote}...`)
                            
                            const sampleLoader = studioService.sampleManager.getOrCreate(sampleUUID)
                            
                            // Wait for sample to load
                            const sampleData = await new Promise<AudioData>((resolve, reject) => {
                                const checkSample = () => {
                                    if (sampleLoader.data.nonEmpty()) {
                                        resolve(sampleLoader.data.unwrap())
                                    } else {
                                        setTimeout(checkSample, 100)
                                    }
                                }
                                checkSample()
                                setTimeout(() => reject(new Error('Sample load timeout')), 5000)
                            })
                            
                            drumSamples.set(midiNote, sampleData)
                            console.log(`✅ Loaded sample for MIDI ${midiNote}`)
                            
                        } catch (error) {
                            console.error(`❌ Failed to load sample for MIDI ${midiNote}:`, error)
                        }
                    })()
                    
                    samplePromises.push(promise)
                }
            }
            
            await Promise.all(samplePromises)
            console.log(`✅ Loaded ${drumSamples.size} drum samples`)
            
        } catch (error) {
            console.error('❌ Failed to load Playfield samples:', error)
        }
    }

    // Render drum pattern on canvas (optimized for compact size)
    const renderDrums = () => {
        console.log('🎨 Rendering drum canvas with', allMidiNotes.length, 'notes')
        const ctx = canvas.getContext('2d')
        if (!ctx || allMidiNotes.length === 0) {
            console.log('❌ Canvas context unavailable or no notes to render')
            return
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height)
        
        // Group notes by pitch (drum type)
        const notesByPitch = new Map<number, MidiNote[]>()
        allMidiNotes.forEach(note => {
            if (!notesByPitch.has(note.pitch)) {
                notesByPitch.set(note.pitch, [])
            }
            notesByPitch.get(note.pitch)!.push(note)
        })
        
        const pitches = Array.from(notesByPitch.keys()).sort((a, b) => b - a) // High to low
        const maxTime = Math.max(...allMidiNotes.map(n => n.position + n.duration))
        const timeScale = (canvas.width - 4) / maxTime
        const pitchHeight = Math.max(3, (canvas.height - 4) / pitches.length)
        
        // Draw drum hits with different colors for different drums
        const drumColors = [
            'rgba(255, 107, 53, 0.8)',   // Orange - Kick
            'rgba(255, 193, 7, 0.8)',    // Yellow - Snare  
            'rgba(76, 175, 80, 0.8)',    // Green - Hi-hat
            'rgba(33, 150, 243, 0.8)',   // Blue - Tom
            'rgba(156, 39, 176, 0.8)',   // Purple - Crash
            'rgba(244, 67, 54, 0.8)',    // Red - Other
        ]
        
        pitches.forEach((pitch, pitchIndex) => {
            const notes = notesByPitch.get(pitch)!
            const y = 2 + pitchIndex * pitchHeight
            const color = drumColors[pitchIndex % drumColors.length]
            
            notes.forEach(note => {
                const x = Math.max(2, note.position * timeScale + 2)
                const width = Math.max(2, note.duration * timeScale)
                const height = Math.max(2, pitchHeight * 0.8)
                
                // Create gradient for each drum hit
                const noteGradient = ctx.createLinearGradient(x, y, x + width, y + height)
                noteGradient.addColorStop(0, color)
                noteGradient.addColorStop(1, color.replace('0.8', '0.5'))
                
                ctx.fillStyle = noteGradient
                ctx.fillRect(x, y, width, height)
                
                // Add subtle glow for drum hits
                ctx.shadowColor = color.replace('0.8', '0.4')
                ctx.shadowBlur = 1
                ctx.fillRect(x, y, width, height)
                ctx.shadowBlur = 0
            })
        })
    }

    // Playfield-style drum playback (standalone, no tracks)
    const playDrumsWithPlayfieldRenderer = async () => {
        if (!studioService || allMidiNotes.length === 0) return
        
        if (isPlaying) {
            // Stop current playback
            activeSources.forEach(source => {
                try { source.stop() } catch (e) { /* May already be stopped */ }
            })
            activeSources = []
            if (playbackTimeout) {
                clearTimeout(playbackTimeout)
                playbackTimeout = null
            }
            
            isPlaying = false
            setPlayIcon()
            return
        }
        
        try {
            isPlaying = true
            setPauseIcon()
            console.log('🥁 Playing (Playfield Renderer)...')
            
            const audioContext = studioService.audioContext
            if (!audioContext) {
                throw new Error('AudioContext not available')
            }
            
            // Create master gain for all drum voices (match Playfield volume)
            const masterGain = audioContext.createGain()
            masterGain.gain.value = dbToGain(0.0) // Playfield default volume (0 dB)
            masterGain.connect(audioContext.destination)
            
            // Create voice for each drum hit using Playfield-style processing
            const createPlayfieldVoice = (note: MidiNote) => {
                const startTime = audioContext.currentTime + (note.position / PPQN.Quarter) * secondsPerQuarter
                const duration = (note.duration / PPQN.Quarter) * secondsPerQuarter
                
                // Get the loaded sample for this MIDI note
                const sampleData = drumSamples.get(note.pitch)
                if (!sampleData) {
                    console.warn(`No sample loaded for MIDI note ${note.pitch}`)
                    return
                }
                
                // Create AudioBufferSourceNode for drum sample playback
                const source = audioContext.createBufferSource()
                const voiceGain = audioContext.createGain()
                
                // Convert AudioData to AudioBuffer
                const audioBuffer = audioContext.createBuffer(
                    sampleData.numberOfChannels,
                    sampleData.numberOfFrames,
                    sampleData.sampleRate
                )
                
                for (let channel = 0; channel < sampleData.numberOfChannels; channel++) {
                    const channelData = audioBuffer.getChannelData(channel)
                    const sourceData = sampleData.frames[channel]
                    for (let i = 0; i < sampleData.numberOfFrames; i++) {
                        channelData[i] = sourceData[i]
                    }
                }
                
                source.buffer = audioBuffer
                // Playfield drums typically don't pitch shift - they play at original pitch
                source.playbackRate.value = 1.0
                
                // Playfield-style envelope (quick attack, natural decay)
                const peakGain = note.velocity * 1.0 // Full velocity scaling for drums
                
                // Simple envelope for drum hits
                voiceGain.gain.setValueAtTime(0, startTime)
                voiceGain.gain.linearRampToValueAtTime(peakGain, startTime + 0.001) // Very quick attack
                voiceGain.gain.exponentialRampToValueAtTime(0.001, startTime + Math.max(0.1, duration)) // Natural decay
                
                // Connect audio graph
                source.connect(voiceGain)
                voiceGain.connect(masterGain)
                
                // Schedule playback
                source.start(startTime)
                source.stop(startTime + Math.max(0.1, duration))
                
                // Track for cleanup
                activeSources.push(source)
                
                source.onended = () => {
                    const index = activeSources.indexOf(source)
                    if (index > -1) activeSources.splice(index, 1)
                }
            }
            
            // Create a voice for each drum hit
            allMidiNotes.forEach(createPlayfieldVoice)
            
            // Calculate total playback duration using extracted BPM
            const maxEndTime = Math.max(...allMidiNotes.map(n => n.position + n.duration))
            const totalDuration = (maxEndTime / PPQN.Quarter) * secondsPerQuarter * 1000 + 500 // Add buffer time
            
            // Reset state when playback ends
            playbackTimeout = setTimeout(() => {
                isPlaying = false
                setPlayIcon()
                console.log(`✅ Playfield rendering complete: ${allMidiNotes.length} drum hits`)
                activeSources = []
                playbackTimeout = null
            }, Math.min(totalDuration, 15000)) // Max 15 seconds
            
        } catch (error) {
            console.error('Playfield rendering failed:', error)
            isPlaying = false
            setPlayIcon()
            console.log('❌ Drum playback failed')
        }
    }

    // Setup event listeners
    playButton.addEventListener('click', playDrumsWithPlayfieldRenderer)
    statusButton.addEventListener('click', () => {
        console.log('🥁 Drum assignment:', assignment)
        console.log('🎵 Loaded notes:', allMidiNotes.length)
        console.log('🔊 Loaded samples:', drumSamples.size)
    })
    
    // Initialize
    loadDrumAssignment()
    
    // Debug: Log component creation
    console.log('🥁 DrumPlayer component created:', {
        element,
        assignment: Object.keys(assignment).length + ' drums',
        className: element.className
    })
    
    return element
}
