import { Storage } from '@google-cloud/storage';
import { AppError } from '../shared/middleware/error-handler';

export class VideoService {
  private storage: Storage;
  private bucketName: string;
  
  constructor() {
    this.storage = new Storage({
      projectId: process.env.GCP_PROJECT_ID
    });
    this.bucketName = process.env.VIDEO_BUCKET_NAME || 'teach-niche-videos';
  }
  
  async generateSignedUrl(lessonId: string, userId: string): Promise<string> {
    const hasPurchased = true;
    
    if (!hasPurchased) {
      throw new AppError(403, 'Access denied - purchase required');
    }
    
    const fileName = `lessons/${lessonId}/video.mp4`;
    const [url] = await this.storage
      .bucket(this.bucketName)
      .file(fileName)
      .getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + 4 * 60 * 60 * 1000
      });
      
    return url;
  }
}