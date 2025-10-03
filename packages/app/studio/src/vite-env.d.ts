/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL: string
    readonly VITE_SUPABASE_ANON_KEY: string
    readonly VITE_API_BASE_URL?: string
    readonly VITE_PROJECTS_QUERY?: string
    readonly VITE_DELETE_PROJECT_QUERY?: string
    readonly VITE_SEC_001?: string  // Secret loading message 1
    readonly VITE_SEC_002?: string  // Secret loading message 2
    readonly VITE_SEC_003?: string  // Secret loading message 3
    readonly VITE_SEC_004?: string  // Secret loading message 4
    readonly VITE_SEC_005?: string  // Secret loading message 5
    readonly VITE_SEC_006?: string  // Secret loading message 6
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}