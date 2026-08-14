// Persistent app attachment storage — isolated from the upload-oriented root
// entry so consumers that only need durable local copies do not load the legacy
// upload file-system adapter.

export { createExpoDocumentFileStore } from './expo/durableFileStore';
