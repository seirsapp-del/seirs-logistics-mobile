import {
  Controller, Post, Query, UploadedFile, UseGuards,
  UseInterceptors, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { extname } from 'path';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UploadService } from './upload.service';

type UploadFolder = 'kyc' | 'proof' | 'avatars';

@UseGuards(JwtAuthGuard)
@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  // POST /api/v1/upload?folder=kyc|proof|avatars
  @Post()
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
    fileFilter: (_req, file, cb) => {
      if (/\.(jpe?g|png|pdf)$/i.test(extname(file.originalname))) {
        cb(null, true);
      } else {
        cb(new BadRequestException('Only JPEG, PNG, and PDF files are allowed'), false);
      }
    },
  }))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Query('folder') folder: string,
  ) {
    if (!file) throw new BadRequestException('No file provided.');

    const validFolders: UploadFolder[] = ['kyc', 'proof', 'avatars'];
    const dest: UploadFolder = validFolders.includes(folder as UploadFolder)
      ? (folder as UploadFolder)
      : 'kyc';

    const url = await this.uploadService.uploadBuffer(file.buffer, file.originalname, dest);
    return { url };
  }
}
