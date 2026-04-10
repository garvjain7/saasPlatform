import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { UploadCloud, File, AlertCircle, CheckCircle2, Loader, ArrowRight } from 'lucide-react';
import { uploadDataset, getDatasetStatus } from '../services/api';

const STEPS = [
  { id: 1, label: 'Uploading' },
  { id: 2, label: 'Validating' },
  { id: 3, label: 'Cleaning' },
  { id: 4, label: 'Analyzing' },
  { id: 5, label: 'Dashboard' },
];

const UploadPage = () => {
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [isDragActive, setIsDragActive] = useState(false);
  const [datasetId, setDatasetId] = useState(null);
  const [status, setStatus] = useState(null); // 'uploading' | 'processing' | 'completed' | 'failed'
  const [currentStep, setCurrentStep] = useState(0);
  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  // Poll status while processing
  useEffect(() => {
    if (!datasetId || status !== 'processing') return;

    const poll = setInterval(async () => {
      try {
        const res = await getDatasetStatus(datasetId);
        if (res.status === 'completed') {
          setStatus('completed');
          setCurrentStep(5);
          clearInterval(poll);
        } else if (res.status === 'failed') {
          setStatus('failed');
          setError(res.error || 'Pipeline failed. Check your dataset format.');
          clearInterval(poll);
        } else {
          // Processing — advance step indicator
          setCurrentStep(prev => Math.min(prev + 1, 4));
        }
      } catch (err) {
        console.warn('Status poll error:', err.message);
      }
    }, 2000);

    return () => clearInterval(poll);
  }, [datasetId, status]);

  const handleDragOver = (e) => { e.preventDefault(); setIsDragActive(true); };
  const handleDragLeave = (e) => { e.preventDefault(); setIsDragActive(false); };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragActive(false);
    setError('');
    validateAndSetFile(e.dataTransfer.files[0]);
  };

  const handleFileChange = (e) => {
    setError('');
    validateAndSetFile(e.target.files[0]);
  };

  const validateAndSetFile = (selectedFile) => {
    if (!selectedFile) return;
    const validTypes = ['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
    if (!validTypes.includes(selectedFile.type) && !selectedFile.name.endsWith('.csv') && !selectedFile.name.endsWith('.xlsx')) {
      setError('Invalid file type. Please upload a CSV or XLSX file.');
      return;
    }
    if (selectedFile.size > 100 * 1024 * 1024) {
      setError('File is too large. Maximum size is 100MB.');
      return;
    }
    setFile(selectedFile);
  };

  const handleUpload = async () => {
    if (!file) return;
    setIsUploading(true);
    setError('');
    setCurrentStep(1);
    setStatus('uploading');

    try {
      const response = await uploadDataset(file);
      if (response && response.datasetId) {
        setDatasetId(response.datasetId);
        setStatus('processing');
        setCurrentStep(2);
      } else {
        setError('Upload succeeded but dataset ID is missing in response.');
        setIsUploading(false);
        setStatus(null);
      }
    } catch (err) {
      console.error('Upload error:', err);
      setError(err.response?.data?.message || err.message || 'An error occurred during upload.');
      setIsUploading(false);
      setStatus(null);
    }
  };

  const resetUpload = () => {
    setFile(null);
    setIsUploading(false);
    setError('');
    setDatasetId(null);
    setStatus(null);
    setCurrentStep(0);
  };

  // Processing screen
  if (status === 'processing' || status === 'completed' || status === 'failed') {
    return (
      <div className="view-enter flex-center" style={{ minHeight: '70vh', flexDirection: 'column' }}>
        <div className="glass-panel" style={{ width: '100%', maxWidth: 600, padding: '2.5rem 2rem', textAlign: 'center' }}>
          {/* Step Timeline */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 32 }}>
            {STEPS.map((step, i) => (
              <div key={step.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flex: 1 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 600,
                  border: `2px solid ${
                    status === 'failed' ? 'var(--danger)' :
                    currentStep > i ? 'var(--success)' :
                    currentStep === i ? 'var(--primary)' : 'var(--border-color)'
                  }`,
                  background: status === 'failed' ? 'rgba(248,81,73,0.1)' :
                    currentStep > i ? 'var(--success)' :
                    currentStep === i ? 'var(--primary)' : 'transparent',
                  color: (currentStep > i || currentStep === i) && status !== 'failed' ? '#fff' :
                    status === 'failed' ? 'var(--danger)' : 'var(--text-muted)',
                  transition: 'all 0.3s',
                }}>
                  {status === 'failed' && currentStep <= i ? '✕' :
                   currentStep > i ? <CheckCircle2 size={16} /> :
                   currentStep === i ? <Loader size={16} className="spin" /> : step.id}
                </div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, textTransform: 'uppercase', letterSpacing: 1,
                  color: currentStep >= i ? 'var(--primary)' : 'var(--text-muted)',
                }}>{step.label}</div>
              </div>
            ))}
          </div>

          {/* Status Message */}
          {status === 'completed' ? (
            <>
              <CheckCircle2 size={48} color="var(--success)" style={{ marginBottom: 16 }} />
              <h2 style={{ color: 'var(--success)', marginBottom: 8 }}>Pipeline Complete</h2>
              <p style={{ color: 'var(--text-muted)', marginBottom: 24, fontFamily: "'DM Mono', monospace", fontSize: 12 }}>
                Dataset: {file?.name} · ID: {datasetId}
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button className="btn-primary" onClick={() => navigate(`/employee/analysis?ds=${datasetId}&name=${encodeURIComponent(file?.name || '')}`)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.75rem 1.5rem' }}>
                  Analyze & Clean Dataset <ArrowRight size={16} />
                </button>
                <button onClick={() => navigate('/employee/datasets')} style={{
                  background: 'none', border: '1px solid var(--border-color)', color: 'var(--text-muted)',
                  padding: '0.75rem 1.5rem', borderRadius: 8, cursor: 'pointer',
                  fontFamily: 'var(--font-family)',
                }}>Upload Another</button>
              </div>
            </>
          ) : status === 'failed' ? (
            <>
              <AlertCircle size={48} color="var(--danger)" style={{ marginBottom: 16 }} />
              <h2 style={{ color: 'var(--danger)', marginBottom: 8 }}>Pipeline Failed</h2>
              <p style={{ color: 'var(--text-muted)', marginBottom: 8, fontSize: 14 }}>{error}</p>
              <p style={{ color: 'var(--text-muted)', marginBottom: 24, fontFamily: "'DM Mono', monospace", fontSize: 11 }}>
                Check that your CSV has headers and at least 10 rows with 1 numeric column.
              </p>
              <button onClick={resetUpload} style={{
                background: 'var(--primary)', border: 'none', color: '#fff',
                padding: '0.75rem 1.5rem', borderRadius: 8, cursor: 'pointer',
                fontFamily: 'var(--font-family)',
              }}>Try Again</button>
            </>
          ) : (
            <>
              <div style={{ marginBottom: 16 }}>
                <Loader size={48} color="var(--primary)" className="spin" />
              </div>
              <h2 style={{ color: '#fff', marginBottom: 8 }}>Processing Your Dataset</h2>
              <p style={{ color: 'var(--text-muted)', marginBottom: 16, fontFamily: "'DM Mono', monospace", fontSize: 12 }}>
                {file?.name} · ID: {datasetId}
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                Running: <strong style={{ color: 'var(--primary)' }}>{STEPS[currentStep - 1]?.label || 'Initializing'}</strong>
              </p>
              <div style={{ marginTop: 16, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${(currentStep / 5) * 100}%`,
                  background: 'linear-gradient(90deg, var(--secondary), var(--primary))',
                  borderRadius: 4, transition: 'width 1s ease',
                }} />
              </div>
              <p style={{ color: 'var(--text-muted)', marginTop: 8, fontFamily: "'DM Mono', monospace", fontSize: 10 }}>
                This usually takes 10–30 seconds...
              </p>
            </>
          )}
        </div>

        <style>{`
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
          .spin { animation: spin 1s linear infinite; }
        `}</style>
      </div>
    );
  }

  // Upload form
  return (
    <div className="view-enter flex-center" style={{ minHeight: '60vh', flexDirection: 'column' }}>
      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <h1 className="gradient-text" style={{ fontSize: '3rem', marginBottom: '1rem' }}>Data Intelligence, Automated</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '1.25rem', maxWidth: '600px', margin: '0 auto' }}>
          Instantly transform raw CSV and Excel datasets into actionable insights, interactive dashboards, and accurate forecasts.
        </p>
      </div>
      
      <div className="glass-panel" style={{ width: '100%', maxWidth: '700px', padding: '3rem 2rem' }}>
        <div 
          onClick={() => fileInputRef.current.click()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          style={{
            border: `2px dashed ${isDragActive ? 'var(--primary)' : 'var(--border-color)'}`,
            borderRadius: '12px', padding: '4rem 2rem', textAlign: 'center', cursor: 'pointer',
            backgroundColor: isDragActive ? 'rgba(88, 166, 255, 0.05)' : 'transparent',
            transition: 'all 0.3s ease', marginBottom: '2rem',
          }}
        >
          <input type="file" ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }}
            accept=".csv, .xlsx, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" />
          
          {file ? (
            <div className="flex-center" style={{ flexDirection: 'column', gap: '1rem' }}>
              <File size={64} color="var(--primary)" />
              <div>
                <h3 style={{ margin: '0.5rem 0' }}>{file.name}</h3>
                <p style={{ color: 'var(--text-muted)' }}>{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
              <button onClick={(e) => { e.stopPropagation(); setFile(null); }}
                style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', textDecoration: 'underline', marginTop: '0.5rem' }}>
                Remove
              </button>
            </div>
          ) : (
            <div className="flex-center" style={{ flexDirection: 'column', gap: '1.5rem' }}>
              <UploadCloud size={64} color={isDragActive ? 'var(--primary)' : 'var(--text-muted)'} />
              <div>
                <h3 style={{ margin: '0.5rem 0', fontSize: '1.5rem' }}>Click or Drag dataset here</h3>
                <p style={{ color: 'var(--text-muted)' }}>Supports CSV and XLSX files up to 100MB</p>
              </div>
            </div>
          )}
        </div>
        
        {error && (
          <div style={{
            backgroundColor: 'rgba(248, 81, 73, 0.1)', border: '1px solid var(--danger)',
            padding: '1rem', borderRadius: '8px', color: 'var(--danger)',
            display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2rem',
          }}>
            <AlertCircle size={20} />
            <span>{error}</span>
          </div>
        )}
        
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button className="btn-primary" onClick={(e) => { e.stopPropagation(); handleUpload(); }}
            disabled={!file || isUploading} style={{ width: '100%', maxWidth: '300px', padding: '1rem' }}>
            Generate Insights Pipeline
          </button>
        </div>
      </div>
    </div>
  );
};

export default UploadPage;
