import { inject, Injectable } from '@angular/core';
import { HttpBackend, HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

type CloudinaryUploadResponse = {
  secure_url: string;
};

@Injectable({ providedIn: 'root' })
export class CloudinaryService {
  private readonly backend = inject(HttpBackend);
  private readonly httpNoInterceptor = new HttpClient(this.backend);
  private readonly uploadUrl = 'https://api.cloudinary.com/v1_1/duexuyqtm/image/upload';

  uploadImage(file: File): Observable<CloudinaryUploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', 'leregarddemanon');
    formData.append('folder', 'LeRegardDeManon');

    return this.httpNoInterceptor.post<CloudinaryUploadResponse>(this.uploadUrl, formData);
  }
}
