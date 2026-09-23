import { supabase } from '../supabase';

export const IMAGE_BUCKET = 'request-images';
export const IMAGE_CACHE_CONTROL = '31536000';

export function publicImageUrl(imageId: string): string {
    const path = imageId.trim();
    if (!path) return '';
    return supabase().storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}
