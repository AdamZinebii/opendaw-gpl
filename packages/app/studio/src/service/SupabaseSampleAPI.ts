 import {
    Lazy,
    Procedure,
    unitValue,
    UUID
} from "@opendaw/lib-std"
import {AudioData, Sample, SampleMetaData} from "@opendaw/studio-adapters"
import {FutureSampleApi} from "@/service/SampleApi"
import {createClient} from '@supabase/supabase-js'
import {Arrays} from "@opendaw/lib-std"

// Supabase samples API that serves from Supabase Storage
export class SupabaseSampleAPI implements FutureSampleApi {
    
    private static readonly SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
    private static readonly SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
    private static readonly BUCKET_NAME = "opendaw-samples"
    
    private readonly supabase
    private manifestCache: ReadonlyArray<Sample> | null = null
    private samplesMap = new Map<string, any>()
    
    constructor() {
        if (!SupabaseSampleAPI.SUPABASE_URL || !SupabaseSampleAPI.SUPABASE_ANON_KEY) {
            throw new Error('SupabaseSampleAPI: Missing Supabase configuration')
        }
        
        this.supabase = createClient(
            SupabaseSampleAPI.SUPABASE_URL,
            SupabaseSampleAPI.SUPABASE_ANON_KEY
        )
    }
    
    @Lazy
    static get(): SupabaseSampleAPI { return new SupabaseSampleAPI() }

    private async loadManifest(forceReload: boolean = false): Promise<void> {
        if (this.manifestCache && !forceReload) {
            console.debug('Using cached manifest, skipping reload')
            return
        }

        try {
            console.debug('Loading samples manifest from Supabase...', forceReload ? '(force reload)' : '')
            
            // Try to fetch manifest.json from the samples bucket with cache busting
            const manifestUrl = this.supabase.storage
                .from(SupabaseSampleAPI.BUCKET_NAME)
                .getPublicUrl('manifest.json').data.publicUrl
            
            console.debug('Fetching manifest from:', manifestUrl)
            
            const response = await fetch(`${manifestUrl}?t=${Date.now()}`, {
                method: 'GET',
                headers: {
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                }
            })
            
            if (!response.ok) {
                console.warn('No manifest.json found in samples bucket, using empty list')
                this.manifestCache = []
                return
            }

            const manifestText = await response.text()
            const manifest = JSON.parse(manifestText)
            
            console.debug(`Loaded ${manifest.samples?.length || 0} samples from manifest`)
            
            // Cache samples for quick lookup
            this.samplesMap.clear() // Clear existing samples
            manifest.samples?.forEach((sample: any) => {
                this.samplesMap.set(sample.uuid, sample)
            })
            
            this.manifestCache = manifest.samples || []
            console.debug(`Loaded ${this.manifestCache?.length || 0} samples from manifest`)
        } catch (error) {
            console.error('Failed to load samples manifest:', error)
            this.manifestCache = []
        }
    }

    /**
     * Invalidate the manifest cache to force reload on next access
     */
    public invalidateCache(): void {
        console.debug('Invalidating samples manifest cache...')
        this.manifestCache = null
        this.samplesMap.clear()
    }

    /**
     * Force reload the manifest from Supabase immediately
     */
    public async reloadManifest(): Promise<void> {
        console.debug('Force reloading samples manifest...')
        this.manifestCache = null
        this.samplesMap.clear()
        await this.loadManifest(true)
    }

    private getStorageUrl(filename: string): string {
        const { data } = this.supabase.storage
            .from(SupabaseSampleAPI.BUCKET_NAME)
            .getPublicUrl(filename)
        return data.publicUrl
    }

    private static fromAudioBuffer(buffer: AudioBuffer): AudioData {
        return {
            frames: Arrays.create(channel => buffer.getChannelData(channel), buffer.numberOfChannels),
            sampleRate: buffer.sampleRate,
            numberOfFrames: buffer.length,
            numberOfChannels: buffer.numberOfChannels
        }
    }

    async all(): Promise<ReadonlyArray<Sample>> {
        await this.loadManifest()
        return this.manifestCache || []
    }

    async get(uuid: UUID.Format): Promise<Sample> {
        await this.loadManifest()
        
        const uuidString = UUID.toString(uuid)
        let sampleInfo = this.samplesMap.get(uuidString)
        
        // If sample not found, try reloading manifest in case it's a newly added sample
        if (!sampleInfo) {
            console.debug(`Sample ${uuidString} not found in cache, reloading manifest...`)
            await this.loadManifest(true)
            sampleInfo = this.samplesMap.get(uuidString)
        }
        
        if (!sampleInfo) {
            throw new Error(`Sample not found: ${uuidString}`)
        }

        return Object.freeze({
            uuid: uuidString as UUID.String,
            name: sampleInfo.name,
            bpm: sampleInfo.bpm,
            duration: sampleInfo.duration,
            sample_rate: sampleInfo.sample_rate,
            cloud: "cloud:supabase"
        })
    }

    async load(context: AudioContext, uuid: UUID.Format, progress: Procedure<unitValue>): Promise<[AudioData, Sample]> {
        await this.loadManifest()
        
        const uuidString = UUID.toString(uuid)
        let sampleInfo = this.samplesMap.get(uuidString)
        
        // If sample not found, try reloading manifest in case it's a newly added sample
        if (!sampleInfo) {
            console.debug(`Sample ${uuidString} not found in cache, reloading manifest...`)
            console.debug(`Current samplesMap has ${this.samplesMap.size} samples`)
            await this.loadManifest(true)
            console.debug(`After reload, samplesMap has ${this.samplesMap.size} samples`)
            console.debug(`Looking for sample: ${uuidString}`)
            const allUUIDs = Array.from(this.samplesMap.keys())
            console.debug(`Available sample UUIDs (last 10):`, allUUIDs.slice(-10))
            console.debug(`Total samples: ${allUUIDs.length}`)
            console.debug(`Sample exists in map:`, this.samplesMap.has(uuidString))
            
            // Check if any recent samples contain part of our UUID
            const recentSamples = allUUIDs.filter(uuid => 
                uuid.includes(uuidString.substring(0, 8)) || 
                uuidString.includes(uuid.substring(0, 8))
            )
            console.debug(`Similar UUIDs found:`, recentSamples)
            
            sampleInfo = this.samplesMap.get(uuidString)
        }
        
        if (!sampleInfo) {
            throw new Error(`Sample not found: ${uuidString}`)
        }

        console.debug(`Loading sample from Supabase: ${sampleInfo.name}`)
        
        try {
            // Fetch from Supabase Storage
            const sampleUrl = this.getStorageUrl(sampleInfo.filename)
            const response = await fetch(sampleUrl)
            
            if (!response.ok) {
                throw new Error(`Failed to load sample from Supabase: ${response.status} ${response.statusText}`)
            }
            
            const arrayBuffer = await response.arrayBuffer()
            progress(1.0)
            
            const audioBuffer = await context.decodeAudioData(arrayBuffer)
            const audioData = SupabaseSampleAPI.fromAudioBuffer(audioBuffer)
            
            const sample: Sample = {
                uuid: uuidString as UUID.String,
                name: sampleInfo.name,
                bpm: sampleInfo.bpm,
                duration: audioBuffer.duration,
                sample_rate: audioBuffer.sampleRate
            }
            
            return [audioData, sample]
        } catch (error) {
            console.error(`Error loading sample ${sampleInfo.name} from Supabase:`, error)
            throw error
        }
    }

    async upload(_arrayBuffer: ArrayBuffer, _metaData: SampleMetaData): Promise<void> {
        // Upload functionality can be implemented later if needed
        throw new Error('Sample upload not implemented for Supabase API')
    }
}
