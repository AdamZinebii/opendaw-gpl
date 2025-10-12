import css from "./Chatbot.sass?inline"
import {createElement} from "@opendaw/lib-jsx"
import {Lifecycle, MutableObservableValue, DefaultObservableValue} from "@opendaw/lib-std"
import {Html, Events} from "@opendaw/lib-dom"
import {StudioService} from "@/service/StudioService.ts"
import {createClient} from '@supabase/supabase-js'
import {MidiDisplay} from "./MidiDisplay"
import {DrumPlayer} from "./DrumPlayer"
import {marked} from 'marked'

const className = Html.adoptStyleSheet(css, "Chatbot")

// Configure Marked for safe rendering
marked.use({
    gfm: true, // GitHub Flavored Markdown
    breaks: true, // Convert line breaks to <br>
    pedantic: false
})

// Markdown renderer using Marked library
function renderMarkdown(text: string): string {
    // Handle null, undefined, or empty text
    if (!text || typeof text !== 'string') {
        console.warn('renderMarkdown received invalid input:', text)
        return ''
    }
    
    try {
        const result = marked.parse(text)
        // Handle both sync and async results
        if (typeof result === 'string') {
            return result
        } else {
            // If it's a Promise, we'll need to handle it differently
            console.warn('Marked returned a Promise, falling back to plain text')
            return text.replace(/\n/g, '<br>')
        }
    } catch (error) {
        console.warn('Markdown parsing error:', error)
        // Fallback to plain text with line breaks
        return text.replace(/\n/g, '<br>')
    }
}

type ChatbotProps = {
    lifecycle: Lifecycle
    isOpen: MutableObservableValue<boolean>
    studioService?: StudioService
}

type ChatMessage = {
    role: 'user' | 'assistant' | 'system'
    content: string
    id?: string
    timestamp?: number
    isUser?: boolean
    isLoading?: boolean
    isToolExecution?: boolean  // For spinning circle instead of dots
}

export const Chatbot = ({lifecycle, isOpen, studioService}: ChatbotProps) => {
    // Initialize Supabase client
    const supabase = createClient(
        import.meta.env.VITE_SUPABASE_URL || '',
        import.meta.env.VITE_SUPABASE_ANON_KEY || ''
    )
    
    // Messages storage
    const messages = new DefaultObservableValue<ChatMessage[]>([])
    
    // Helper function to get current user ID
    const getCurrentUserId = (): string | null => {
        if (!studioService?.authService) return null
        const user = studioService.authService.getCurrentUser()
        return user?.id || null
    }
    
    // Helper function to get current project ID
    const getCurrentProjectId = (): string | null => {
        if (!studioService?.projectService) return null
        
        // Get current project from ProjectService
        const currentProject = studioService.projectService.currentProject?.getValue()
        if (currentProject?.id) {
            return currentProject.id
        }
        
        // Fallback: Try to get from profile service (for loaded projects)
        const profile = studioService.profileService?.getValue()
        if (profile && 'unwrap' in profile) {
            const unwrapped = (profile as any).unwrap()
            // Get cloudId for Supabase-saved projects
            return unwrapped?.cloudId || null
        }
        return null
    }
    
    // Helper function to check if there's an active project
    const hasActiveProject = (): boolean => {
        return Boolean(getCurrentProjectId())
    }
    
    // Load chat history for the current project
    const loadChatHistoryForCurrentProject = async () => {
        const userId = getCurrentUserId()
        const projectId = getCurrentProjectId()
        
        if (!userId || !projectId || !hasActiveProject()) {
            // Clear chat if no project
            messages.setValue([])
            updateMessagesDisplay()
            return
        }

        console.log('Loading chat history for project:', projectId)

        try {
            // Clear existing messages first
            messages.setValue([])

            // Get or create EDITOR conversation for this specific project
            const { data: conversationId, error: convError } = await supabase.rpc(
                'get_or_create_active_conversation_by_type', 
                {
                    p_user_id: userId,
                    p_project_id: projectId,
                    p_type: 'editor'
                }
            )

            if (convError) {
                console.error('❌ Failed to get project conversation:', convError)
                updateMessagesDisplay()
                return
            }

            // Load messages for this conversation
            const { data: convData, error: msgError } = await supabase
                .from('chat_conversations')
                .select('messages')
                .eq('id', conversationId)
                .single()

            if (msgError) {
                console.error('❌ Failed to load project messages:', msgError)
                updateMessagesDisplay()
                return
            }

            if (convData?.messages && Array.isArray(convData.messages)) {
                // Convert to UI format and filter out system messages
                const uiMessages = convData.messages
                    .filter((msg: any) => msg.role !== 'system')
                    .map((msg: any, index: number) => ({
                        ...msg,
                        content: msg.content || '', // Ensure content is always a string
                        id: `project_${projectId}_${Date.now()}_${index}`,
                        timestamp: Date.now(),
                        isUser: msg.role === 'user'
                    }))
                    .filter((msg: any) => msg.content.trim() !== '') // Remove empty messages

                messages.setValue(uiMessages)
                console.log('Loaded', uiMessages.length, 'messages for project')
            } else {
                console.log('No existing chat history for project')
            }

            updateMessagesDisplay()
        } catch (error) {
            console.error('❌ Failed to load project chat history:', error)
            updateMessagesDisplay()
        }
    }
    
    // Create main chatbot panel - right side, full height
    const element = (
        <div className={Html.buildClassList(className)}>
            {/* Header */}
            <div className="header">
                <h3>AI Assistant</h3>
                
                <div className="header-status">
                    <div className="network-status online">
                        <div className="network-arcs">
                            <div className="arc arc-1"></div>
                            <div className="arc arc-2"></div>
                            <div className="arc arc-3"></div>
                        </div>
                    </div>
                    <div className="sync-status idle">✓</div>
                </div>
                
                <button className="close-btn" type="button">×</button>
            </div>
            
            {/* Chat Content */}
            <div className="chat-content">
                {/* Messages */}
                <div className="messages">
                    <div className="welcome-message">
                        <p>Hi! I'm your AI assistant.</p>
                        <p>I can help you create tracks, add effects, and generate melodies.</p>
                        <p>What would you like to work on?</p>
                    </div>
                </div>
                
                {/* Input Area */}
                <div className="input-area">
                    <div className="input-container">
                        <textarea 
                            className="message-input"
                            placeholder="Ask me to create tracks, add effects, or generate music..."
                            rows={1}
                            disabled={!studioService}
                        ></textarea>
                        <button className="send-btn" type="button" disabled={!studioService}>
                            ▶
                        </button>
                    </div>
                    
                    {!studioService && (
                        <div className="debug-info">
                            ⚠️ Studio service not available
                        </div>
                    )}
                </div>
            </div>
        </div>
    ) as HTMLElement

    // Get references to interactive elements
    const closeBtn = element.querySelector('.close-btn') as HTMLElement
    const messageInput = element.querySelector('.message-input') as HTMLTextAreaElement
    const sendButton = element.querySelector('.send-btn') as HTMLElement
    const messagesContainer = element.querySelector('.messages') as HTMLElement
    
    // Auto-resize textarea
    const autoResize = () => {
        messageInput.style.height = 'auto'
        messageInput.style.height = Math.min(messageInput.scrollHeight, 96) + 'px' // max-height: 6rem = 96px
    }
    
    // Handle input and send functionality
    const handleSendMessage = async () => {
        console.log('🚀 [STATELESS] === SENDING MESSAGE START ===')
        const text = messageInput.value.trim()
        console.log('📝 [STATELESS] Message text:', text)
        
        if (!text || !studioService) {
            console.log('❌ [STATELESS] Empty message or no studio service, returning')
            return
        }
        
        // Check if there's an active project
        const hasProject = hasActiveProject()
        const projectId = getCurrentProjectId()
        
        if (!hasProject || !projectId) {
            console.log('⚠️ Cannot send message - no active project')
            // Show error in UI
            const errorMessage: ChatMessage = {
                role: 'assistant',
                content: '⚠️ Please open a project to start chatting',
                id: `error_${Date.now()}`,
                timestamp: Date.now(),
                isUser: false
            }
            const currentMessages = messages.getValue()
            messages.setValue([...currentMessages, errorMessage])
            updateMessagesDisplay()
            return
        }

        const userId = getCurrentUserId()
        if (!userId) {
            console.error('❌ No user ID available for sending message')
            return
        }

        try {
            // Add user message to UI immediately (optimistic update)
            const userMessage: ChatMessage = {
                role: 'user',
                content: text,
                id: `user_${Date.now()}`,
                timestamp: Date.now(),
                isUser: true
            }
            const currentMessages = messages.getValue()
            messages.setValue([...currentMessages, userMessage])
            updateMessagesDisplay()
            
            // Clear input
            messageInput.value = ''
            autoResize()

            // Add loading indicator with animated dots
            const loadingMessage = addLoadingMessage()

            // Process with stateless agent (loading message will be removed inside)
            await processStatelessMessage({
                message: text,
                userId,
                projectId
            }, loadingMessage)

            updateMessagesDisplay()
            console.log('✅ [STATELESS] === SENDING MESSAGE COMPLETE ===')

        } catch (error) {
            console.error('❌ [STATELESS] Error in handleSendMessage:', error)
            
            // Remove any remaining loading message on error
            const msgs = messages.getValue()
            const hasLoadingMessage = msgs.some(msg => msg.isLoading)
            if (hasLoadingMessage) {
                const updatedMessages = msgs.filter(msg => !msg.isLoading)
                messages.setValue(updatedMessages)
                updateMessagesDisplay()
            }
            
            // Show user-friendly error
            const errorMessage: ChatMessage = {
                role: 'assistant',
                content: `❌ **Error:** ${error instanceof Error ? error.message : String(error)}`,
                id: `error_${Date.now()}`,
                timestamp: Date.now(),
                isUser: false
            }
            const currentMessages = messages.getValue()
            messages.setValue([...currentMessages, errorMessage])
            updateMessagesDisplay()
        }
        
        console.log('🎬 [STATELESS] === HANDLE SEND MESSAGE FUNCTION END ===')
    }
    
    // Function to update messages display based on the messages observable
    const updateMessagesDisplay = () => {
        const currentMessages = messages.getValue()
        
        // Clear welcome message if we have real messages
        if (currentMessages.length > 0) {
            const welcomeMsg = messagesContainer.querySelector('.welcome-message')
            if (welcomeMsg) {
                welcomeMsg.remove()
            }
        }
        
        // Clear all existing messages except welcome
        messagesContainer.querySelectorAll('.message').forEach(msg => msg.remove())
        
        // Add all messages (like opendaw-old)
        currentMessages.forEach(msg => {
            if (msg.isLoading) {
                const messageElement = createElement('div', {className: 'message assistant direct'}) as HTMLElement
                
                if (msg.isToolExecution) {
                    // Tool execution with spinning circle + loading message (directly in chatbot)
                    messageElement.innerHTML = `
                        <div class="tool-loading-mini">
                            <div class="mini-spinner"></div>
                            <div class="mini-text">${msg.content}</div>
                        </div>
                    `
                } else {
                    // Regular loading with 3 dots (directly in chatbot, no bubble)
                    messageElement.innerHTML = `
                        <div class="loading-dots">
                            <span></span>
                            <span></span>
                            <span></span>
                        </div>
                    `
                }
                messagesContainer.appendChild(messageElement)
            } else if (msg.isUser) {
                // User message with bubble (like opendaw-old)
                const messageElement = createElement('div', {className: 'message user'}) as HTMLElement
                messageElement.innerHTML = `
                    <div class="bubble">
                        ${msg.content}
                    </div>
                `
                messagesContainer.appendChild(messageElement)
            } else {
                // Bot message without bubble - direct text with Markdown rendering (like opendaw-old)
                const messageElement = createElement('div', {className: 'message bot direct'}) as HTMLElement
                messageElement.innerHTML = `
                    <div class="bot-text">
                        ${renderMarkdown(msg.content || '')}
                    </div>
                `
                messagesContainer.appendChild(messageElement)
            }
        })
        
        // Scroll to bottom
        messagesContainer.scrollTop = messagesContainer.scrollHeight
    }
    
    // Helper function to manage loading messages
    const addLoadingMessage = (): ChatMessage => {
        const loadingMessage: ChatMessage = {
            role: 'assistant',
            content: '',
            id: `loading_${Date.now()}`,
            timestamp: Date.now(),
            isUser: false,
            isLoading: true
        }
        const currentMessages = messages.getValue()
        messages.setValue([...currentMessages, loadingMessage])
        updateMessagesDisplay()
        return loadingMessage
    }
    
    const removeLoadingMessage = (loadingMessage: ChatMessage) => {
        const updatedMessages = messages.getValue().filter(msg => msg.id !== loadingMessage.id)
        messages.setValue(updatedMessages)
        updateMessagesDisplay()
    }
    
    // Stateless agent processing function
    const processStatelessMessage = async (request: {
        message?: string
        userId: string
        projectId: string
        toolResults?: Array<{ tool_call_id: string; result: any }>
        resultSecretAddress?: string
        isBringUpDrums?: boolean
        searchQuery?: string
    }, loadingMessage?: ChatMessage) => {
        console.log('🚀 [STATELESS] Processing request:', request)
        
        try {
            const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/router`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY || ''}`,
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY || ''
                },
                body: JSON.stringify({
                    route: 'agent-chat',
                    ...request
                })
            })

            if (!response.ok) {
                const errorText = await response.text()
                throw new Error(`HTTP ${response.status}: ${errorText}`)
            }

            const result = await response.json()
            console.log('📨 [STATELESS] Received response:', result)

            if (!result.success) {
                throw new Error(result.error || 'Unknown error')
            }

            // Remove loading message immediately when response is received
            if (loadingMessage) {
                removeLoadingMessage(loadingMessage)
            }

            // Handle response - for now just display the message (no tool handling)
            if (result.message) {
                // Display AI response
                const assistantMessage: ChatMessage = {
                    role: 'assistant',
                    content: result.message,
                    id: `assistant_${Date.now()}`,
                    timestamp: Date.now(),
                    isUser: false
                }
                const currentMessages = messages.getValue()
                messages.setValue([...currentMessages, assistantMessage])
                updateMessagesDisplay()
            }
            
            // Handle tool calls
            if (result.needsToolExecution) {
                const currentUserId = getCurrentUserId()
                const currentProjectId = getCurrentProjectId()
                
                if (currentUserId && currentProjectId) {
                    // Handle server-side tools (tool execution)
                    if (result.send_to_execution && result.secretAddress) {
                        console.log('🔧 Executing server-side tools:', result.secretAddress)
                        await executeToolCallsWithPayload(
                            result.secretAddress, 
                            currentUserId, 
                            currentProjectId, 
                            result.secretLoadingCode,
                            result.isBringUpDrums,
                            result.searchQuery
                        )
                    }
                    
                    // Handle client-side tools (like displayGeneration)
                    if (result.clientToolCalls && result.clientToolCalls.length > 0) {
                        console.log('🎵 Executing client-side tools:', result.clientToolCalls)
                        await executeClientSideTools(
                            result.clientToolCalls, 
                            currentUserId, 
                            currentProjectId,
                            result.isBringUpDrums,
                            result.searchQuery
                        )
                    }
                }
            } else {
                // No tool execution needed - conversation is complete
                // Trigger automatic save to cloud
                console.log('💾 [AUTOSAVE] Conversation complete, checking project state...')
                if (studioService) {
                    try {
                        // Get current profile and log its state
                        const currentProfile = studioService.profileService?.getValue()
                        console.log('🔍 [AUTOSAVE] Current profile exists:', currentProfile ? 'Yes' : 'No')
                        
                        if (currentProfile && 'unwrap' in currentProfile) {
                            const profile = currentProfile.unwrap()
                            console.log('📊 [AUTOSAVE] Project state - saved:', profile.saved(), 'name:', profile.meta?.name)
                            
                            // Log the entire profile for debugging
                            console.log('📋 [AUTOSAVE] Full profile state:', {
                                saved: profile.saved(),
                                hasChanges: profile.hasChanges(),
                                meta: profile.meta,
                                uuid: profile.uuid
                            })
                            
                            // Save based on project state
                            if (!profile.saved()) {
                                console.log('🆕 [AUTOSAVE] New project detected, using saveAsDef()')
                                await studioService.saveAsDef()
                            } else {
                                console.log('💾 [AUTOSAVE] Existing project, using regular save()')
                                await studioService.save()
                            }
                            
                            // Verify the state after save
                            const updatedProfile = studioService.profileService?.getValue()
                            if (updatedProfile && 'unwrap' in updatedProfile) {
                                const updated = updatedProfile.unwrap()
                                console.log('✅ [AUTOSAVE] After save - saved:', updated.saved(), 'name:', updated.meta?.name)
                            }
                        } else {
                            console.warn('⚠️ [AUTOSAVE] No active profile available')
                        }
                    } catch (error) {
                        console.error('❌ [AUTOSAVE] Auto-save failed:', error)
                        // Don't throw - save failure shouldn't break the chat
                    }
                } else {
                    console.warn('⚠️ [AUTOSAVE] No studio service available')
                }
            }

        } catch (error) {
            console.error('❌ [STATELESS] Error processing message:', error)
            // Remove loading message on error too
            if (loadingMessage) {
                try {
                    removeLoadingMessage(loadingMessage)
                } catch (e) {
                    console.warn('Warning: Could not remove loading message on error:', e)
                }
            }
            throw error
        }
    }
    
    /**
     * Get loading message from environment variables
     */
    const getSecretLoadingMessage = (secretLoadingCode: string): string => {
        switch (secretLoadingCode) {
            case 'SEC_001':
                return import.meta.env.VITE_SEC_001 || '🎼 Processing...'
            case 'SEC_002':
                return import.meta.env.VITE_SEC_002 || '🎛️ Working...'
            case 'SEC_003':
                return import.meta.env.VITE_SEC_003 || '🎵 Creating...'
            case 'SEC_004':
                return import.meta.env.VITE_SEC_004 || '⚡ Applying...'
            case 'SEC_005':
                return import.meta.env.VITE_SEC_005 || '📊 Analyzing...'
            case 'SEC_006':
                return import.meta.env.VITE_SEC_006 || '🔧 Processing...'
            default:
                return '🔧 Working...'
        }
    }
    
    /**
     * Execute tool calls using execution token
     */
    const executeToolCallsWithPayload = async (secretAddress: string, userId: string, projectId: string, secretLoadingCode?: string, isBringUpDrums?: boolean, searchQuery?: string) => {
        if (!studioService) {
            console.error('❌ No studio service available for tool execution')
            return
        }
        
        try {
            // Show loading message with spinning circle
            const loadingMessage = secretLoadingCode ? getSecretLoadingMessage(secretLoadingCode) : '🔧 Working...'
            const toolLoadingMessage: ChatMessage = {
                role: 'assistant',
                content: loadingMessage,
                id: `tool_loading_${Date.now()}`,
                timestamp: Date.now(),
                isUser: false,
                isLoading: true,
                isToolExecution: true  // This triggers the spinning circle animation
            }
            const currentMessages = messages.getValue()
            messages.setValue([...currentMessages, toolLoadingMessage])
            updateMessagesDisplay()
            
            // Execute tools using execution token (no tool names/args visible)
            const result = await studioService.executeRemoteToolWithSecretAddress(secretAddress)
            
            // Remove loading message
            const updatedMessages = messages.getValue().filter(msg => msg.id !== toolLoadingMessage.id)
            messages.setValue(updatedMessages)
            updateMessagesDisplay()
            
            if (result.success) {
                // Add loading message while waiting for agent response after tool execution
                const loadingMessage = addLoadingMessage()
                
                // Send tool results back to continue conversation (loading message will be removed inside)
                await processStatelessMessage({
                    userId,
                    projectId,
                    resultSecretAddress: result.resultSecretAddress,
                    isBringUpDrums: isBringUpDrums || false,
                    searchQuery: searchQuery || ''
                }, loadingMessage)
            }
            
        } catch (error) {
            console.error('❌ Error in tool execution flow:', error)
            
            // Clean up any loading messages on error
            const msgs = messages.getValue()
            const hasLoadingMessage = msgs.some(msg => msg.isLoading)
            if (hasLoadingMessage) {
                const updatedMessages = msgs.filter(msg => !msg.isLoading)
                messages.setValue(updatedMessages)
                updateMessagesDisplay()
            }
        }
    }
    
    /**
     * Execute client-side tools (like displayGeneration)
     */
    const executeClientSideTools = async (clientToolCalls: any[], userId: string, projectId: string, isBringUpDrums?: boolean, searchQuery?: string) => {
        console.log('🎵 ========== EXECUTE CLIENT-SIDE TOOLS START ==========')
        console.log('🎵 Number of tool calls:', clientToolCalls.length)
        console.log('🎵 Tool calls:', JSON.stringify(clientToolCalls, null, 2))
        console.log('🎵 User ID:', userId)
        console.log('🎵 Project ID:', projectId)
        
        const toolResults: Array<{ tool_call_id: string; result: any }> = []
        
        try {
            for (let i = 0; i < clientToolCalls.length; i++) {
                const toolCall = clientToolCalls[i]
                const { id, name, args } = toolCall
                
                console.log(`🎵 ===== Tool Call ${i + 1}/${clientToolCalls.length} =====`)
                console.log(`🎵 Tool ID:`, id)
                console.log(`🎵 Tool Name:`, name)
                console.log(`🎵 Tool Args:`, JSON.stringify(args, null, 2))
                
                try {
                    console.log(`🎵 Executing client-side tool: ${name}`)
                    
                    let result: any = null
                    
                    switch (name) {
                        case 'displayGeneration':
                            console.log(`🎵 Calling handleDisplayGeneration...`)
                            result = await handleDisplayGeneration(args.generationId, id)
                            console.log(`🎵 handleDisplayGeneration returned:`, result)
                            break
                        case 'displayDrums':
                            console.log(`🎵 Calling handleDisplayDrums...`)
                            result = await handleDisplayDrums(args.assignmentId, id)
                            console.log(`🎵 handleDisplayDrums returned:`, result)
                            break
                        default:
                            console.error(`❌ Unknown client-side tool: ${name}`)
                            result = {
                                success: false,
                                message: `Unknown client-side tool: ${name}`
                            }
                    }
                    
                    // Collect result for sending back to agent
                    console.log(`🎵 Collecting result for tool ${id}`)
                    toolResults.push({ 
                        tool_call_id: id, 
                        result: result 
                    })
                    console.log(`🎵 Tool result collected. Total results so far: ${toolResults.length}`)
                    
                } catch (error) {
                    console.error(`❌ ===== Tool Call ${i + 1} FAILED =====`)
                    console.error(`❌ Tool Name: ${name}`)
                    console.error(`❌ Error:`, error)
                    console.error(`❌ Stack:`, error instanceof Error ? error.stack : 'N/A')
                    
                    // Collect error result
                    toolResults.push({ 
                        tool_call_id: id, 
                        result: {
                            success: false,
                            message: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
                        }
                    })
                }
            }
            
            console.log('🎵 All client-side tools executed')
            console.log('🎵 Total results:', toolResults.length)
            console.log('🎵 Results:', JSON.stringify(toolResults, null, 2))
            
            // Send tool results back to agent-chat
            if (toolResults.length > 0) {
                console.log('🎵 Sending tool results back to agent-chat...')
                const loadingMessage = addLoadingMessage()
                
                await processStatelessMessage({
                    userId,
                    projectId,
                    toolResults,
                    isBringUpDrums: isBringUpDrums || false,
                    searchQuery: searchQuery || ''
                }, loadingMessage)
                
                console.log('🎵 Tool results sent successfully')
            } else {
                console.warn('⚠️ No tool results to send back')
            }
            
            console.log('🎵 ========== EXECUTE CLIENT-SIDE TOOLS COMPLETE ==========')
            
        } catch (error) {
            console.error('❌ ========== EXECUTE CLIENT-SIDE TOOLS ERROR ==========')
            console.error('❌ Error in client-side tool execution:', error)
            console.error('❌ Stack:', error instanceof Error ? error.stack : 'N/A')
        }
    }
    
    /**
     * Handle displayGeneration tool call (like opendaw-old)
     */
    const handleDisplayGeneration = async (generationId: number, _toolCallId: string): Promise<any> => {
        return new Promise(async (resolve) => {
            try {
                console.log('🎵 ========== DISPLAY GENERATION START ==========')
                console.log('🎵 Generation ID:', generationId)
                console.log('🎵 Tool Call ID:', _toolCallId)
                
                // Fetch generation metadata
                console.log('📊 Step 1: Fetching generation metadata...')
                const metadata = await fetchGenerationMetadata(generationId.toString())
                
                console.log('📊 Step 2: Metadata fetch complete')
                console.log('📊 Metadata exists?', !!metadata)
                console.log('📊 Full metadata:', JSON.stringify(metadata, null, 2))
                
                if (!metadata) {
                    console.error('❌ No metadata returned!')
                    throw new Error(`Generation ${generationId} not found`)
                }
                
                console.log('📊 Checking melody_link:', metadata.melody_link)
                if (!metadata.melody_link) {
                    console.error('❌ No melody_link in metadata!')
                    throw new Error(`Generation ${generationId} has no melody available`)
                }
                
                // ✨ NEW: Extract instrument information from metadata
                console.log('🎹 Step 3: Extracting instrument info...')
                console.log('🎹 input_parameters:', metadata.input_parameters)
                const instrumentName = metadata.input_parameters?.instrument || 'unknown'
                const mood = metadata.input_parameters?.mood || 'unknown'
                const genre = metadata.input_parameters?.genre || 'unknown'
                
                console.log(`🎹 Instrument: ${instrumentName}, Mood: ${mood}, Genre: ${genre}`)
                
                // Create MIDI display component (like opendaw-old)
                console.log('🎼 Step 4: Creating MidiDisplay component...')
                console.log('🎼 MIDI URL:', metadata.melody_link)
                console.log('🎼 Has lifecycle?', !!lifecycle)
                console.log('🎼 Has studioService?', !!studioService)
                
                const midiComponent = MidiDisplay({ 
                    lifecycle, 
                    url: metadata.melody_link, 
                    studioService: studioService || null
                })
                
                console.log('🎼 MidiDisplay component created:', !!midiComponent)
                
                // ✨ NEW: Create instrument info header
                console.log('📝 Step 5: Creating instrument info header...')
                const instrumentHeader = document.createElement('div')
                instrumentHeader.style.cssText = `
                    background: rgba(139, 69, 19, 0.1);
                    border: 1px solid rgba(139, 69, 19, 0.2);
                    border-radius: 8px;
                    padding: 8px 12px;
                    margin: 8px 0;
                    font-size: 0.75rem;
                    color: rgb(139, 69, 19);
                    font-weight: 500;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                `
                
                // Instrument icon mapping
                const instrumentIcons: { [key: string]: string } = {
                    'acoustic_piano': '🎹',
                    'acoustic_guitar': '🎸', 
                    'electric_guitar_clean': '🎸',
                    'string_violin': '🎻',
                    'string_cello': '🎻',
                    'trumpet': '🎺',
                    'sax': '🎷'
                }
                
                const icon = instrumentIcons[instrumentName] || '🎵'
                instrumentHeader.innerHTML = `${icon} <strong>${instrumentName.replace('_', ' ')}</strong> • ${genre} • ${mood}`
                console.log('📝 Instrument header created')
                
                // Create buttons container
                console.log('🔘 Step 6: Creating buttons...')
                const buttonsContainer = document.createElement('div')
                buttonsContainer.style.cssText = `
                    display: flex;
                    gap: 8px;
                    justify-content: flex-start;
                    margin: 8px 0;
                    padding: 0;
                `
                
                // Create Accept button
                const acceptButton = document.createElement('button')
                acceptButton.textContent = '✓ Accept'
                acceptButton.style.cssText = `
                    background: rgba(59, 130, 246, 0.1);
                    color: rgb(59, 130, 246);
                    border: 1px solid rgba(59, 130, 246, 0.2);
                    padding: 6px 12px;
                    border-radius: 12px;
                    cursor: pointer;
                    font-weight: 500;
                    font-size: 0.75rem;
                    transition: all 0.3s ease;
                `
                
                // Create Refuse button
                const refuseButton = document.createElement('button')
                refuseButton.textContent = '✗ Refuse'
                refuseButton.style.cssText = acceptButton.style.cssText
                
                // Handle Accept button click
                console.log('🔘 Setting up button handlers...')
                acceptButton.onclick = async () => {
                    console.log('✅ User accepted generation', generationId)
                    // Keep instrument header and MIDI component, just remove buttons
                    buttonsContainer.remove()
                    
                    const result = {
                        success: true,
                        message: `Generation ${generationId} accepted by user`,
                        user_feedback: 'User likes it'
                    }
                    
                    console.log('✅ Resolving with:', result)
                    resolve(result)
                }
                
                // Handle Refuse button click
                refuseButton.onclick = async () => {
                    console.log('❌ User refused generation', generationId)
                    instrumentHeader.remove()
                    midiComponent.remove()
                    buttonsContainer.remove()
                    
                    const result = {
                        success: true,
                        message: `Generation ${generationId} was refused by user`,
                        user_feedback: 'User doesn\'t like it, regenerate'
                    }
                    
                    console.log('❌ Resolving with:', result)
                    resolve(result)
                }
                
                // Add to chat messages container
                console.log('📍 Step 7: Adding to DOM...')
                const messagesContainer = element.querySelector('.messages') as HTMLElement
                console.log('📍 Messages container found?', !!messagesContainer)
                
                if (messagesContainer) {
                    console.log('📍 Appending instrument header...')
                    messagesContainer.appendChild(instrumentHeader)
                    
                    console.log('📍 Appending MIDI component...')
                    messagesContainer.appendChild(midiComponent)
                    
                    console.log('📍 Appending buttons...')
                    buttonsContainer.appendChild(acceptButton)
                    buttonsContainer.appendChild(refuseButton)
                    messagesContainer.appendChild(buttonsContainer)
                    
                    console.log('📍 Scrolling to bottom...')
                    messagesContainer.scrollTop = messagesContainer.scrollHeight
                    
                    console.log('✅ All elements appended successfully!')
                } else {
                    console.error('❌ Messages container not found!')
                }
                
                console.log('🎵 ========== DISPLAY GENERATION COMPLETE ==========')
                console.log('🎵 DisplayGeneration UI rendered with Accept/Refuse buttons')
                
            } catch (error) {
                console.error('❌ ========== DISPLAY GENERATION ERROR ==========')
                console.error('❌ Generation ID:', generationId)
                console.error('❌ Error type:', error?.constructor?.name)
                console.error('❌ Error message:', error instanceof Error ? error.message : String(error))
                console.error('❌ Full error:', error)
                console.error('❌ Stack trace:', error instanceof Error ? error.stack : 'N/A')
                
                const errorResult = {
                    success: false,
                    message: `Failed to display generation ${generationId}: ${error instanceof Error ? error.message : String(error)}`
                }
                
                console.error('❌ Resolving with error result:', errorResult)
                resolve(errorResult)
            }
        })
    }
    
    /**
     * Handle displayDrums tool call
     */
    const handleDisplayDrums = async (assignmentId: number, _toolCallId: string): Promise<any> => {
        return new Promise(async (resolve) => {
            try {
                console.log('🥁 Handling displayDrums for ID:', assignmentId)
                
                // Fetch drum assignment from database using the PostgreSQL function
                const assignment = await fetchDrumAssignment(assignmentId)
                if (!assignment) {
                    throw new Error(`Drum assignment ${assignmentId} not found`)
                }
                
                console.log('🥁 Fetched drum assignment:', assignment)
                
                // Create DrumPlayer component
                const drumComponent = DrumPlayer({ 
                    lifecycle, 
                    assignment: assignment, 
                    studioService: studioService || null
                })
                
                // Create buttons container
                const buttonsContainer = document.createElement('div')
                buttonsContainer.style.cssText = `
                    display: flex;
                    gap: 8px;
                    justify-content: flex-start;
                    margin: 8px 0;
                    padding: 0;
                `
                
                // Create Accept button
                const acceptButton = document.createElement('button')
                acceptButton.textContent = '✓ Accept'
                acceptButton.style.cssText = `
                    background: rgba(255, 107, 53, 0.1);
                    color: rgb(255, 107, 53);
                    border: 1px solid rgba(255, 107, 53, 0.2);
                    padding: 6px 12px;
                    border-radius: 12px;
                    cursor: pointer;
                    font-weight: 500;
                    font-size: 0.75rem;
                    transition: all 0.3s ease;
                `
                
                // Create Refuse button
                const refuseButton = document.createElement('button')
                refuseButton.textContent = '✗ Refuse'
                refuseButton.style.cssText = acceptButton.style.cssText
                
                // Handle Accept button click
                acceptButton.onclick = async () => {
                    console.log('✅ User accepted drum assignment', assignmentId)
                    buttonsContainer.remove()
                    
                    const result = {
                        success: true,
                        message: `Drum assignment ${assignmentId} accepted by user`,
                        user_feedback: 'User likes the drums'
                    }
                    
                    resolve(result)
                }
                
                // Handle Refuse button click
                refuseButton.onclick = async () => {
                    console.log('❌ User refused drum assignment', assignmentId)
                    drumComponent.remove()
                    buttonsContainer.remove()
                    
                    const result = {
                        success: true,
                        message: `Drum assignment ${assignmentId} was refused by user`,
                        user_feedback: 'User doesn\'t like these drums, try different ones'
                    }
                    
                    resolve(result)
                }
                
                // Add to chat messages container
                const messagesContainer = element.querySelector('.messages') as HTMLElement
                if (messagesContainer) {
                    // Add DrumPlayer first
                    messagesContainer.appendChild(drumComponent)
                    // Then add buttons
                    buttonsContainer.appendChild(acceptButton)
                    buttonsContainer.appendChild(refuseButton)
                    messagesContainer.appendChild(buttonsContainer)
                    messagesContainer.scrollTop = messagesContainer.scrollHeight
                }
                
                console.log('🥁 DisplayDrums UI rendered with Accept/Refuse buttons')
                
            } catch (error) {
                console.error('❌ Error in handleDisplayDrums:', error)
                const errorResult = {
                    success: false,
                    message: `Failed to display drum assignment ${assignmentId}: ${error}`
                }
                resolve(errorResult)
            }
        })
    }
    
    /**
     * Fetch drum assignment from database using PostgreSQL function
     */
    const fetchDrumAssignment = async (assignmentId: number): Promise<any> => {
        try {
            console.log(`🔍 Fetching drum assignment for ID: ${assignmentId}`)
            
            // Call the PostgreSQL function get_drum_assignment
            const { data, error } = await supabase
                .rpc('get_drum_assignment', { assignment_id: assignmentId })
            
            if (error) {
                console.error('❌ Database error:', error)
                throw new Error(`Database error: ${error.message}`)
            }
            
            if (!data) {
                console.log(`⚠️ No drum assignment found for ID: ${assignmentId}`)
                return null
            }
            
            console.log(`✅ Fetched drum assignment:`, data)
            return data
            
        } catch (error) {
            console.error(`❌ Error fetching drum assignment ${assignmentId}:`, error)
            throw error
        }
    }
    
    /**
     * Fetch generation metadata from database
     */
    const fetchGenerationMetadata = async (generationId: string): Promise<any> => {
        console.log(`🔍 ========== FETCH GENERATION METADATA START ==========`)
        console.log(`🔍 Generation ID (string):`, generationId)
        console.log(`🔍 Generation ID (parsed):`, parseInt(generationId))
        console.log(`🔍 Supabase client exists?`, !!supabase)
        
        try {
            console.log(`🔍 Building Supabase query...`)
            console.log(`🔍 Table: generations-metadata`)
            console.log(`🔍 Filter: id = ${parseInt(generationId)}`)
            
            // Use Supabase client instead of direct REST API
            const { data, error } = await supabase
                .from('generations-metadata')
                .select('*')
                .eq('id', parseInt(generationId))
                .single()
            
            console.log(`🔍 Query completed`)
            console.log(`🔍 Has error?`, !!error)
            console.log(`🔍 Has data?`, !!data)
            
            if (error) {
                console.error('❌ Supabase error details:')
                console.error('   - Code:', error.code)
                console.error('   - Message:', error.message)
                console.error('   - Details:', error.details)
                console.error('   - Hint:', error.hint)
                console.error('   - Full error:', error)
                throw new Error(`Failed to fetch generation metadata: ${error.message}`)
            }
            
            if (!data) {
                console.warn(`⚠️ No generation found with ID: ${generationId}`)
                console.warn(`⚠️ This could mean the record doesn't exist in the database`)
                return null
            }
            
            console.log(`✅ Successfully fetched generation metadata`)
            console.log(`✅ Data keys:`, Object.keys(data))
            console.log(`✅ Has melody_link?`, !!data.melody_link)
            console.log(`✅ Has full_link?`, !!data.full_link)
            console.log(`✅ Has input_parameters?`, !!data.input_parameters)
            console.log(`✅ Full metadata:`, JSON.stringify(data, null, 2))
            console.log(`🔍 ========== FETCH GENERATION METADATA COMPLETE ==========`)
            return data
            
        } catch (error) {
            console.error('❌ ========== FETCH GENERATION METADATA ERROR ==========')
            console.error('❌ Error type:', error?.constructor?.name)
            console.error('❌ Error message:', error instanceof Error ? error.message : String(error))
            console.error('❌ Full error:', error)
            console.error('❌ Stack trace:', error instanceof Error ? error.stack : 'N/A')
            return null
        }
    }
    
    
    
    
    // Event listeners
    lifecycle.ownAll(
        // Close button
        Events.subscribe(closeBtn, 'click', () => {
            isOpen.setValue(false)
        }),
        
        // Input handling
        Events.subscribe(messageInput, 'input', autoResize),
        
        Events.subscribe(messageInput, 'keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSendMessage()
            }
        }),
        
        Events.subscribe(sendButton, 'click', handleSendMessage),
        
        // Visibility toggle - add/remove 'open' class for slide animation
        isOpen.subscribe((observable) => {
            const visible = observable.getValue()
            if (visible) {
                element.classList.add('open')
                
                // Load chat history directly when chatbot opens
                console.log('🔄 Chatbot opened - loading chat history')
                loadChatHistoryForCurrentProject()
            } else {
                element.classList.remove('open')
            }
        })
    )
    
    // Initial state - start closed (translateX(100%))
    if (isOpen.getValue()) {
        element.classList.add('open')
        // Load chat history if starting open
        console.log('🔄 Chatbot initially open - loading chat history')
        loadChatHistoryForCurrentProject()
    }
    
    return element
}