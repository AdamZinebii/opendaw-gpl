import {Terminator, DefaultObservableValue} from "@opendaw/lib-std"
import {createElement, Router} from "@opendaw/lib-jsx"
import {WorkspacePage} from "@/ui/workspace/WorkspacePage.tsx"
import {StudioService} from "@/service/StudioService.ts"
import {AuthService} from "@/service/AuthService"
import {LoginPage} from "@/ui/pages/LoginPage"
import {ComponentsPage} from "@/ui/pages/ComponentsPage.tsx"
import {IconsPage} from "@/ui/pages/IconsPage.tsx"
import {AutomationPage} from "@/ui/pages/AutomationPage.tsx"
import {SampleUploadPage} from "@/ui/pages/SampleUploadPage.tsx"
import {Footer} from "@/ui/Footer"
import {ManualPage} from "@/ui/pages/ManualPage"
import {ColorsPage} from "@/ui/pages/ColorsPage"
import {Header} from "@/ui/header/Header"
import {ErrorsPage} from "@/ui/pages/ErrorsPage.tsx"
import {ImprintPage} from "@/ui/pages/ImprintPage.tsx"
import {GraphPage} from "@/ui/pages/GraphPage"
import {Chatbot} from "@/ui/components/Chatbot"

// Helper function to create main app with proper cleanup
const createMainAppWithCleanup = (service: StudioService, authService: AuthService): { element: HTMLElement, terminator: Terminator } => {
    const terminator = new Terminator()
    
    // Chatbot state - start closed
    const chatbotOpen = terminator.own(new DefaultObservableValue(false))
    
    // Chatbot toggle function
    const toggleChatbot = () => {
        const currentState = chatbotOpen.getValue()
        chatbotOpen.setValue(!currentState)
    }
    
    const element = (
        <div style={{display: "flex", flexDirection: "column", minHeight: "100vh"}}>
            <Header lifecycle={new Terminator()} service={service} authService={authService} chatbotToggle={toggleChatbot}/>
            <Router
                runtime={terminator}
                service={service}
                fallback={() => (
                    <div style={{flex: "1 0 0", display: "flex", justifyContent: "center", alignItems: "center"}}>
                        <span style={{fontSize: "50vmin"}}>404</span>
                    </div>
                )}
                routes={[
                    {path: "/", factory: WorkspacePage},
                    {path: "/manuals/*", factory: ManualPage},
                    {path: "/imprint", factory: ImprintPage},
                    {path: "/icons", factory: IconsPage},
                    {path: "/components", factory: ComponentsPage},
                    {path: "/automation", factory: AutomationPage},
                    {path: "/errors", factory: ErrorsPage},
                    {path: "/upload", factory: SampleUploadPage},
                    {path: "/colors", factory: ColorsPage},
                    {path: "/graph", factory: GraphPage}
                ]}
            />
            <Footer lifecycle={terminator} service={service}/>
            <Chatbot lifecycle={terminator} isOpen={chatbotOpen} studioService={service}/>
        </div>
    ) as HTMLElement
    return { element, terminator }
}

export const App = (service: StudioService) => {
    // Initialize AuthService - required for app access
    let authService: AuthService | null = null
    try {
        authService = new AuthService()
    } catch (error) {
        // Render configuration error page
        return (
            <div style={{
                display: "flex", 
                flexDirection: "column",
                alignItems: "center", 
                justifyContent: "center", 
                minHeight: "100vh",
                padding: "2rem",
                background: "var(--panel-background-dark)",
                color: "var(--color-bright)",
                textAlign: "center"
            }}>
                <h1 style={{color: "var(--color-red)", marginBottom: "1rem"}}>Configuration Required</h1>
                <p style={{maxWidth: "600px", lineHeight: "1.6", color: "var(--color-shadow)"}}>
                    Authentication is required to use beatson. Please configure your environment variables:
                </p>
                <pre style={{
                    background: "var(--panel-background)", 
                    padding: "1rem", 
                    borderRadius: "8px",
                    margin: "1rem 0",
                    color: "var(--color-bright)"
                }}>
{`# Copy .env.example to .env.local and fill in:
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-anon-key`}
                </pre>
                <p style={{color: "var(--color-shadow)", fontSize: "0.9rem"}}>
                    See README.md for setup instructions.
                </p>
            </div>
        )
    }

    // Create main container
    const container = <div style={{width: "100vw", height: "100vh"}} /> as HTMLElement
    
    // Track main app state to prevent recreation and allow proper cleanup
    // @ts-ignore - Variable needed for cleanup tracking but not read
    let _mainAppElement: HTMLElement | null = null
    let mainAppTerminator: Terminator | null = null
    let currentState = 'initial'

    // Functions to render different states
    const showLoadingScreen = () => {
        currentState = 'loading'
        const loadingElement = (
            <div style={{
                display: "flex", 
                alignItems: "center", 
                justifyContent: "center", 
                minHeight: "100vh",
                background: "var(--panel-background-dark)",
                color: "var(--color-bright)"
            }}>
                <div style={{textAlign: "center"}}>
                    <div style={{
                        width: "40px", 
                        height: "40px", 
                        border: "3px solid rgba(255, 255, 255, 0.1)",
                        borderTop: "3px solid rgba(255, 255, 255, 0.5)",
                        borderRadius: "50%",
                        animation: "spin 1s linear infinite",
                        margin: "0 auto 1rem"
                    }}></div>
                    <p>Loading beatson...</p>
                </div>
            </div>
        ) as HTMLElement
        container.replaceChildren(loadingElement)
    }

    const showLoginScreen = () => {
        currentState = 'login'
        const loginElement = <LoginPage lifecycle={new Terminator()} authService={authService!}/> as HTMLElement
        container.replaceChildren(loginElement)
    }

    const showMainApp = (user: any) => {
        if (currentState === 'main-app') {
            return
        }
        
        currentState = 'main-app'
        
        try {
            // Create new main app instance
            const { element, terminator } = createMainAppWithCleanup(service, authService!)
            _mainAppElement = element
            mainAppTerminator = terminator
            
            container.replaceChildren(element)
            
        } catch (error) {
            // Fallback interface
            const fallback = (
                <div style={{
                    width: "100%", 
                    height: "100%",
                    display: "flex", 
                    justifyContent: "center", 
                    alignItems: "center",
                    background: "var(--panel-background-dark)",
                    color: "var(--color-bright)"
                }}>
                    <div style={{textAlign: "center", padding: "40px"}}>
                        <h1 style={{color: "var(--color-red)"}}>⚠️ Loading Error</h1>
                        <p>Authenticated as <strong>{user.email}</strong></p>
                        <p style={{fontFamily: "monospace", fontSize: "12px"}}>
                            {(error as Error)?.message || 'Unknown error'}
                        </p>
                    </div>
                </div>
            ) as HTMLElement
            
            container.replaceChildren(fallback)
        }
    }

    // Auth state change handler (called only once per change)
    const handleAuthChange = () => {
        const user = authService!.getCurrentUser()
        const loading = authService!.loading.getValue()
        
        if (loading) {
            showLoadingScreen()
        } else if (user) {
            showMainApp(user)
        } else {
            // Cleanup MainApp if user logged out
            if (mainAppTerminator) {
                mainAppTerminator.terminate()
                mainAppTerminator = null
                _mainAppElement = null
            }
            showLoginScreen()
        }
    }

    // Subscribe to auth changes (only once)
    authService.user.catchupAndSubscribe(handleAuthChange)
    authService.loading.catchupAndSubscribe(handleAuthChange)
    
    // Initial state
    handleAuthChange()
    
    return container
}