import css from "./LoginPage.sass?inline"
import { createElement } from "@opendaw/lib-jsx"
import { Lifecycle } from "@opendaw/lib-std"
import { Html } from "@opendaw/lib-dom"
import { AuthService } from "@/service/AuthService"

const className = Html.adoptStyleSheet(css, "LoginPage")

type Construct = {
    lifecycle: Lifecycle
    authService: AuthService
}

export const LoginPage = ({ lifecycle: _lifecycle, authService }: Construct) => {
    const handleGitHubLogin = async () => {
        try {
            const { error } = await authService.signInWithGithub()
            if (error) {
                showError(`Failed to sign in with GitHub: ${error.message}`)
            }
        } catch (e) {
            showError('Failed to sign in with GitHub. Please try again.')
        }
    }

    const handleGoogleLogin = async () => {
        try {
            const { error } = await authService.signInWithGoogle()
            if (error) {
                showError(`Failed to sign in with Google: ${error.message}`)
            }
        } catch (e) {
            showError('Failed to sign in with Google. Please try again.')
        }
    }

    const showError = (message: string) => {
        const errorElement = document.querySelector('.error-message')
        if (errorElement) {
            errorElement.textContent = message
            errorElement.classList.add('visible')
            
            // Hide error after 5 seconds
            setTimeout(() => {
                errorElement.classList.remove('visible')
            }, 5000)
        }
    }

    return (
        <div className={className}>
            <div className="login-container">
                <div className="login-content">
                    <div className="logo-section">
                        <h1>Authenticate</h1>
                        <p className="subtitle">Professional music production in your browser</p>
                    </div>

                    <div className="auth-section">
                        <p className="description">
                            Sign in to save your projects and access AI-powered music features.
                        </p>

                        <div className="error-message" role="alert"></div>

                        <div className="auth-buttons">
                            <button 
                                className="auth-button github"
                                onclick={handleGitHubLogin}
                                type="button">
                                <div className="button-icon">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                                    </svg>
                                </div>
                                <span>GitHub</span>
                            </button>

                            <button 
                                className="auth-button google"
                                onclick={handleGoogleLogin}
                                type="button">
                                <div className="button-icon">
                                    <svg width="18" height="18" viewBox="0 0 24 24">
                                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                                    </svg>
                                </div>
                                <span>Google</span>
                            </button>
                        </div>

                        <div className="privacy-note">
                            <p>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                                </svg>
                                Secure OAuth login. We never store your passwords.
                            </p>
                        </div>
                    </div>

                </div>

                <div className="background-animation">
                    <div className="waveform"></div>
                    <div className="waveform"></div>
                    <div className="waveform"></div>
                </div>
            </div>
        </div>
    )
}
