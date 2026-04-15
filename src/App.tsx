import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Copy, History, Download, Trash2, Languages } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { geminiService } from './services/geminiService';
import { TranslationHistory } from './types';

export default function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [sinhalaText, setSinhalaText] = useState('');
  const [englishText, setEnglishText] = useState('');
  const [history, setHistory] = useState<TranslationHistory[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [volume, setVolume] = useState(0);
  const [supportedMimeType, setSupportedMimeType] = useState('audio/webm');
  const [permissionStatus, setPermissionStatus] = useState<PermissionState | 'unknown'>('unknown');
  const [isInIframe, setIsInIframe] = useState(false);
  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([]);
  const [showPermissionGuide, setShowPermissionGuide] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [isManualInput, setIsManualInput] = useState(false);
  const [manualSinhala, setManualSinhala] = useState('');
  const [iframePermissionError, setIframePermissionError] = useState(false);

  // Check for available audio devices
  const checkDevices = async () => {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(device => device.kind === 'audioinput');
        setAvailableDevices(audioInputs);
        return audioInputs;
      }
    } catch (e) {
      console.error('Error enumerating devices:', e);
    }
    return [];
  };

  // Check if in iframe
  useEffect(() => {
    setIsInIframe(window.self !== window.top);
    checkDevices();
    
    // Test if microphone is allowed in this frame
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.enumerateDevices().then(devices => {
        const hasMic = devices.some(d => d.kind === 'audioinput' && d.label !== '');
        if (!hasMic && devices.some(d => d.kind === 'audioinput')) {
          console.log('Microphone detected but labels are empty - likely permission needed or iframe block.');
        }
      });
    }
  }, []);

  // Watch permission status
  const checkPermission = async () => {
    if (navigator.permissions && (navigator.permissions as any).query) {
      try {
        const status = await (navigator.permissions as any).query({ name: 'microphone' });
        console.log('Current Permission Status:', status.state);
        setPermissionStatus(status.state);
        status.onchange = () => {
          console.log('Permission Status Changed:', status.state);
          setPermissionStatus(status.state);
        };
      } catch (e) {
        console.warn('Permissions API not supported for microphone');
      }
    }
  };

  useEffect(() => {
    checkPermission();
  }, []);

  // Watch for device changes
  useEffect(() => {
    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', checkDevices);
      return () => navigator.mediaDevices.removeEventListener('devicechange', checkDevices);
    }
  }, []);

  // Find supported mime type
  useEffect(() => {
    const types = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/wav'];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        setSupportedMimeType(type);
        break;
      }
    }
  }, []);

  // Load history from localStorage
  useEffect(() => {
    const savedHistory = localStorage.getItem('translation_history');
    if (savedHistory) {
      setHistory(JSON.parse(savedHistory));
    }
  }, []);

  // Save history to localStorage
  useEffect(() => {
    localStorage.setItem('translation_history', JSON.stringify(history));
  }, [history]);

  const startRecording = async () => {
    setMicError(null);
    setVolume(0);
    
    console.log('Attempting to start recording...');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const msg = 'Your browser does not support audio recording or is not in a secure context (HTTPS).';
      console.error(msg);
      setMicError(msg);
      return;
    }

    try {
      console.log('Requesting microphone access...');
      
      // Try simple constraints first if complex ones fail
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          } 
        });
      } catch (e) {
        console.warn('Complex constraints failed, trying simple audio:true');
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      console.log('Microphone access granted successfully.');
      setShowPermissionGuide(false);
      setMicError(null);
      setIframePermissionError(false);
      
      // Set up audio visualization
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateVolume = () => {
        if (analyserRef.current) {
          analyserRef.current.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
          setVolume(average);
          animationFrameRef.current = requestAnimationFrame(updateVolume);
        }
      };
      updateVolume();

      const mediaRecorder = new MediaRecorder(stream, { mimeType: supportedMimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: supportedMimeType });
        await processAudio(audioBlob);
        stream.getTracks().forEach(track => track.stop());
        
        if (audioContextRef.current) {
          audioContextRef.current.close();
        }
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
        setVolume(0);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error: any) {
      console.error('Detailed Microphone Error:', error);
      console.log('Error Name:', error.name);
      console.log('Error Message:', error.message);
      
      let errorMessage = 'Could not access microphone.';
      
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError' || error.message?.toLowerCase().includes('denied')) {
        if (permissionStatus === 'granted') {
          errorMessage = 'CRITICAL: Your browser says permission is GRANTED, but the app is still being blocked.\n\nThis is a known issue with AI Studio\'s preview window (iframe). The browser allows the site, but blocks the embedded frame.\n\nSOLUTION: You MUST click "Open in New Tab" below to use the microphone.';
          setIframePermissionError(true);
        } else {
          errorMessage = 'Microphone access is blocked or not allowed in this context.\n\nIF YOU ALREADY ALLOWED IT:\nYour browser might be blocking microphone access because this app is running inside an iframe (AI Studio preview). This is a common security restriction.\n\nTO FIX THIS IMMEDIATELY:\n1. Click the "Open in New Tab" button below.\n2. In the new tab, click the microphone and select "Allow" when prompted.\n\nOTHERWISE:\n1. Click the Lock 🔒 icon in your address bar.\n2. Ensure "Microphone" is set to "Allow".\n3. Refresh this page.';
        }
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        errorMessage = 'No microphone found. Please plug in a microphone and try again.';
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        errorMessage = 'Your microphone is already in use by another application.';
      } else if (error.name === 'SecurityError') {
        errorMessage = 'Security Error: Microphone access is blocked by your browser or an iframe restriction. Please use the "Open in New Tab" button below.';
      } else {
        errorMessage += ' ' + (error.message || 'Unknown error');
      }
      
      setMicError(errorMessage);
      setShowPermissionGuide(true);
    }
  };

  const resetAndRetry = () => {
    setMicError(null);
    setShowPermissionGuide(false);
    setTimeout(startRecording, 100);
  };

  const copyUrlToClipboard = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    });
  };

  const handleManualSubmit = async () => {
    if (!manualSinhala.trim()) return;
    setIsProcessing(true);
    setSinhalaText(manualSinhala);
    try {
      const result = await geminiService.translateAndEngineer(manualSinhala);
      setEnglishText(result);
      setHistory(prev => [{
        id: Date.now().toString(),
        sinhala: manualSinhala,
        english: result,
        timestamp: Date.now()
      }, ...prev]);
      setManualSinhala('');
      setIsManualInput(false);
    } catch (error) {
      console.error('Manual processing error:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const processAudio = async (blob: Blob) => {
    setIsProcessing(true);
    setSinhalaText('');
    setEnglishText('');
    try {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        try {
          const base64Audio = (reader.result as string).split(',')[1];
          const result = await geminiService.translateSpeech(base64Audio, supportedMimeType);
          
          setSinhalaText(result.sinhala);
          setEnglishText(result.english);

          const newEntry: TranslationHistory = {
            id: Date.now().toString(),
            sinhala: result.sinhala,
            english: result.english,
            timestamp: Date.now(),
          };
          setHistory(prev => [newEntry, ...prev]);
        } catch (error: any) {
          console.error('Gemini error:', error);
          setSinhalaText('Error: ' + (error.message || 'Failed to process audio'));
          setEnglishText('Error: ' + (error.message || 'Failed to translate audio'));
        } finally {
          setIsProcessing(false);
        }
      };
    } catch (error: any) {
      console.error('Processing error:', error);
      setIsProcessing(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const clearHistory = () => {
    setHistory([]);
  };

  const exportHistory = () => {
    const content = history.map(h => `Sinhala: ${h.sinhala}\nEnglish: ${h.english}\n---`).join('\n\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'translation_history.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#F5F5F0] text-[#141414] font-sans selection:bg-emerald-200">
      {/* Header */}
      <header className="p-6 border-b border-[#141414]/10 flex justify-between items-center bg-white/50 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-200">
            <Languages size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">AI Systems Architect & Prompt Engineer</h1>
            <p className="text-xs text-[#141414]/50 font-medium uppercase tracking-widest">Transforming Sinhala to Structured AI Logic</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowHistory(!showHistory)}
            className="p-2 hover:bg-black/5 rounded-full transition-colors relative"
            title="History"
          >
            <History size={20} />
            {history.length > 0 && (
              <span className="absolute top-0 right-0 w-2 h-2 bg-emerald-500 rounded-full border-2 border-white"></span>
            )}
          </button>
          <button 
            onClick={exportHistory}
            className="p-2 hover:bg-black/5 rounded-full transition-colors"
            title="Export"
            disabled={history.length === 0}
          >
            <Download size={20} />
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6 space-y-8">
        {/* Main Interaction Area */}
        <section className="flex flex-col items-center justify-center py-12 space-y-8">
          {!isManualInput ? (
            <div className="relative">
              <AnimatePresence>
                {isRecording && (
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.1, 0.3] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="absolute inset-0 bg-emerald-500 rounded-full"
                  />
                )}
              </AnimatePresence>
              
              <button
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isProcessing}
                className={`relative z-10 w-24 h-24 rounded-full flex items-center justify-center transition-all shadow-2xl ${
                  isRecording 
                    ? 'bg-red-500 hover:bg-red-600 shadow-red-200' 
                    : micError 
                      ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-200'
                      : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200'
                } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {isRecording ? (
                  <div className="relative flex items-center justify-center">
                    <MicOff size={32} className="text-white relative z-10" />
                    <motion.div 
                      animate={{ scale: 1 + (volume / 100) }}
                      className="absolute inset-0 bg-white/20 rounded-full scale-150"
                    />
                  </div>
                ) : (
                  <Mic size={32} className="text-white" />
                )}
              </button>
            </div>
          ) : (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full max-w-lg bg-white rounded-3xl p-6 shadow-xl border border-black/5 space-y-4"
            >
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold uppercase tracking-widest text-emerald-600">Manual Sinhala Input</span>
                <button 
                  onClick={() => setIsManualInput(false)}
                  className="text-[10px] font-bold uppercase tracking-widest text-gray-400 hover:text-red-500 transition-colors"
                >
                  Switch to Voice
                </button>
              </div>
              <textarea 
                value={manualSinhala}
                onChange={(e) => setManualSinhala(e.target.value)}
                placeholder="මෙතන සිංහලෙන් ලියන්න... (Type your requirement here in Sinhala)"
                className="w-full h-32 p-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-emerald-500/20 resize-none text-lg"
              />
              <button 
                onClick={handleManualSubmit}
                disabled={isProcessing || !manualSinhala.trim()}
                className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 disabled:opacity-50"
              >
                {isProcessing ? 'Processing...' : 'Engineer Prompt'}
              </button>
            </motion.div>
          )}
          
          <div className="text-center space-y-2 max-w-md">
            {micError ? (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-amber-800 text-sm animate-in fade-in slide-in-from-top-2 text-left">
                <p className="font-bold mb-2 flex items-center gap-2">
                  <MicOff size={16} />
                  Microphone Access Required
                </p>
                
                <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800">
                  <p className="font-bold text-xs mb-1">Stuck with the error?</p>
                  <p className="text-[10px] mb-2">You can type your requirement manually if the microphone isn't working.</p>
                  <button 
                    onClick={() => {
                      setIsManualInput(true);
                      setMicError(null);
                    }}
                    className="w-full py-2 bg-emerald-600 text-white rounded-lg font-bold uppercase tracking-widest text-[10px] hover:bg-emerald-700 transition-colors"
                  >
                    Switch to Typing Mode
                  </button>
                </div>

                {permissionStatus === 'denied' && (
                  <div className="mb-3 p-2 bg-red-100 border border-red-200 rounded-lg text-red-800 text-[10px] font-bold uppercase tracking-wider flex items-center gap-2">
                    <div className="w-2 h-2 bg-red-500 rounded-full" />
                    Status: Blocked in Browser Settings
                  </div>
                )}

                {isInIframe && (
                  <div className="mb-3 p-2 bg-blue-100 border border-blue-200 rounded-lg text-blue-800 text-[10px] font-bold uppercase tracking-wider flex items-center gap-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full" />
                    Detected: Running inside an Iframe (AI Studio)
                  </div>
                )}

                {iframePermissionError && (
                  <div className="mb-3 p-3 bg-red-600 text-white rounded-xl shadow-lg animate-bounce">
                    <p className="text-[11px] font-bold uppercase tracking-widest mb-1 flex items-center gap-2">
                      <MicOff size={14} />
                      Iframe Block Detected!
                    </p>
                    <p className="text-[10px] leading-tight opacity-90">
                      Your browser is blocking the microphone because this app is embedded. 
                      <strong> You MUST open it in a new tab to fix this.</strong>
                    </p>
                  </div>
                )}

                {availableDevices.length === 0 && (
                  <div className="mb-3 p-2 bg-amber-100 border border-amber-200 rounded-lg text-amber-800 text-[10px] font-bold uppercase tracking-wider flex items-center gap-2">
                    <div className="w-2 h-2 bg-amber-500 rounded-full" />
                    Warning: No Microphone Hardware Detected
                  </div>
                )}

                <div className="space-y-2 text-xs leading-relaxed">
                  {micError.split('\n').map((line, i) => (
                    <p key={i} className={line.startsWith('CRITICAL') ? 'font-bold text-red-600' : ''}>{line}</p>
                  ))}
                </div>

                <div className="mt-4 p-2 bg-black/5 rounded-lg border border-black/10 text-[9px] font-mono text-gray-600">
                  <div className="flex justify-between items-center mb-1">
                    <p className="font-bold uppercase tracking-widest opacity-50">System Diagnostics</p>
                    <button 
                      onClick={() => {
                        checkDevices();
                        checkPermission();
                      }}
                      className="text-[8px] underline hover:text-black"
                    >
                      Refresh
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    <p>Secure Context: <span className={window.isSecureContext ? 'text-emerald-600' : 'text-red-600'}>{window.isSecureContext ? 'Yes' : 'No'}</span></p>
                    <p>Iframe: <span>{isInIframe ? 'Yes' : 'No'}</span></p>
                    <p>Permission: <span className="capitalize">{permissionStatus}</span></p>
                    <p>Devices: <span>{availableDevices.length} found</span></p>
                  </div>
                </div>

                {showPermissionGuide && (
                  <div className="mt-4 p-3 bg-white border border-amber-200 rounded-xl shadow-inner">
                    <p className="text-[10px] font-bold text-amber-800 uppercase tracking-widest mb-2">Visual Guide</p>
                    <div className="bg-gray-100 rounded-lg p-2 border border-gray-200 flex items-center gap-2 mb-2">
                      <div className="w-3 h-3 bg-gray-300 rounded-full" />
                      <div className="flex-1 h-4 bg-white rounded border border-gray-200 flex items-center px-2 gap-2">
                        <div className="w-2 h-2 bg-red-500 rounded-full" />
                        <div className="w-16 h-1.5 bg-gray-100 rounded" />
                      </div>
                      <div className="flex gap-1">
                        <div className="w-3 h-3 bg-gray-300 rounded-sm" />
                        <div className="w-3 h-3 bg-gray-300 rounded-sm" />
                      </div>
                    </div>
                    <p className="text-[9px] text-gray-500 italic">Click the icon with the red dot/slash in your address bar to reset permissions.</p>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-3">
                  <button 
                    onClick={() => window.open(window.location.href, '_blank')}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold uppercase tracking-widest text-[11px] hover:bg-blue-700 transition-all shadow-md flex-1 min-w-[200px] text-center"
                  >
                    Open in New Tab (Fixes Most Permission Issues)
                  </button>
                  <button 
                    onClick={resetAndRetry}
                    className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg font-bold uppercase tracking-widest text-[10px] hover:bg-emerald-700 transition-colors shadow-sm"
                  >
                    Force Permission Request
                  </button>
                  <button 
                    onClick={copyUrlToClipboard}
                    className={`px-3 py-1.5 rounded-lg font-bold uppercase tracking-widest text-[10px] transition-all shadow-sm ${
                      copySuccess ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {copySuccess ? 'URL Copied!' : 'Copy App URL'}
                  </button>
                  <button 
                    onClick={() => window.location.reload()}
                    className="px-3 py-1.5 bg-amber-600 text-white rounded-lg font-bold uppercase tracking-widest text-[10px] hover:bg-amber-700 transition-colors shadow-sm"
                  >
                    Refresh Page
                  </button>
                  <button 
                    onClick={() => {
                      setMicError(null);
                      setShowPermissionGuide(false);
                    }}
                    className="px-3 py-1.5 border border-amber-300 rounded-lg font-bold uppercase tracking-widest text-[10px] hover:bg-amber-100 transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-lg font-medium">
                  {isRecording ? 'Listening to your request...' : isProcessing ? 'Engineering Prompt...' : 'Tap to speak your requirement'}
                </p>
                <p className="text-sm text-[#141414]/40">
                  {isRecording ? 'Describe what you want the AI to do in Sinhala' : 'Your engineered prompt will appear below'}
                </p>
              </>
            )}
          </div>
        </section>

        {/* Results Area */}
        <div className="flex justify-end">
          <button 
            onClick={() => {
              setSinhalaText('');
              setEnglishText('');
            }}
            className="text-xs font-bold uppercase tracking-widest text-black/40 hover:text-red-500 transition-colors flex items-center gap-1"
            disabled={!sinhalaText && !englishText}
          >
            <Trash2 size={14} />
            Clear Current
          </button>
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          {/* Sinhala Output */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-3xl p-6 shadow-sm border border-black/5 space-y-4 min-h-[200px] flex flex-col"
          >
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold uppercase tracking-widest text-emerald-600">Sinhala (Transcription)</span>
              <button 
                onClick={() => copyToClipboard(sinhalaText)}
                className="p-2 hover:bg-black/5 rounded-lg transition-colors text-[#141414]/40 hover:text-[#141414]"
                disabled={!sinhalaText}
              >
                <Copy size={16} />
              </button>
            </div>
            <div className="flex-1">
              {isProcessing && !sinhalaText ? (
                <div className="space-y-2 animate-pulse">
                  <div className="h-4 bg-black/5 rounded w-3/4"></div>
                  <div className="h-4 bg-black/5 rounded w-1/2"></div>
                </div>
              ) : (
                <p className="text-xl leading-relaxed font-medium">
                  {sinhalaText || <span className="text-black/10 italic">Spoken Sinhala will appear here...</span>}
                </p>
              )}
            </div>
          </motion.div>

          {/* English Output */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-3xl p-6 shadow-sm border border-black/5 space-y-4 min-h-[200px] flex flex-col"
          >
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold uppercase tracking-widest text-blue-600">AI Prompt (English)</span>
              <button 
                onClick={() => copyToClipboard(englishText)}
                className="p-2 hover:bg-black/5 rounded-lg transition-colors text-[#141414]/40 hover:text-[#141414]"
                disabled={!englishText}
              >
                <Copy size={16} />
              </button>
            </div>
            <div className="flex-1">
              {isProcessing && !englishText ? (
                <div className="space-y-2 animate-pulse">
                  <div className="h-4 bg-black/5 rounded w-3/4"></div>
                  <div className="h-4 bg-black/5 rounded w-1/2"></div>
                </div>
              ) : (
                <p className="text-xl leading-relaxed font-medium">
                  {englishText || <span className="text-black/10 italic">The engineered AI prompt will appear here...</span>}
                </p>
              )}
            </div>
          </motion.div>
        </div>

        {/* History Sidebar/Overlay */}
        <AnimatePresence>
          {showHistory && (
            <motion.div
              initial={{ opacity: 0, x: 300 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 300 }}
              className="fixed inset-y-0 right-0 w-full md:w-96 bg-white shadow-2xl z-50 flex flex-col border-l border-black/5"
            >
              <div className="p-6 border-b border-black/5 flex justify-between items-center">
                <h2 className="text-lg font-bold">History</h2>
                <div className="flex gap-2">
                  <button 
                    onClick={clearHistory}
                    className="p-2 hover:bg-red-50 text-red-500 rounded-lg transition-colors"
                    title="Clear All"
                  >
                    <Trash2 size={20} />
                  </button>
                  <button 
                    onClick={() => setShowHistory(false)}
                    className="p-2 hover:bg-black/5 rounded-lg transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {history.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-black/30 space-y-2">
                    <History size={48} strokeWidth={1} />
                    <p>No translations yet</p>
                  </div>
                ) : (
                  history.map((item) => (
                    <div key={item.id} className="p-4 rounded-2xl bg-[#F5F5F0] border border-black/5 space-y-2 group">
                      <div className="flex justify-between items-start">
                        <p className="text-xs text-black/40">{new Date(item.timestamp).toLocaleTimeString()}</p>
                        <button 
                          onClick={() => {
                            setSinhalaText(item.sinhala);
                            setEnglishText(item.english);
                            setShowHistory(false);
                          }}
                          className="text-xs font-bold text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          Restore
                        </button>
                      </div>
                      <p className="text-sm font-medium">{item.sinhala}</p>
                      <div className="h-px bg-black/5 w-full"></div>
                      <p className="text-sm text-black/60 italic">{item.english}</p>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer / Status */}
      <footer className="fixed bottom-0 left-0 right-0 p-4 text-center pointer-events-none">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-md rounded-full border border-black/5 shadow-sm pointer-events-auto">
          <div className={`w-2 h-2 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`}></div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-black/60">
            {isRecording ? 'System Active' : 'System Ready'}
          </span>
        </div>
      </footer>
    </div>
  );
}
