import { createClient, User } from '@supabase/supabase-js'
import { DefaultObservableValue, ObservableValue } from "@opendaw/lib-std"

export class AuthService {
    // Environment variables - these must be set in .env files
    private static readonly SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
    private static readonly SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
    
    private readonly supabase
    private readonly _user = new DefaultObservableValue<User | null>(null)
    private readonly _loading = new DefaultObservableValue<boolean>(true)
    
    constructor() {
        if (!AuthService.SUPABASE_URL || !AuthService.SUPABASE_ANON_KEY) {
            console.error('❌ AuthService: Missing required environment variables VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
            throw new Error('Supabase configuration missing. Please check your environment variables.')
        }
        
            this.supabase = createClient(AuthService.SUPABASE_URL, AuthService.SUPABASE_ANON_KEY)
        this.initialize()
    }
    
    private async initialize() {
        try {
            console.log('AuthService: Starting initialization...')
            
            // Add timeout to prevent infinite loading
            const timeout = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Auth initialization timeout')), 10000)
            )
            
            // Get initial session with timeout
            const sessionPromise = this.supabase.auth.getSession()
            const { data: { session } } = await Promise.race([sessionPromise, timeout]) as any
            
            console.log('AuthService: Got session:', session?.user?.email || 'No user')
            
            this._user.setValue(session?.user ?? null)
            this._loading.setValue(false)
            if (session?.user) {
                // Touch login RPC server-side to upsert user + session
                console.log('🔐 Calling auth_on_login RPC for user:', session.user.email)
                try {
                    const result = await this.supabase.rpc('auth_on_login')
                    console.log('✅ auth_on_login RPC result:', result)
                } catch (e) {
                    console.error('❌ auth_on_login RPC failed:', e)
                }
            }
            
            // Listen to auth changes
            this.supabase.auth.onAuthStateChange(async (event, session) => {
                console.log(`AuthService: Auth state changed [${event}]:`, session?.user?.email || 'No user')
                console.log('Session details:', { 
                    hasUser: !!session?.user, 
                    email: session?.user?.email,
                    expires_at: session?.expires_at 
                })
                this._user.setValue(session?.user ?? null)
                this._loading.setValue(false)
                if (session?.user) {
                    // Update activity + presence on any auth change
                    console.log('🔐 Auth state change - calling auth_on_login RPC for user:', session.user.email)
                    try {
                        const result = await this.supabase.rpc('auth_on_login')
                        console.log('✅ auth_on_login RPC result:', result)
                    } catch (e) {
                        console.error('❌ auth_on_login RPC failed:', e)
                    }
                } else {
                    console.log('🔐 Auth state change - calling auth_on_logout RPC')
                    try {
                        const result = await this.supabase.rpc('auth_on_logout')
                        console.log('✅ auth_on_logout RPC result:', result)
                    } catch (e) {
                        console.error('❌ auth_on_logout RPC failed:', e)
                    }
                }
            })
            
            console.log('AuthService: Initialization complete')
        } catch (error) {
            console.error('AuthService: Initialization failed:', error)
            // Set loading to false even if there's an error to prevent infinite loading
            this._loading.setValue(false)
        }
    }
    
    get user(): ObservableValue<User | null> {
        return this._user
    }
    
    get loading(): ObservableValue<boolean> {
        return this._loading
    }
    
    // Allow external components to stop loading if needed
    public forceStopLoading() {
        this._loading.setValue(false)
    }
    
    get isAuthenticated(): boolean {
        return this._user.getValue() !== null
    }
    
    async signInWithGithub(): Promise<{ error: any }> {
        console.log('AuthService: Starting GitHub OAuth...')
        console.log('Redirect URL:', window.location.origin)
        try {
            const { error } = await this.supabase.auth.signInWithOAuth({
                provider: 'github',
                options: {
                    redirectTo: window.location.origin
                }
            })
            console.log('AuthService: GitHub OAuth response error:', error)
            return { error }
        } catch (e) {
            console.error('AuthService: GitHub OAuth exception:', e)
            return { error: e }
        }
    }
    
    async signInWithGoogle(): Promise<{ error: any }> {
        console.log('AuthService: Starting Google OAuth...')
        console.log('Redirect URL:', window.location.origin)
        try {
            const { error } = await this.supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: window.location.origin
                }
            })
            console.log('AuthService: Google OAuth response error:', error)
            return { error }
        } catch (e) {
            console.error('AuthService: Google OAuth exception:', e)
            return { error: e }
        }
    }
    
    async signOut(): Promise<{ error: any }> {
        const { error } = await this.supabase.auth.signOut()
        return { error }
    }
    
    getCurrentUser(): User | null {
        return this._user.getValue()
    }
    
    getUserId(): string | null {
        return this.getCurrentUser()?.id ?? null
    }
    
    getUserEmail(): string | null {
        return this.getCurrentUser()?.email ?? null
    }
    
    getUserDisplayName(): string | null {
        const user = this.getCurrentUser()
        return user?.user_metadata?.full_name || 
               user?.user_metadata?.name || 
               user?.email?.split('@')[0] || 
               'User'
    }
    
    getUserAvatar(): string | null {
        return this.getCurrentUser()?.user_metadata?.avatar_url ?? null
    }
}
