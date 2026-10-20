import { Injectable, Logger } from '@nestjs/common';
import ffmpegModule from "fluent-ffmpeg";
const ffmpeg = (ffmpegModule as any).default || ffmpegModule;;
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class MediaProcessor {
  private readonly logger = new Logger(MediaProcessor.name);

  async processToHls(inputPath: string, mediaId: string): Promise<string> {
    const outputDir = path.join(process.cwd(), 'storage', 'hls', mediaId);
    const keysDir = path.join(process.cwd(), 'storage', 'keys');

    await fs.mkdir(outputDir, { recursive: true });
    await fs.mkdir(keysDir, { recursive: true });

    // 1. Generate AES-128 encryption key
    const key = crypto.randomBytes(16);
    
    // Save the actual key file (used by video players to decrypt)
    const keyFileName = `${mediaId}.key`;
    const keyFilePath = path.join(keysDir, keyFileName);
    await fs.writeFile(keyFilePath, key);

    // 2. Generate the keyinfo file for FFmpeg
    // Format:
    // <URI to key (in the HLS manifest)>
    // <Path to key file (local path for FFmpeg)>
    // <IV (optional)>
    
    const keyInfoPath = path.join(outputDir, 'file.keyinfo');
    // The URI players will hit to fetch the key (served by our MediaController)
    const keyUri = `https://yourdomain.com/api/media/keys/${keyFileName}`; 
    
    await fs.writeFile(keyInfoPath, `${keyUri}\n${keyFilePath}\n`);

    // 3. Process video to HLS
    const playlistName = 'index.m3u8';
    const playlistPath = path.join(outputDir, playlistName);

    return new Promise((resolve, reject) => {
      this.logger.log(`Starting HLS transcoding for ${mediaId}`);
      
      ffmpeg(inputPath)
        .outputOptions([
          '-c:v h264',           // Video codec
          '-c:a aac',            // Audio codec
          '-b:v 2000k',          // Video bitrate
          '-b:a 128k',           // Audio bitrate
          '-f hls',              // Format
          '-hls_time 10',        // Segment length
          '-hls_list_size 0',    // Include all segments in the playlist
          `-hls_key_info_file ${keyInfoPath}` // Provide the AES-128 key info
        ])
        .output(playlistPath)
        .on('end', async () => {
          this.logger.log(`Successfully completed transcoding for ${mediaId}`);
          
          // Cleanup the keyinfo file (no longer needed by FFmpeg)
          try {
            await fs.unlink(keyInfoPath);
          } catch (e: any) {
            this.logger.warn(`Failed to cleanup keyinfo file: ${e.message}`);
          }
          
          // Return the relative path to the playlist
          resolve(`hls/${mediaId}/${playlistName}`);
        })
        .on('error', (err: any) => {
          this.logger.error(`Error processing media ${mediaId}`, err.message);
          reject(err);
        })
        .run();
    });
  }
}
