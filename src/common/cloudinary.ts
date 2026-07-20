import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function uploadToCloudinary(file: Express.Multer.File, folder = 'florieren'): Promise<string> {
  const mime = file.mimetype ?? '';
  const isPdf = mime === 'application/pdf' || file.originalname?.toLowerCase().endsWith('.pdf');
  const isVideo = mime.startsWith('video/');
  const isAudio = mime.startsWith('audio/');

  // Cloudinary resource_type:
  //  'image'  → images
  //  'video'  → video AND audio files
  //  'raw'    → PDFs and other binary files
  //  'auto'   → let Cloudinary detect (works for most, but explicit is safer)
  const resource_type: 'image' | 'video' | 'raw' | 'auto' =
    isPdf ? 'raw' :
    isVideo || isAudio ? 'video' :
    'auto';

  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      { folder, resource_type, type: 'upload', access_mode: 'public' },
      (err, result) => {
        if (err || !result) return reject(err);
        resolve(result.secure_url);
      },
    ).end(file.buffer);
  });
}
