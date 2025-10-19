import { createClient, User } from '@supabase/supabase-js'
import { DefaultObservableValue, ObservableValue } from "@opendaw/lib-std"

export interface UserProfile {
    id: string
    email: string
    username: string | null
    skill_level: 'beginner' | 'amateur' | 'professional' | null
    onboarding_completed: boolean
    display_name: string | null
}

export class AuthService {
    // Environment variables - these must be set in .env files
    private static readonly SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
    private static readonly SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
    
    private readonly supabase
    private readonly _user = new DefaultObservableValue<User | null>(null)
    private readonly _loading = new DefaultObservableValue<boolean>(true)
    private readonly _userProfile = new DefaultObservableValue<UserProfile | null>(null)
    
    constructor() {
        if (!AuthService.SUPABASE_URL || !AuthService.SUPABASE_ANON_KEY) {
            console.error('❌ AuthService: Missing required environment variables VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
            throw new Error('Supabase configuration missing. Please check your environment variables.')
        }
        
        // Store config in localStorage for auth callback page
        localStorage.setItem('supabase_url', AuthService.SUPABASE_URL)
        localStorage.setItem('supabase_anon_key', AuthService.SUPABASE_ANON_KEY)
        
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
                // Touch login RPC server-side to upsert user + session (NON-BLOCKING)
                console.log('🔐 Calling auth_on_login RPC for user:', session.user.email)
                this.supabase.rpc('auth_on_login').then(result => {
                    console.log('✅ auth_on_login RPC result:', result)
                    if (result.error) {
                        console.error('❌ auth_on_login RPC error details:', JSON.stringify(result.error, null, 2))
                    }
                }).catch(e => {
                    console.error('❌ auth_on_login RPC failed:', e)
                })

                // Load user profile (NON-BLOCKING)
                this.loadUserProfile(session.user.id).catch(e => {
                    console.error('❌ Failed to load user profile:', e)
                })
            }
            
            // Listen to auth changes
            this.supabase.auth.onAuthStateChange((event, session) => {
                console.log(`AuthService: Auth state changed [${event}]:`, session?.user?.email || 'No user')
                console.log('Session details:', {
                    hasUser: !!session?.user,
                    email: session?.user?.email,
                    expires_at: session?.expires_at
                })
                this._user.setValue(session?.user ?? null)
                this._loading.setValue(false)
                if (session?.user) {
                    // Update activity + presence on any auth change (NON-BLOCKING)
                    console.log('🔐 Auth state change - calling auth_on_login RPC for user:', session.user.email)
                    this.supabase.rpc('auth_on_login').then(result => {
                        console.log('✅ auth_on_login RPC result:', result)
                        if (result.error) {
                            console.error('❌ auth_on_login RPC error details:', JSON.stringify(result.error, null, 2))
                        }
                    }).catch(e => {
                        console.error('❌ auth_on_login RPC failed:', e)
                    })

                    // Load user profile (NON-BLOCKING)
                    this.loadUserProfile(session.user.id).catch(e => {
                        console.error('❌ Failed to load user profile:', e)
                    })
                } else {
                    console.log('🔐 Auth state change - calling auth_on_logout RPC')
                    this.supabase.rpc('auth_on_logout').then(result => {
                        console.log('✅ auth_on_logout RPC result:', result)
                    }).catch(e => {
                        console.error('❌ auth_on_logout RPC failed:', e)
                    })
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
    
    get userProfile(): ObservableValue<UserProfile | null> {
        return this._userProfile
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
    
    /**
     * Check if email exists in the system
     */
    async checkEmailExists(email: string): Promise<{ exists: boolean; error?: any }> {
        try {
            console.log('AuthService: Checking if email exists:', email)
            const { data, error } = await this.supabase.rpc('check_email_exists', {
                user_email: email
            })
            
            if (error) {
                console.error('AuthService: Error checking email:', error)
                return { exists: false, error }
            }
            
            console.log('AuthService: Email exists result:', data)
            return { exists: data === true }
        } catch (e) {
            console.error('AuthService: Error checking email:', e)
            return { exists: false, error: e }
        }
    }
    
    /**
     * Sign up with email and password
     * Sends verification email automatically
     */
    async signUpWithEmail(email: string, password: string): Promise<{ error: any; needsVerification?: boolean }> {
        console.log('AuthService: Starting email sign up...')
        try {
            const { data, error } = await this.supabase.auth.signUp({
                email,
                password,
                options: {
                    emailRedirectTo: `${window.location.origin}/auth-callback.html`
                }
            })
            
            if (error) {
                console.error('AuthService: Sign up error:', error)
                return { error }
            }
            
            console.log('AuthService: Sign up successful, verification email sent')
            
            // Check if email confirmation is required
            const needsVerification = !data.session
            
            return { error: null, needsVerification }
        } catch (e) {
            console.error('AuthService: Sign up exception:', e)
            return { error: e }
        }
    }
    
    /**
     * Sign in with email and password
     */
    async signInWithEmail(email: string, password: string): Promise<{ error: any; needsVerification?: boolean }> {
        console.log('AuthService: Starting email sign in...')
        try {
            const { error } = await this.supabase.auth.signInWithPassword({
                email,
                password
            })
            
            if (error) {
                console.error('AuthService: Sign in error:', error)
                
                // Check if it's an email not confirmed error
                if (error.message.includes('Email not confirmed')) {
                    return { error, needsVerification: true }
                }
                
                return { error }
            }
            
            console.log('AuthService: Sign in successful')
            return { error: null }
        } catch (e) {
            console.error('AuthService: Sign in exception:', e)
            return { error: e }
        }
    }
    
    /**
     * Resend verification email
     */
    async resendVerificationEmail(email: string): Promise<{ error: any }> {
        console.log('AuthService: Resending verification email...')
        try {
            const { error } = await this.supabase.auth.resend({
                type: 'signup',
                email,
                options: {
                    emailRedirectTo: `${window.location.origin}/auth-callback.html`
                }
            })
            
            if (error) {
                console.error('AuthService: Resend verification error:', error)
                return { error }
            }
            
            console.log('AuthService: Verification email resent successfully')
            return { error: null }
        } catch (e) {
            console.error('AuthService: Resend verification exception:', e)
            return { error: e }
        }
    }
    
    /**
     * Send password reset email
     */
    async resetPassword(email: string): Promise<{ error: any }> {
        console.log('AuthService: Sending password reset email...')
        const redirectUrl = `${window.location.origin}/auth-callback.html`
        console.log('AuthService: Password reset redirect URL:', redirectUrl)
        try {
            const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
                redirectTo: redirectUrl
            })
            
            if (error) {
                console.error('AuthService: Password reset error:', error)
                return { error }
            }
            
            console.log('AuthService: Password reset email sent successfully')
            return { error: null }
        } catch (e) {
            console.error('AuthService: Password reset exception:', e)
            return { error: e }
        }
    }
    
    /**
     * Update password (used after clicking reset link)
     */
    async updatePassword(newPassword: string): Promise<{ error: any }> {
        console.log('AuthService: Updating password...')
        try {
            const { error } = await this.supabase.auth.updateUser({
                password: newPassword
            })
            
            if (error) {
                console.error('AuthService: Update password error:', error)
                return { error }
            }
            
            console.log('AuthService: Password updated successfully')
            return { error: null }
        } catch (e) {
            console.error('AuthService: Update password exception:', e)
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
    
    /**
     * Load user profile from database
     */
    async loadUserProfile(userId: string): Promise<void> {
        try {
            const { data, error } = await this.supabase
                .from('users')
                .select('id, email, username, skill_level, onboarding_completed, display_name')
                .eq('id', userId)
                .single()
            
            if (error) {
                console.error('❌ Failed to load user profile:', JSON.stringify(error, null, 2))
                console.error('❌ Error details - Code:', error.code, 'Message:', error.message, 'Details:', error.details)
                return
            }
            
            console.log('✅ User profile loaded:', data)
            this._userProfile.setValue(data)
        } catch (error) {
            console.error('❌ Error loading user profile:', error)
        }
    }
    
    /**
     * Check if user needs onboarding
     */
    needsOnboarding(): boolean {
        const profile = this._userProfile.getValue()
        return profile ? !profile.onboarding_completed : false
    }
    
    /**
     * Complete user onboarding
     */
    async completeOnboarding(data: {
        username: string
        skill_level: 'beginner' | 'amateur' | 'professional'
    }): Promise<{ success: boolean; error?: string }> {
        const user = this.getCurrentUser()
        if (!user) {
            return { success: false, error: 'No authenticated user' }
        }
        
        try {
            // Check if username is already taken
            const { data: existing } = await this.supabase
                .from('users')
                .select('id')
                .ilike('username', data.username)
                .neq('id', user.id)
                .maybeSingle()
            
            if (existing) {
                return { success: false, error: 'Username already taken' }
            }
            
            // Update user profile
            const { error } = await this.supabase
                .from('users')
                .update({
                    username: data.username,
                    skill_level: data.skill_level,
                    onboarding_completed: true,
                    onboarding_completed_at: new Date().toISOString(),
                    display_name: data.username
                })
                .eq('id', user.id)
            
            if (error) {
                console.error('❌ Failed to complete onboarding:', error)
                return { success: false, error: error.message }
            }
            
            // Reload profile
            await this.loadUserProfile(user.id)
            
            console.log('✅ Onboarding completed successfully')
            return { success: true }
        } catch (error) {
            console.error('❌ Error completing onboarding:', error)
            return { success: false, error: String(error) }
        }
    }
    
    /**
     * Update user profile (username and skill level)
     */
    async updateProfile(data: {
        username: string
        skill_level: 'beginner' | 'amateur' | 'professional'
    }): Promise<{ success: boolean; error?: string }> {
        const user = this.getCurrentUser()
        if (!user) {
            return { success: false, error: 'No authenticated user' }
        }
        
        try {
            // Check if username is already taken (if changed)
            const currentProfile = this._userProfile.getValue()
            if (currentProfile && data.username.toLowerCase() !== currentProfile.username?.toLowerCase()) {
                const { data: existing } = await this.supabase
                    .from('users')
                    .select('id')
                    .ilike('username', data.username)
                    .neq('id', user.id)
                    .maybeSingle()
                
                if (existing) {
                    return { success: false, error: 'Username already taken' }
                }
            }
            
            // Update user profile
            const { error } = await this.supabase
                .from('users')
                .update({
                    username: data.username,
                    skill_level: data.skill_level,
                    display_name: data.username,
                    updated_at: new Date().toISOString()
                })
                .eq('id', user.id)
            
            if (error) {
                console.error('❌ Failed to update profile:', error)
                return { success: false, error: error.message }
            }
            
            // Reload profile
            await this.loadUserProfile(user.id)
            
            console.log('✅ Profile updated successfully')
            return { success: true }
        } catch (error) {
            console.error('❌ Error updating profile:', error)
            return { success: false, error: String(error) }
        }
    }
}
