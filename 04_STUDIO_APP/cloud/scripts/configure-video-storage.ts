// Idempotent Storage setting, preserves the private bucket and all existing accepted formats.
import {loadLocalEnv,adminClient,assertTarget} from '../src/config.js';
import {checked} from '../src/library.js';
import {AUDIO_MIMES} from '../src/audio-upload.js';
loadLocalEnv();assertTarget();const db=adminClient();
const bucket=checked(await db.storage.getBucket('estudio'));
if(bucket.public)throw new Error('El bucket del Estudio debe ser privado.');
if(bucket.allowed_mime_types){
 const allowed=[...new Set([...bucket.allowed_mime_types,...AUDIO_MIMES,'video/mp4'])];
 checked(await db.storage.updateBucket('estudio',{public:false,fileSizeLimit:bucket.file_size_limit||52428800,allowedMimeTypes:allowed}));
}
const result=checked(await db.storage.getBucket('estudio'));
if(result.public||result.allowed_mime_types&&[...AUDIO_MIMES,'video/mp4'].some(m=>!result.allowed_mime_types.includes(m)))throw new Error('No se pudo habilitar audio y MP4.');
console.log('Storage privado verificado: audio de narración y MP4 habilitados.');
