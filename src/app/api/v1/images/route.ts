import { apiHandler, jsonCreated } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { isDemoMode } from '@/lib/env';
import { uploadImageToDrive } from '@/lib/drive';
import { imageUploadSchema } from '@/lib/schemas';

export async function POST(request: Request) {
    return apiHandler(async () => {
        await requireUser();
        const formData = await request.formData();
        const file = formData.get('file');
        if (!(file instanceof File)) {
            throw new Error('A file field is required.');
        }
        imageUploadSchema.parse({
            fileName: file.name,
            contentType: file.type,
            sizeBytes: file.size,
        });

        if (isDemoMode) return jsonCreated({ driveFileId: `demo-${crypto.randomUUID()}` });

        const bytes = Buffer.from(await file.arrayBuffer());
        const driveFileId = await uploadImageToDrive(bytes, file.name, file.type);
        return jsonCreated({ driveFileId });
    });
}
