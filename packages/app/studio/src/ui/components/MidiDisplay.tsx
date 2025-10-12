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

interface MidiDisplayProps {
    lifecycle: Lifecycle
    url: string
    studioService: StudioService | null
}

export const MidiDisplay = ({lifecycle: _lifecycle, url, studioService}: MidiDisplayProps) => {
    console.log('🎼 ========== MIDI DISPLAY COMPONENT INIT START ==========')
    console.log('🎼 URL:', url)
    console.log('🎼 Has lifecycle?', !!_lifecycle)
    console.log('🎼 Has studioService?', !!studioService)
    console.log('🎼 StudioService type:', studioService?.constructor?.name)
    
    let isPlaying = false
    let midiNotes: MidiNote[] = []
    let tempTrackName: string | null = null
    // Available instrument samples
    const availableSamples = [
        { uuid: "c1678daa-4a47-4cba-b88f-4f4e384663c3", name: "Rhode" },
        { uuid: "369a45fc-0c82-4847-a16b-559897067b84", name: "Piano" },
        { uuid: "79e17954-6e14-4915-954c-d5fb640f12f8", name: "Acoustic Guitar" },
        { uuid: "696057c5-f528-4fbf-8bb5-9b86bb60a4fc", name: "Electric Guitar" },
        { uuid: "5f4d250a-bbe1-44b2-bbd8-371d5cbd0c0a", name: "Violin" },
        { uuid: "fe924b7f-55dc-4d60-9b89-5ca7d765355d", name: "Cello" },
        { uuid: "4ce61f3d-7a8d-49b6-b14f-3cc6189175f7", name: "Trumpet" },
        { uuid: "f136af58-8a85-4857-b511-d7828d32a1a7", name: "Saxophone" }
    ]
    let currentSampleIndex = 0
    let currentSampleUUID = UUID.parse(availableSamples[currentSampleIndex].uuid)
    let currentSampleName = availableSamples[currentSampleIndex].name

    const canvas = <canvas width="400" height="32" /> as HTMLCanvasElement
    const playButton = <button class="midi-play-btn">
        <svg class="play-icon" width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M8 5v14l11-7z" fill="currentColor"/>
        </svg>
        <svg class="pause-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" style="display: none">
            <rect x="6" y="4" width="4" height="16" fill="currentColor"/>
            <rect x="14" y="4" width="4" height="16" fill="currentColor"/>
        </svg>
    </button> as HTMLButtonElement
    
    const instrumentButton = <button class="midi-instrument-btn" title="Click to cycle through instruments">
        <span class="instrument-name">{currentSampleName}</span>
        <svg class="instrument-icon" width="10" height="10" viewBox="0 0 24 24" fill="none">
            <path d="M7 10l5 5 5-5z" fill="currentColor"/>
        </svg>
    </button> as HTMLButtonElement
    
    const element = (
        <div class="midi-player-component">
            <div class="midi-controls">
                {playButton}
                {instrumentButton}
                <div class="midi-canvas-container">
                    {canvas}
                </div>
            </div>
            <style>{`
                .midi-player-component {
                    background: rgba(255, 255, 255, 0.08);
                    backdrop-filter: blur(20px);
                    border: 1px solid rgba(255, 255, 255, 0.12);
                    border-radius: 12px;
                    padding: 12px;
                    margin: 8px 0;
                    box-shadow: 
                        0 4px 16px rgba(0, 0, 0, 0.1),
                        0 1px 4px rgba(0, 0, 0, 0.06),
                        inset 0 1px 0 rgba(255, 255, 255, 0.15);
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
                
                .midi-player-component::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    height: 1px;
                    background: linear-gradient(90deg, 
                        transparent, 
                        rgba(255,255,255,0.3) 50%, 
                        transparent);
                }

                .midi-player-component:hover {
                    transform: translateY(-2px);
                    box-shadow: 
                        0 12px 40px rgba(0, 0, 0, 0.15),
                        0 4px 12px rgba(0, 0, 0, 0.1),
                        inset 0 1px 0 rgba(255, 255, 255, 0.2);
                }

                .midi-controls {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .midi-play-btn {
                    width: 32px;
                    height: 32px;
                    border-radius: 50%;
                    border: none;
                    background: rgba(255, 255, 255, 0.15);
                    backdrop-filter: blur(10px);
                    color: white;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    box-shadow: 
                        0 2px 8px rgba(0, 0, 0, 0.12),
                        inset 0 1px 0 rgba(255, 255, 255, 0.2);
                    position: relative;
                    overflow: hidden;
                }

                .midi-play-btn::before {
                    content: '';
                    position: absolute;
                    inset: 0;
                    border-radius: 50%;
                    padding: 1px;
                    background: linear-gradient(135deg, 
                        rgba(255,255,255,0.2) 0%, 
                        transparent 50%,
                        rgba(0,0,0,0.1) 100%);
                    mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
                    mask-composite: xor;
                }

                .midi-play-btn:hover {
                    transform: scale(1.08);
                    background: rgba(255, 255, 255, 0.2);
                    box-shadow: 
                        0 6px 20px rgba(0, 0, 0, 0.2),
                        inset 0 1px 0 rgba(255, 255, 255, 0.3);
                }

                .midi-play-btn:active {
                    transform: scale(0.95);
                }

                .midi-play-btn.playing {
                    background: rgba(74, 222, 128, 0.2);
                    box-shadow: 
                        0 4px 12px rgba(74, 222, 128, 0.3),
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

                .midi-instrument-btn {
                    height: 32px;
                    padding: 0 12px;
                    border-radius: 16px;
                    border: none;
                    background: rgba(255, 255, 255, 0.1);
                    backdrop-filter: blur(10px);
                    color: white;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 11px;
                    font-weight: 500;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    box-shadow: 
                        0 2px 8px rgba(0, 0, 0, 0.12),
                        inset 0 1px 0 rgba(255, 255, 255, 0.15);
                    position: relative;
                    overflow: hidden;
                }

                .midi-instrument-btn:hover {
                    background: rgba(255, 255, 255, 0.15);
                    transform: translateY(-1px);
                    box-shadow: 
                        0 4px 12px rgba(0, 0, 0, 0.2),
                        inset 0 1px 0 rgba(255, 255, 255, 0.2);
                }

                .midi-instrument-btn:active {
                    transform: translateY(0);
                }

                .instrument-name {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    white-space: nowrap;
                    text-overflow: ellipsis;
                    overflow: hidden;
                    max-width: 60px;
                }

                .instrument-icon {
                    width: 10px;
                    height: 10px;
                    fill: currentColor;
                    opacity: 0.7;
                    transition: all 0.2s ease;
                }

                .midi-instrument-btn:hover .instrument-icon {
                    opacity: 1;
                }

                .midi-canvas-container {
                    flex: 1;
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    border-radius: 8px;
                    padding: 6px;
                    position: relative;
                    overflow: hidden;
                }

                .midi-canvas {
                    width: 100%;
                    height: 32px;
                    border-radius: 6px;
                    background: linear-gradient(135deg, 
                        rgba(248, 250, 252, 0.1) 0%, 
                        rgba(241, 245, 249, 0.05) 100%);
                    display: block;
                    cursor: pointer;
                    transition: all 0.3s ease;
                }

                .midi-canvas:hover {
                    background: linear-gradient(135deg, 
                        rgba(248, 250, 252, 0.15) 0%, 
                        rgba(241, 245, 249, 0.08) 100%);
                }
            `}</style>
        </div>
    ) as HTMLElement
    
    console.log('🎼 Step 1: DOM element created')
    console.log('🎼 Element type:', element?.constructor?.name)
    console.log('🎼 Element className:', element?.className)

    // Track active oscillators for stop functionality
    let activeOscillators: OscillatorNode[] = []
    let playbackTimeout: ReturnType<typeof setTimeout> | null = null

    // Toggle play/pause states using CSS classes
    const setPlayIcon = () => {
        playButton.classList.remove('playing')
    }
    
    const setPauseIcon = () => {
        playButton.classList.add('playing')
    }

    // Load and parse MIDI
    const loadMidi = async () => {
        console.log('🎵 ========== LOAD MIDI START ==========')
        console.log('🎵 URL to fetch:', url)
        
        try {
            console.log('🎵 Step 1: Fetching MIDI file...')
            const response = await fetch(url)
            console.log('🎵 Fetch response:', {
                ok: response.ok,
                status: response.status,
                statusText: response.statusText,
                contentType: response.headers.get('content-type')
            })
            
            if (!response.ok) {
                throw new Error(`Failed to load MIDI: ${response.status} ${response.statusText}`)
            }
            
            console.log('🎵 Step 2: Reading array buffer...')
            const arrayBuffer = await response.arrayBuffer()
            console.log('🎵 Array buffer size:', arrayBuffer.byteLength, 'bytes')
            
            const midiData = new Uint8Array(arrayBuffer)
            console.log('🎵 MIDI data first 4 bytes:', Array.from(midiData.slice(0, 4)).map(b => '0x' + b.toString(16).toUpperCase()).join(' '))
            
            // Parse MIDI using basic parsing (since we can't import the full MIDI lib in this context)
            console.log('🎵 Step 3: Parsing MIDI data...')
            midiNotes = await parseMidiData(midiData)
            
            console.log(`✅ Loaded ${midiNotes.length} notes`)
            console.log('✅ First 3 notes:', midiNotes.slice(0, 3))
            
            console.log('🎵 Step 4: Rendering to canvas...')
            renderMidi()
            
            console.log('✅ ========== MIDI LOADING COMPLETE ==========')
            
        } catch (error) {
            console.error('❌ ========== LOAD MIDI ERROR ==========')
            console.error('❌ URL:', url)
            console.error('❌ Error type:', error?.constructor?.name)
            console.error('❌ Error message:', error instanceof Error ? error.message : String(error))
            console.error('❌ Full error:', error)
            console.error('❌ Stack:', error instanceof Error ? error.stack : 'N/A')
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
            console.log(`🎵 MIDI time division: ${timeDivision} ticks per quarter note`)
            
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
                                        position: Math.floor(noteStart.startTime * PPQN.Quarter / timeDivision),
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

    // Render MIDI notes on canvas (optimized for compact size)
    const renderMidi = () => {
        console.log('🎨 Rendering MIDI canvas with', midiNotes.length, 'notes')
        const ctx = canvas.getContext('2d')
        if (!ctx || midiNotes.length === 0) {
            console.log('❌ Canvas context unavailable or no notes to render')
            return
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height)
        
        // Find note range (with padding for better visibility)
        const minPitch = Math.min(...midiNotes.map(n => n.pitch))
        const maxPitch = Math.max(...midiNotes.map(n => n.pitch))
        const pitchRange = Math.max(12, maxPitch - minPitch + 2) // Min range of one octave
        
        const maxTime = Math.max(...midiNotes.map(n => n.position + n.duration))
        const timeScale = (canvas.width - 4) / maxTime // Leave 2px margin on each side
        const pitchScale = (canvas.height - 4) / pitchRange // Leave 2px margin top/bottom
        
        // Draw notes with modern gradient style like our preview
        midiNotes.forEach(note => {
            const x = Math.max(2, note.position * timeScale + 2)
            const y = Math.max(2, (maxPitch + 1 - note.pitch) * pitchScale + 2)
            const width = Math.max(2, note.duration * timeScale)
            const height = Math.max(3, pitchScale * 0.8) // Compact height for small canvas
            
            // Create gradient for each note (green theme like preview)
            const noteGradient = ctx.createLinearGradient(x, y, x + width, y + height)
            noteGradient.addColorStop(0, 'rgba(74, 222, 128, 0.8)')
            noteGradient.addColorStop(1, 'rgba(34, 197, 94, 0.6)')
            
            ctx.fillStyle = noteGradient
            ctx.fillRect(x, y, width, height)
            
            // Add subtle glow
            ctx.shadowColor = 'rgba(74, 222, 128, 0.4)'
            ctx.shadowBlur = 2
            ctx.fillRect(x, y, width, height)
            ctx.shadowBlur = 0
        })
    }

    // Direct Web Audio API synthesis (no tracks needed!)
    const playMidiDirect = async () => {
        if (!studioService || midiNotes.length === 0) return
        
        if (isPlaying) {
            // Stop current playback
            activeOscillators.forEach(osc => {
                try { osc.stop() } catch (e) { /* Oscillator might already be stopped */ }
            })
            activeOscillators = []
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
            console.log('🎵 Playing (Web Audio)...')
            
            console.log('🎵 Attempting to access WebAudioAPI via StudioService...')
            const audioContext = studioService.audioContext
            
            if (!audioContext) {
                throw new Error('AudioContext not available from StudioService')
            }
            
            console.log('✅ AudioContext obtained:', audioContext.state)
            const masterGain = audioContext.createGain()
            masterGain.gain.value = 0.1 // Lower volume to avoid clipping
            masterGain.connect(audioContext.destination)
            
            // Schedule all MIDI notes for playback
            midiNotes.forEach(note => {
                // Convert PPQN position to seconds (120 BPM = 0.5s per quarter note)
                const startTime = audioContext.currentTime + (note.position / PPQN.Quarter) * 0.5
                const duration = (note.duration / PPQN.Quarter) * 0.5
                
                // Create oscillator for this note
                const oscillator = audioContext.createOscillator()
                const noteGain = audioContext.createGain()
                
                // Convert MIDI note to frequency: 440 * 2^((note-69)/12)
                const frequency = 440 * Math.pow(2, (note.pitch - 69) / 12)
                oscillator.frequency.value = frequency
                oscillator.type = 'sawtooth' // Similar to Nano's sound character
                
                // ADSR envelope simulation
                noteGain.gain.setValueAtTime(0, startTime)
                noteGain.gain.linearRampToValueAtTime(note.velocity * 0.3, startTime + 0.05) // Attack
                noteGain.gain.linearRampToValueAtTime(note.velocity * 0.15, startTime + Math.max(0.1, duration - 0.1)) // Sustain
                noteGain.gain.linearRampToValueAtTime(0, startTime + duration) // Release
                
                // Connect audio graph
                oscillator.connect(noteGain)
                noteGain.connect(masterGain)
                
                // Schedule playback
                oscillator.start(startTime)
                oscillator.stop(startTime + duration)
                
                // Track for stop functionality
                activeOscillators.push(oscillator)
                
                // Clean up when oscillator ends
                oscillator.onended = () => {
                    const index = activeOscillators.indexOf(oscillator)
                    if (index > -1) activeOscillators.splice(index, 1)
                }
            })
            
            // Calculate total playback duration
            const maxEndTime = Math.max(...midiNotes.map(n => n.position + n.duration))
            const totalDuration = (maxEndTime / PPQN.Quarter) * 0.5 * 1000 // Convert to ms
            
            // Reset state when playback ends
            playbackTimeout = setTimeout(() => {
                isPlaying = false
                setPlayIcon()
                console.log(`✅ ${midiNotes.length} notes loaded`)
                activeOscillators = []
                playbackTimeout = null
            }, Math.min(totalDuration + 500, 10000)) // Max 10 seconds
            
        } catch (error) {
            console.error('Direct playback failed:', error)
            isPlaying = false
            setPlayIcon()
            console.log('❌ Playback failed')
        }
    }

    // Create temporary Nano track for playback (alternative method)
    const createNanoTrack = async (): Promise<string> => {
        if (!studioService) {
            throw new Error('StudioService not available')
        }
        
        const trackName = `MIDI_Nano_${Date.now()}`
        // Note: addNano method might not exist in current StudioService
        // This is a placeholder for future implementation
        console.log('Creating Nano track:', trackName)
        return trackName
    }

    // Play MIDI through Nano track (creates actual track)
    // @ts-ignore - Alternative implementation kept for reference
    const playMidiWithTrack = async () => {
        if (isPlaying || midiNotes.length === 0) return
        
        try {
            isPlaying = true
            setPauseIcon()
            console.log('🎵 Playing via Nano track...')
            
            // Create Nano track if needed
            if (!tempTrackName) {
                tempTrackName = await createNanoTrack()
            }
            
            // TODO: Send MIDI events to the Nano track
            // For now, simulate playback
            setTimeout(() => {
                isPlaying = false
                setPlayIcon()
                console.log(`✅ ${midiNotes.length} notes loaded`)
            }, 3000)
            
        } catch (error) {
            console.error('Track playback failed:', error)
            isPlaying = false
            setPlayIcon()
            console.log('❌ Playback failed')
        }
    }

    // Nano-style sample playback (standalone, no tracks)
    const playMidiWithNanoRenderer = async () => {
        if (!studioService || midiNotes.length === 0) return
        
        if (isPlaying) {
            // Stop current playback
            activeOscillators.forEach(osc => {
                try { osc.stop() } catch (e) { /* May already be stopped */ }
            })
            activeOscillators = []
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
            console.log('🎵 Playing (Nano Renderer)...')
            
            const audioContext = studioService.audioContext
            if (!audioContext) {
                throw new Error('AudioContext not available')
            }
            
            console.log(`🎵 Loading sample: ${currentSampleName} (UUID: ${UUID.toString(currentSampleUUID)})`)
            
            // Load current selected sample
            const sampleLoader = studioService.sampleManager.getOrCreate(currentSampleUUID)
            console.log(`🔍 Sample loader state: ${sampleLoader.state.type}`)
            
            // Wait for sample to load
            const sampleData = await new Promise<AudioData>((resolve, reject) => {
                let attempts = 0
                const maxAttempts = 50 // 5 seconds with 100ms intervals
                
                const checkSample = () => {
                    attempts++
                    console.log(`🔄 Loading attempt ${attempts}/${maxAttempts} - State: ${sampleLoader.state.type}`)
                    
                    if (sampleLoader.data.nonEmpty()) {
                        console.log(`✅ Sample data found after ${attempts} attempts`)
                        resolve(sampleLoader.data.unwrap())
                    } else if (sampleLoader.state.type === 'error') {
                        console.error(`❌ Sample loader error:`, sampleLoader.state)
                        reject(new Error(`Sample loader error: ${JSON.stringify(sampleLoader.state)}`))
                    } else if (attempts >= maxAttempts) {
                        console.error(`❌ Sample load timeout after ${attempts} attempts`)
                        console.error(`Final state:`, sampleLoader.state)
                        reject(new Error(`Sample load timeout - final state: ${JSON.stringify(sampleLoader.state)}`))
                    } else {
                        // Try again after a short delay
                        setTimeout(checkSample, 100)
                    }
                }
                checkSample()
            })
            
            console.log(`✅ Sample loaded (${currentSampleName}):`, {
                sampleRate: sampleData.sampleRate,
                frames: sampleData.numberOfFrames,
                channels: sampleData.numberOfChannels
            })
            
            // Create master gain for all voices (match real Nano volume: -3.0 dB default)
            const masterGain = audioContext.createGain()
            masterGain.gain.value = dbToGain(-3.0) // Same as real Nano instrument (~0.708)
            masterGain.connect(audioContext.destination)
            
            // Create voice for each MIDI note using Nano-style processing
            const createNanoVoice = (note: MidiNote) => {
                const startTime = audioContext.currentTime + (note.position / PPQN.Quarter) * 0.5
                const duration = (note.duration / PPQN.Quarter) * 0.5
                const endTime = startTime + duration
                
                // Calculate pitch: same formula as Nano (2^((pitch-60)/12))
                const pitchRatio = Math.pow(2, (note.pitch - 60) / 12)
                
                // Create AudioBufferSourceNode for sample playback
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
                source.playbackRate.value = pitchRatio // Pitch shifting
                
                // Nano-style envelope (exponential decay) 
                const releaseTime = 1.0 // 1 second release like Nano default
                const peakGain = note.velocity * 0.8 // Higher velocity scaling to match real Nano volume
                
                // ADSR envelope
                voiceGain.gain.setValueAtTime(0, startTime)
                voiceGain.gain.linearRampToValueAtTime(peakGain, startTime + 0.01) // Quick attack
                voiceGain.gain.linearRampToValueAtTime(peakGain * 0.7, startTime + 0.1) // Decay
                voiceGain.gain.linearRampToValueAtTime(peakGain * 0.5, endTime) // Sustain
                voiceGain.gain.exponentialRampToValueAtTime(0.001, endTime + releaseTime) // Release
                
                // Connect audio graph
                source.connect(voiceGain)
                voiceGain.connect(masterGain)
                
                // Schedule playback
                source.start(startTime)
                source.stop(endTime + releaseTime)
                
                // Track for cleanup
                activeOscillators.push(source as any) // Reuse the array
                
                source.onended = () => {
                    const index = activeOscillators.indexOf(source as any)
                    if (index > -1) activeOscillators.splice(index, 1)
                }
            }
            
            // Create a voice for each MIDI note
            midiNotes.forEach(createNanoVoice)
            
            // Calculate total playback duration including release
            const maxEndTime = Math.max(...midiNotes.map(n => n.position + n.duration))
            const totalDuration = (maxEndTime / PPQN.Quarter) * 0.5 * 1000 + 1500 // Add release time
            
            // Reset state when playback ends
            playbackTimeout = setTimeout(() => {
                isPlaying = false
                setPlayIcon()
                console.log(`✅ Nano rendering complete: ${midiNotes.length} notes`)
                activeOscillators = []
                playbackTimeout = null
            }, Math.min(totalDuration, 15000)) // Max 15 seconds
            
        } catch (error) {
            console.error('Nano rendering failed:', error)
            isPlaying = false
            setPlayIcon()
            console.log('❌ Falling back to direct synthesis')
            
            // Fallback to direct synthesis
            return playMidiDirect()
        }
    }

    // Instrument selection function - cycle through available samples
    const selectInstrument = async () => {
        if (!studioService) {
            console.log('❌ No StudioService available')
            return
        }

        try {
            // Cycle to next instrument
            currentSampleIndex = (currentSampleIndex + 1) % availableSamples.length
            const selectedSample = availableSamples[currentSampleIndex]
            
            // Update current sample
            const newSampleUUID = UUID.parse(selectedSample.uuid)
            
            // Invalidate any cached sample loader for the old sample
            if (currentSampleUUID) {
                studioService.sampleManager.invalidate(currentSampleUUID)
            }
            
            // Update to new sample
            currentSampleUUID = newSampleUUID
            currentSampleName = selectedSample.name
            
            // Pre-load the new sample to ensure it's ready
            console.log(`🔄 Pre-loading sample: ${currentSampleName} (${selectedSample.uuid})`)
            studioService.sampleManager.getOrCreate(currentSampleUUID)
            
            // Update UI
            const nameSpan = instrumentButton.querySelector('.instrument-name') as HTMLSpanElement
            if (nameSpan) {
                nameSpan.textContent = currentSampleName
            }
            
            console.log(`🎵 Instrument changed to: ${currentSampleName}`)
            console.log(`🔍 UUID: ${selectedSample.uuid}`)
            
        } catch (error) {
            console.error('❌ Failed to change instrument:', error)
        }
    }

    // Main playback function - choose your approach:
    const playMidi = playMidiWithNanoRenderer  // ✅ NEW: Nano sample rendering (no tracks, Rhode sample)
    // const playMidi = playMidiDirect           // Alternative: Direct Web Audio API synthesis
    // const playMidi = playMidiWithTrack        // Alternative: Creates Nano track (integrates with DAW)

    // Setup event listeners
    console.log('🎼 Step 2: Setting up event listeners...')
    playButton.addEventListener('click', playMidi)
    instrumentButton.addEventListener('click', selectInstrument)
    console.log('🎼 Event listeners attached')
    
    // Initialize
    console.log('🎼 Step 3: Starting MIDI load...')
    loadMidi()
    
    // Debug: Log component creation
    console.log('🎵 ========== MIDI DISPLAY COMPONENT INIT COMPLETE ==========')
    console.log('🎵 Component details:', {
        hasElement: !!element,
        className: element?.className,
        children: element?.children?.length || 0,
        hasPlayButton: !!playButton,
        hasInstrumentButton: !!instrumentButton,
        hasCanvas: !!canvas
    })
    console.log('🎵 Returning element to parent...')
    
    return element
}
