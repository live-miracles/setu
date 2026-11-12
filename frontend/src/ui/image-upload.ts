import { api } from '../api';
import { supabase } from '../supabase';
import { IMAGE_BUCKET, IMAGE_CACHE_CONTROL } from './image-storage';
import { prepareInventoryImage } from './inventory-image';

// Uploads a photo for a request or an inventory type and returns the stored
// image id (storage path) to save on the record: the image is prepared in the
// browser, uploaded through a signed URL the edge function issues after
// checking the caller may change that target, then referenced by id.
export async function uploadTargetImage(
    file: File,
    target: { type: 'inventory_request' | 'inventory_type'; id: string; fileName?: string },
): Promise<string> {
    const prepared = await prepareInventoryImage(file);
    const upload = await api.createImageUploadUrl(
        target.fileName ?? prepared.fileName,
        prepared.mimeType,
        target.type,
        target.id,
    );
    const { error } = await supabase()
        .storage.from(IMAGE_BUCKET)
        .uploadToSignedUrl(upload.path, upload.token, prepared.blob, {
            cacheControl: IMAGE_CACHE_CONTROL,
            contentType: prepared.mimeType,
        });
    if (error) throw error;
    return upload.path;
}
