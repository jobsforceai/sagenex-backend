import { S3 } from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import 'dotenv/config';

const s3 = new S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

/**
 * Uploads a file to the S3 bucket.
 * @param file The file object from multer.
 * @param userId The ID of the user uploading the file.
 * @returns The S3 URL of the uploaded file.
 */
export const uploadToS3 = async (file: Express.Multer.File, userId: string): Promise<string> => {
  const key = `kyc/${userId}/${uuidv4()}-${file.originalname}`;

  const params = {
    Bucket: process.env.S3_BUCKET_NAME!,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype,
  };

  const { Location } = await s3.upload(params).promise();
  return Location;
};
