const UPLOAD_CHUNK_BYTES = 3 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

function getAttachmentsRootFolder(): GoogleAppsScript.Drive.Folder {
    const id = PropertiesService.getScriptProperties().getProperty('ATTACHMENTS_FOLDER_ID');
    if (!id)
        throw new Error(
            'Script property ATTACHMENTS_FOLDER_ID is not set. Run ensureAttachmentsFolder() first.',
        );
    return DriveApp.getFolderById(id);
}

function getUploadsRootFolder(): GoogleAppsScript.Drive.Folder {
    return getOrCreateFolder(getAttachmentsRootFolder(), '_uploads');
}

function getOrCreateFolder(
    parent: GoogleAppsScript.Drive.Folder,
    name: string,
): GoogleAppsScript.Drive.Folder {
    const existing = parent.getFoldersByName(name);
    if (existing.hasNext()) return existing.next();
    return parent.createFolder(name);
}

// Client sends the file as base64 in fixed-size chunks over sequential
// google.script.run calls (no confidently safe ceiling for a ~20MB base64
// string in one call, and CacheService caps at 100KB/value so it can't
// stage the whole thing either).
function uploadAttachmentChunk(
    uploadId: string,
    chunkIndex: number,
    totalChunks: number,
    base64Chunk: string,
): { received: number; of: number } {
    requireUser();
    const folder = getOrCreateFolder(getUploadsRootFolder(), uploadId);
    const bytes = Utilities.base64Decode(base64Chunk);
    folder.createFile(Utilities.newBlob(bytes, 'application/octet-stream', 'chunk-' + chunkIndex));
    return { received: chunkIndex + 1, of: totalChunks };
}

function finishAttachmentUpload(
    uploadId: string,
    ownerType: AttachmentOwnerType,
    ownerId: string,
    fileName: string,
    contentType: string,
    sizeBytes: number,
    requestId: string,
): AttachmentUploadResult {
    const actor = requireUser();
    assertAttachmentAccess(actor, ownerType, ownerId);
    if (ALLOWED_CONTENT_TYPES.indexOf(contentType) === -1)
        throw new ValidationError('unsupported_content_type');
    if (sizeBytes <= 0 || sizeBytes > MAX_ATTACHMENT_BYTES)
        throw new ValidationError('file_too_large');

    const { result } = withLockedDedupe('attachment:create', requestId, () => {
        const uploadFolder = getOrCreateFolder(getUploadsRootFolder(), uploadId);
        const chunkIterator = uploadFolder.getFiles();
        const chunks: GoogleAppsScript.Drive.File[] = [];
        while (chunkIterator.hasNext()) chunks.push(chunkIterator.next());
        chunks.sort(
            (a, b) => Number(a.getName().split('-')[1]) - Number(b.getName().split('-')[1]),
        );

        let merged = new Uint8Array(0);
        chunks.forEach((f) => {
            const bytes = f.getBlob().getBytes();
            const next = new Uint8Array(merged.length + bytes.length);
            next.set(merged);
            next.set(bytes, merged.length);
            merged = next;
        });
        if (merged.length !== sizeBytes) throw new ValidationError('upload_incomplete');

        const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
        const destFolder = getOrCreateFolder(
            getOrCreateFolder(getAttachmentsRootFolder(), ownerType),
            ownerId,
        );
        const file = destFolder.createFile(
            Utilities.newBlob(
                Array.from(merged),
                contentType,
                Utilities.getUuid() + '-' + safeName,
            ),
        );

        const attachment = Tables.Attachments.insert({
            OwnerType: ownerType,
            OwnerId: ownerId,
            DriveFileId: file.getId(),
            OriginalName: fileName,
            ContentType: contentType,
            SizeBytes: sizeBytes,
            UploadedBy: actor.Id,
            CreatedAt: nowIso(),
        });
        logActivity(actor.Id, 'attachment', attachment.Id, 'create', null, attachment, {});

        uploadFolder.setTrashed(true);
        return attachment;
    });

    return {
        Id: result.Id,
        DriveFileId: result.DriveFileId,
        OriginalName: result.OriginalName,
        ContentType: result.ContentType,
        SizeBytes: result.SizeBytes,
    };
}

// Files stay private to the script's own identity; nothing is ever shared
// directly with end users. Re-running this access check on every call is
// what stands in for the source app's 5-minute signed download URL.
function getAttachmentContent(attachmentId: string): AttachmentContent {
    const actor = requireUser();
    const attachment = Tables.Attachments.findById(attachmentId);
    if (!attachment) throw new ValidationError('not_found');
    assertAttachmentAccess(actor, attachment.OwnerType, attachment.OwnerId, attachment.UploadedBy);
    const blob = DriveApp.getFileById(attachment.DriveFileId).getBlob();
    return {
        base64: Utilities.base64Encode(blob.getBytes()),
        contentType: attachment.ContentType,
        fileName: attachment.OriginalName,
    };
}

function listAttachmentsFor(ownerType: AttachmentOwnerType, ownerId: string): Attachment[] {
    const actor = requireUser();
    assertAttachmentAccess(actor, ownerType, ownerId);
    return Tables.Attachments.findWhere((a) => a.OwnerType === ownerType && a.OwnerId === ownerId);
}

function assertAttachmentAccess(
    actor: Profile,
    ownerType: AttachmentOwnerType,
    ownerId: string,
    uploadedBy?: string,
): void {
    if (actor.Role === 'admin') return;
    if (uploadedBy && uploadedBy === actor.Id) return;
    if (ownerType === 'profile' && ownerId === actor.Id) return;
    if (ownerType === 'inventory_request') {
        const r = Tables.InventoryRequests.findById(ownerId);
        if (r && r.RequesterId === actor.Id) return;
    }
    if (ownerType === 'ticket' || ownerType === 'ticket_comment') return; // any active user
    throw new AuthorizationError('You do not have access to this file.');
}
