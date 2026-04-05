/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Camera, 
  Upload, 
  Image as ImageIcon, 
  Download, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle,
  User,
  Printer,
  Maximize2
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { cn } from './lib/utils';

// Initialize Gemini API
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

interface PassportPhotoState {
  originalImage: string | null;
  processedImage: string | null;
  isProcessing: boolean;
  error: string | null;
}

export default function App() {
  const [state, setState] = useState<PassportPhotoState>({
    originalImage: null,
    processedImage: null,
    isProcessing: false,
    error: null,
  });
  
  const [activeTab, setActiveTab] = useState<'upload' | 'preview' | 'camera'>('upload');
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [fileName, setFileName] = useState('passport-photo-3x4');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const startCamera = async () => {
    setActiveTab('camera');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      setState(prev => ({ ...prev, error: "Không thể truy cập camera. Vui lòng kiểm tra quyền truy cập." }));
      setActiveTab('upload');
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/png');
        setState(prev => ({
          ...prev,
          originalImage: dataUrl,
          processedImage: null,
          error: null
        }));
        stopCamera();
        setActiveTab('preview');
      }
    }
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setState(prev => ({
          ...prev,
          originalImage: e.target?.result as string,
          processedImage: null,
          error: null
        }));
        setActiveTab('preview');
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    multiple: false
  } as any);

  const processImage = async () => {
    if (!state.originalImage) return;

    setState(prev => ({ ...prev, isProcessing: true, error: null }));

    try {
      const base64Data = state.originalImage.split(',')[1];
      const response = await genAI.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType: 'image/png',
              },
            },
            {
              text: 'Please process this photo into a professional passport photo. 1. Remove the background and replace it with a solid white background. 2. Change the person\'s clothing to a professional dark business suit with a white shirt and a matching tie. 3. Ensure the person\'s face and head remain the same, but the attire is replaced naturally. 4. Ensure the person is centered and the lighting is even. 5. The final output must be suitable for a 3x4 aspect ratio crop. Return only the processed image.',
            },
          ],
        },
      });

      let processedUrl = null;
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          processedUrl = `data:image/png;base64,${part.inlineData.data}`;
          break;
        }
      }

      if (processedUrl) {
        setState(prev => ({ ...prev, processedImage: processedUrl, isProcessing: false }));
      } else {
        throw new Error('Could not generate processed image. Please try again.');
      }
    } catch (err) {
      console.error(err);
      setState(prev => ({ 
        ...prev, 
        isProcessing: false, 
        error: 'Đã có lỗi xảy ra khi xử lý ảnh. Vui lòng thử lại với ảnh khác.' 
      }));
    }
  };

  const triggerDownloadModal = () => {
    if (!state.processedImage) return;
    setShowDownloadModal(true);
  };

  const executeDownload = () => {
    if (!state.processedImage) return;
    
    // Create a canvas to force 3x4 aspect ratio
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Standard 3x4 size in pixels (e.g., 600x800 for high quality)
      const targetWidth = 600;
      const targetHeight = 800;
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      // Calculate crop to maintain 3:4 aspect ratio from center
      const imgAspect = img.width / img.height;
      const targetAspect = targetWidth / targetHeight;

      let sourceX = 0;
      let sourceY = 0;
      let sourceWidth = img.width;
      let sourceHeight = img.height;

      if (imgAspect > targetAspect) {
        // Image is wider than 3:4
        sourceWidth = img.height * targetAspect;
        sourceX = (img.width - sourceWidth) / 2;
      } else {
        // Image is taller than 3:4
        sourceHeight = img.width / targetAspect;
        sourceY = (img.height - sourceHeight) / 2;
      }

      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, targetWidth, targetHeight);
      ctx.drawImage(img, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, targetWidth, targetHeight);

      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `${fileName || 'passport-photo'}.png`;
      link.click();
      setShowDownloadModal(false);
    };
    img.src = state.processedImage;
  };

  const handlePrint = () => {
    if (!state.processedImage) return;
    window.print();
  };

  const generatePrintSheet = () => {
    if (!state.processedImage) return;

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // A4 size at 300 DPI is roughly 2480x3508
      // For a good quality web print sheet, let's use 1240x1754 (150 DPI)
      const canvasWidth = 1240;
      const canvasHeight = 1754;
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;

      // Fill background
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

      // Passport photo size in pixels (35mm x 45mm at 150 DPI)
      // 1 inch = 25.4mm. 150 pixels per inch.
      // 35mm = (35/25.4) * 150 = ~206px
      // 45mm = (45/25.4) * 150 = ~265px
      const photoWidth = Math.round((35 / 25.4) * 150);
      const photoHeight = Math.round((45 / 25.4) * 150);

      const margin = 50;
      const gap = 30;
      const cols = 2;
      const rows = 4;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = margin + c * (photoWidth + gap);
          const y = margin + r * (photoHeight + gap);

          // Draw border/cut line
          ctx.strokeStyle = '#e2e8f0';
          ctx.lineWidth = 1;
          ctx.strokeRect(x - 1, y - 1, photoWidth + 2, photoHeight + 2);

          // Draw photo
          ctx.drawImage(img, x, y, photoWidth, photoHeight);
        }
      }

      // Add some text info
      ctx.fillStyle = '#94a3b8';
      ctx.font = '20px sans-serif';
      ctx.fillText('Passport Photo Pro - Bản in 3x4 (8 tấm)', margin, canvasHeight - 40);

      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `ban-in-3x4-${fileName || 'photo'}.png`;
      link.click();
    };
    img.src = state.processedImage;
  };

  const reset = () => {
    setState({
      originalImage: null,
      processedImage: null,
      isProcessing: false,
      error: null,
    });
    setActiveTab('upload');
  };

  const retake = () => {
    setState({
      originalImage: null,
      processedImage: null,
      isProcessing: false,
      error: null,
    });
    startCamera();
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans selection:bg-blue-100">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
              <Camera className="text-white w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-800">Passport Photo Pro</h1>
          </div>
          <div className="hidden sm:flex items-center gap-6 text-sm font-medium text-slate-500">
            <span className="text-blue-600">Xử lý AI</span>
            <span>Thay trang phục</span>
            <span>Kích thước 3x4</span>
            <span>Chuẩn quốc tế</span>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 md:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Controls & Info */}
          <div className="lg:col-span-4 space-y-6">
            <section className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Maximize2 className="w-5 h-5 text-blue-500" />
                Hướng dẫn chụp
              </h2>
              <ul className="space-y-3 text-sm text-slate-600">
                <li className="flex gap-3">
                  <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                  <span>Nhìn thẳng vào camera, giữ vai cân bằng.</span>
                </li>
                <li className="flex gap-3">
                  <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                  <span>Ánh sáng đều, tránh đổ bóng trên mặt.</span>
                </li>
                <li className="flex gap-3">
                  <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                  <span>Biểu cảm khuôn mặt trung tính.</span>
                </li>
                <li className="flex gap-3">
                  <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                  <span>Không đeo kính râm hoặc phụ kiện che mặt.</span>
                </li>
                <li className="flex gap-3">
                  <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                  <span>Tự động định dạng chuẩn 3x4 khi tải về.</span>
                </li>
              </ul>
            </section>

            <section className="bg-blue-50 rounded-2xl p-6 border border-blue-100">
              <h2 className="text-blue-800 font-semibold mb-2">Tính năng AI Cao Cấp</h2>
              <p className="text-sm text-blue-700 leading-relaxed">
                Hệ thống sử dụng Gemini 2.5 Flash để tự động nhận diện khuôn mặt, xóa phông nền và <strong>tự động thay trang phục véc & cà vạt</strong> theo tiêu chuẩn công sở chuyên nghiệp.
              </p>
            </section>
          </div>

          {/* Right Column: Main Area */}
          <div className="lg:col-span-8">
            <AnimatePresence mode="wait">
              {activeTab === 'upload' ? (
                <motion.div
                  key="upload"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="bg-white rounded-3xl p-8 md:p-12 shadow-sm border border-slate-200 text-center"
                >
                  <div 
                    {...getRootProps()} 
                    className={cn(
                      "border-2 border-dashed rounded-2xl p-12 transition-all cursor-pointer group mb-6",
                      isDragActive ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-blue-400 hover:bg-slate-50"
                    )}
                  >
                    <input {...getInputProps()} />
                    <div className="flex flex-col items-center">
                      <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                        <Upload className="w-10 h-10 text-slate-400 group-hover:text-blue-500" />
                      </div>
                      <h3 className="text-xl font-semibold mb-2">Tải ảnh của bạn lên</h3>
                      <p className="text-slate-500 mb-8 max-w-xs mx-auto">
                        Kéo thả ảnh vào đây hoặc click để chọn từ thiết bị của bạn.
                      </p>
                      <button className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-medium shadow-lg shadow-blue-200 transition-all active:scale-95">
                        Chọn ảnh
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 justify-center">
                    <div className="h-px bg-slate-200 flex-1"></div>
                    <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">Hoặc</span>
                    <div className="h-px bg-slate-200 flex-1"></div>
                  </div>

                  <div className="mt-6">
                    <button 
                      onClick={startCamera}
                      className="w-full sm:w-auto bg-white border-2 border-slate-200 hover:border-blue-500 hover:text-blue-600 text-slate-600 px-8 py-4 rounded-2xl font-bold transition-all flex items-center justify-center gap-3 active:scale-95"
                    >
                      <Camera className="w-5 h-5" />
                      Chụp ảnh bằng Camera
                    </button>
                  </div>
                  
                  <div className="mt-12 grid grid-cols-3 gap-4">
                    <div className="p-4 rounded-xl bg-slate-50 flex flex-col items-center gap-2">
                      <ImageIcon className="w-6 h-6 text-slate-400" />
                      <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">JPG/PNG</span>
                    </div>
                    <div className="p-4 rounded-xl bg-slate-50 flex flex-col items-center gap-2">
                      <User className="w-6 h-6 text-slate-400" />
                      <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Chân dung</span>
                    </div>
                    <div className="p-4 rounded-xl bg-slate-50 flex flex-col items-center gap-2">
                      <Printer className="w-6 h-6 text-slate-400" />
                      <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Sẵn sàng in</span>
                    </div>
                  </div>
                </motion.div>
              ) : activeTab === 'camera' ? (
                <motion.div
                  key="camera"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-slate-200"
                >
                  <div className="flex items-center justify-between mb-6">
                    <button 
                      onClick={() => { stopCamera(); setActiveTab('upload'); }}
                      className="text-sm font-medium text-slate-500 hover:text-slate-800 flex items-center gap-2 transition-colors"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Quay lại
                    </button>
                    <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-bold uppercase tracking-wider">
                      <Camera className="w-3 h-3" />
                      Đang mở Camera
                    </div>
                  </div>

                  <div className="relative aspect-[4/3] sm:aspect-video rounded-2xl overflow-hidden bg-black border border-slate-200 shadow-inner">
                    <video 
                      ref={videoRef} 
                      autoPlay 
                      playsInline 
                      className="w-full h-full object-cover scale-x-[-1]"
                    />
                    <div className="absolute inset-0 pointer-events-none border-[40px] border-black/20 flex items-center justify-center">
                      <div className="w-[280px] h-[373px] border-2 border-dashed border-white/50 rounded-lg flex items-center justify-center">
                        <div className="text-white/30 text-xs font-bold uppercase tracking-widest text-center">
                          Căn chỉnh khuôn mặt<br/>vào khung này
                        </div>
                      </div>
                    </div>
                  </div>

                  <canvas ref={canvasRef} className="hidden" />

                  <div className="mt-8 flex gap-4">
                    <button 
                      onClick={capturePhoto}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl font-bold shadow-lg shadow-blue-200 transition-all flex items-center justify-center gap-3 active:scale-95"
                    >
                      <Camera className="w-6 h-6" />
                      Chụp ảnh ngay
                    </button>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="preview"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-slate-200"
                >
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={reset}
                        className="text-sm font-medium text-slate-500 hover:text-slate-800 flex items-center gap-2 transition-colors"
                      >
                        <RefreshCw className="w-4 h-4" />
                        Làm lại
                      </button>
                      <button 
                        onClick={retake}
                        className="text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center gap-2 transition-colors"
                      >
                        <Camera className="w-4 h-4" />
                        Chụp lại
                      </button>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1 bg-green-50 text-green-700 rounded-full text-xs font-bold uppercase tracking-wider">
                      <CheckCircle2 className="w-3 h-3" />
                      Đã tải lên
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Original Preview */}
                    <div className="space-y-4">
                      <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Ảnh gốc</h4>
                      <div className="aspect-[3/4] rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 relative group">
                        {state.originalImage && (
                          <img 
                            src={state.originalImage} 
                            alt="Original" 
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        )}
                        {!state.processedImage && !state.isProcessing && (
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={processImage}
                              className="bg-white text-slate-900 px-6 py-2 rounded-full font-bold shadow-xl"
                            >
                              Xử lý ngay
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Result Preview */}
                    <div className="space-y-4">
                      <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Kết quả AI</h4>
                      <div className="aspect-[3/4] rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center relative">
                        {state.isProcessing ? (
                          <div className="flex flex-col items-center gap-4">
                            <motion.div 
                              animate={{ rotate: 360 }}
                              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                              className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full"
                            />
                            <p className="text-sm font-medium text-slate-500 animate-pulse">Đang xóa phông...</p>
                          </div>
                        ) : state.processedImage ? (
                          <img 
                            src={state.processedImage} 
                            alt="Processed" 
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : state.error ? (
                          <div className="p-6 text-center">
                            <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
                            <p className="text-sm text-red-500 font-medium">{state.error}</p>
                          </div>
                        ) : (
                          <div className="text-center p-8">
                            <div className="w-16 h-16 bg-slate-200 rounded-full flex items-center justify-center mx-auto mb-4">
                              <ImageIcon className="w-8 h-8 text-slate-400" />
                            </div>
                            <p className="text-sm text-slate-400">Nhấn nút "Xử lý AI" để bắt đầu</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-8 flex flex-col sm:flex-row gap-4">
                    {!state.processedImage && !state.isProcessing && (
                      <button 
                        onClick={processImage}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl font-bold shadow-lg shadow-blue-200 transition-all flex items-center justify-center gap-3 active:scale-95"
                      >
                        <RefreshCw className="w-5 h-5" />
                        Xử lý ảnh bằng AI
                      </button>
                    )}
                    {state.processedImage && (
                      <>
                        <button 
                          onClick={triggerDownloadModal}
                          className="flex-1 bg-slate-900 hover:bg-slate-800 text-white py-4 rounded-2xl font-bold shadow-lg shadow-slate-200 transition-all flex items-center justify-center gap-3 active:scale-95"
                        >
                          <Download className="w-5 h-5" />
                          Tải ảnh đơn
                        </button>
                        <button 
                          onClick={generatePrintSheet}
                          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl font-bold shadow-lg shadow-blue-200 transition-all flex items-center justify-center gap-3 active:scale-95"
                        >
                          <Printer className="w-5 h-5" />
                          Tải bản in (8 tấm)
                        </button>
                        <button 
                          onClick={handlePrint}
                          title="In trực tiếp (Yêu cầu mở trong tab mới)"
                          className="sm:w-16 bg-slate-100 hover:bg-slate-200 text-slate-600 py-4 rounded-2xl font-bold transition-all flex items-center justify-center active:scale-95"
                        >
                          <Maximize2 className="w-5 h-5" />
                        </button>
                      </>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>

      {/* Download Modal */}
      <AnimatePresence>
        {showDownloadModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDownloadModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white rounded-3xl p-8 shadow-2xl border border-slate-200 w-full max-w-md"
            >
              <h3 className="text-xl font-bold mb-2">Đặt tên cho ảnh</h3>
              <p className="text-slate-500 text-sm mb-6">Nhập tên file bạn muốn lưu để dễ dàng quản lý.</p>
              
              <div className="space-y-4">
                <div>
                  <label htmlFor="filename" className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">
                    Tên file
                  </label>
                  <input 
                    type="text" 
                    id="filename"
                    value={fileName}
                    onChange={(e) => setFileName(e.target.value)}
                    placeholder="Ví dụ: anh-ho-chieu-2026"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && executeDownload()}
                  />
                </div>
                
                <div className="flex gap-3 pt-4">
                  <button 
                    onClick={() => setShowDownloadModal(false)}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 py-3 rounded-xl font-bold transition-all"
                  >
                    Hủy
                  </button>
                  <button 
                    onClick={executeDownload}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold shadow-lg shadow-blue-200 transition-all active:scale-95"
                  >
                    Tải về ngay
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Print Area (Hidden in UI, visible only in print) */}
      <div id="print-area" className="hidden">
        {state.processedImage && (
          <div className="print-grid">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="print-photo">
                <img src={state.processedImage!} alt="Passport" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="mt-auto py-12 border-t border-slate-200 bg-white">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <p className="text-sm text-slate-400 mb-4">
            © 2026 Passport Photo Pro. Powered by Gemini AI.
          </p>
          <div className="flex justify-center gap-8 text-xs font-bold text-slate-300 uppercase tracking-widest">
            <span>Privacy</span>
            <span>Terms</span>
            <span>API</span>
          </div>
        </div>
      </footer>

      <style>{`
        @media print {
          /* Hide everything by default */
          body * {
            visibility: hidden;
          }
          /* Show only the print area */
          #print-area, #print-area * {
            visibility: visible;
          }
          #print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            display: block !important;
          }
          .print-grid {
            display: grid;
            grid-template-columns: repeat(2, 35mm);
            gap: 10mm;
            padding: 10mm;
          }
          .print-photo {
            width: 35mm;
            height: 45mm;
            border: 0.1mm solid #eee;
            overflow: hidden;
          }
          .print-photo img {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }
          @page {
            size: A4;
            margin: 0;
          }
        }
      `}</style>
    </div>
  );
}
