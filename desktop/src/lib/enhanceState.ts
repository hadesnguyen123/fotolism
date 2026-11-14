import type { CapturedPhoto } from '../store/slices/sessionSlice'

export function isPhotoEnhanced(photo: CapturedPhoto): boolean {
    const normalize = (value: string) => value.replace(/^file:\/+/, '').replace(/\\/g, '/').toLowerCase()
    return photo.enhanceStatus === 'processed' && Boolean(photo.enhancedPath) &&
        normalize(photo.enhancedPath) !== normalize(photo.rawPath)
}
