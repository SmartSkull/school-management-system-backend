import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function uploadToCloudinary(file: Express.Multer.File, folder = 'florieren'): Promise<string> {
  const isPdf = file.mimetype === 'application/pdf' || file.originalname?.toLowerCase().endsWith('.pdf');
  const resource_type = isPdf ? 'raw' : 'auto';
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream({ folder, resource_type, type: 'upload', access_mode: 'public' }, (err, result) => {
      if (err || !result) return reject(err);
      resolve(result.secure_url);
    }).end(file.buffer);
  });
}
