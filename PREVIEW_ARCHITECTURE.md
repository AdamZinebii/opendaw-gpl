# Preview Workspace Architecture

## Overview

The preview workspace is a **completely separate project instance** that allows users to preview AI-generated songs before applying them to their main project. This ensures the original project remains untouched until the user explicitly accepts the preview.

## Key Architecture Components

### 1. Separate Preview Project (`StudioService.ts`)

```typescript
readonly preview = {
    isActive: new DefaultObservableValue<boolean>(false),
    showModal: new DefaultObservableValue<boolean>(false),
    previewProject: null as any | null,          // SEPARATE project instance
    previewProfile: null as any | null,          // SEPARATE profile instance
    originalProjectData: null as { profile: ProjectProfile, uuid: UUID.Format } | null,
    currentPrompt: null as string | null
}
```

**Critical Design Principle**: The preview project is stored SEPARATELY from the active project. The original project remains active in `profileService` during the entire preview process.

### 2. Tool Execution Routing

Tool execution now checks if preview mode is active and routes accordingly:

```typescript
// Extract project data - from PREVIEW if active
const projectData = this.preview.isActive.getValue() && this.preview.previewProject
    ? this.extractProjectDataFrom(this.preview.previewProject, this.preview.previewProfile)
    : this.extractProjectData()
```

When applying changes from the server:

```typescript
if (this.preview.isActive.getValue() && this.preview.previewProfile) {
    // Apply to PREVIEW project (not active project!)
    const newProject = await this.reconstructProjectFromData(modifiedProjectData)
    this.preview.previewProject = newProject
    this.preview.previewProfile = newPreviewProfile
} else {
    // Apply to active project (normal mode)
    this.profileService.setValue(Option.wrap(newProfile))
}
```

### 3. Preview Workflow

#### Step 1: Create Preview (`createPreviewWorkspace`)

```typescript
private async createPreviewWorkspace(prompt: string): Promise<void> {
    // Save original project reference (stays active!)
    this.preview.originalProjectData = {
        profile: currentProfile,
        uuid: currentProfile.uuid
    }
    
    // Create SEPARATE preview project
    const previewProject = Project.new(this)
    const previewProfile = new ProjectProfile(...)
    
    // Store separately (DO NOT set as active!)
    this.preview.previewProject = previewProject
    this.preview.previewProfile = previewProfile
    this.preview.isActive.setValue(true)
}
```

#### Step 2: Song-Maker Execution

All tool calls from `song-maker` are now applied to the preview project:
- STEP 1 (structure planning) → preview project
- STEP 2 (content generation) → preview project
- All effects, arrangements, etc. → preview project

The original project remains completely untouched.

#### Step 3: Preview Display

After loading completes, the `PreviewBanner` modal appears showing:
- Preview project tracks with full DAW timeline UI
- Independent playback controls
- Options: Regenerate, Discard, Apply to DAW

#### Step 4: User Decision

**Accept (`acceptPreview`):**
```typescript
// Extract preview data
const previewData = this.extractProjectDataFrom(this.preview.previewProject, this.preview.previewProfile)

// Restore original project
this.profileService.setValue(Option.wrap(this.preview.originalProjectData.profile))

// Merge preview tracks into it
await this.applyProjectChanges(previewData)
```

**Reject (`rejectPreview`):**
```typescript
// Simply discard preview - original already active
this.clearPreviewState()
```

**Regenerate (`regeneratePreview`):**
```typescript
// Discard current preview
await this.rejectPreview()

// Start fresh with same prompt
await this.handleSongPrompt(prompt)
```

## Preview UI Components

### PreviewBanner (`PreviewBanner.tsx`)

- Modal overlay with backdrop
- Shows preview timeline component
- Action buttons (Regenerate, Discard, Apply to DAW)
- Larger window (85% width, max 1200px, 80vh height) to accommodate timeline

### PreviewTimeline (`PreviewTimeline.tsx`)

A simplified DAW timeline view for the preview project:

- **Transport Controls**: Play/Stop buttons with independent playback
- **Position Display**: Bar:Beat counter and BPM display
- **Tracks Visualization**: List of all generated tracks with:
  - Track name and type
  - Icon based on instrument type (Piano for Sampler, Waveform for Audio)
  - 16-bar indicator visualization
- **Independent Engine**: Uses preview project's own `engine` for playback

```typescript
const {engine} = project  // Preview project's engine!

const togglePlayPause = () => {
    if (engine.isPlaying.getValue()) {
        engine.stop(false)
    } else {
        engine.play()
    }
}
```

## Technical Benefits

1. **Non-Destructive**: Original project is never modified until user accepts
2. **Real Preview**: Uses actual DAW instruments (Samplers, AudioPlayers) not mock data
3. **Independent Playback**: Preview has its own audio engine and transport
4. **Full DAW Experience**: Users see and hear exactly what will be applied
5. **Iterative Workflow**: Easy to regenerate or modify before accepting

## Song-Maker Integration

The song-maker function generates 16-bar loops for all tracks:

```typescript
// In song-maker STEP 1 - melody generation
body: JSON.stringify({
    length: 16,  // 16 bars for preview workspace
    // ...
})
```

Arrangement templates are simplified for 16-bar loops:

```typescript
const arrangementPrompt = `...
**IMPORTANT: All loops are exactly 16 bars. Create simple, looped arrangements that fit within 16 bars.**

Simple Arrangement (Most genres):
- Full loop: All tracks play for full 16 bars [[0, 16]]
- OR create variation with intro/main sections:
  - Intro (0-4): Some tracks only
  - Main (4-16): All tracks
...`
```

## Future Enhancements

Possible improvements to the preview system:

1. **Loop Editing**: Allow users to edit notes/parameters in preview before applying
2. **Track Selection**: Let users choose which tracks to apply (not all)
3. **Extended Preview**: Support longer previews (32, 64 bars)
4. **Visual Waveforms**: Show actual audio waveforms in timeline
5. **Mixer View**: Preview with volume/pan controls



