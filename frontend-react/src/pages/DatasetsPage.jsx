import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Database, Calendar, FileText, ChevronRight, Loader, BarChart3, Trash2, AlertTriangle, Sparkles } from 'lucide-react';
import { getDatasets, deleteDataset } from '../services/api';

const DatasetsPage = () => {
    const [datasets, setDatasets] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [deleteId, setDeleteId] = useState(null);
    const [showConfirm, setShowConfirm] = useState(null);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchDatasets = async () => {
            try {
                const res = await getDatasets();
                if (res.success) {
                    setDatasets(res.data || []);
                }
            } catch (err) {
                console.error("Failed to fetch datasets:", err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchDatasets();
    }, []);

    const handleDelete = async (datasetId, e) => {
        e.stopPropagation();
        setDeleteId(datasetId);
        setShowConfirm(datasetId);
    };

    const confirmDelete = async () => {
        if (!deleteId) return;
        
        try {
            const res = await deleteDataset(deleteId);
            if (res.success) {
                setDatasets(datasets.filter(d => d.dataset_id !== deleteId));
            } else {
                alert(res.message || 'Failed to delete dataset');
            }
        } catch (err) {
            console.error("Delete error:", err);
            alert('Failed to delete dataset');
        } finally {
            setDeleteId(null);
            setShowConfirm(null);
        }
    };

    const cancelDelete = () => {
        setDeleteId(null);
        setShowConfirm(null);
    };

    if (isLoading) {
        return (
            <div className="flex-center" style={{ minHeight: '60vh', flexDirection: 'column' }}>
                <Loader className="spinner" size={40} color="var(--primary)" />
                <p style={{ marginTop: '1rem', color: 'var(--text-muted)' }}>Retrieving your workspace...</p>
            </div>
        );
    }

    return (
        <div className="view-enter">
            <header style={{ marginBottom: '2.5rem' }}>
                <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>My Datasets</h1>
                <p style={{ color: 'var(--text-muted)' }}>Manage and analyze your historical data assets</p>
            </header>

            {showConfirm && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 1000
                }}>
                    <div className="glass-panel" style={{ padding: '2rem', maxWidth: 400 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                            <AlertTriangle size={24} color="var(--danger)" />
                            <h3 style={{ margin: 0 }}>Delete Dataset?</h3>
                        </div>
                        <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                            This will permanently delete the dataset and all its files. This action cannot be undone.
                        </p>
                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                            <button onClick={cancelDelete} className="btn-ghost" style={{ padding: '0.5rem 1rem' }}>
                                Cancel
                            </button>
                            <button onClick={confirmDelete} style={{
                                background: 'var(--danger)', border: 'none', color: '#fff',
                                padding: '0.5rem 1rem', borderRadius: 6, cursor: 'pointer'
                            }}>
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {datasets.length === 0 ? (
                <div className="glass-panel" style={{ padding: '4rem', textAlign: 'center' }}>
                    <Database size={48} color="var(--text-muted)" style={{ marginBottom: '1.5rem' }} />
                    <h3>No datasets found</h3>
                    <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>Upload your first dataset to start generating insights.</p>
                    <button className="btn-primary" onClick={() => navigate('/upload')}>Upload Dataset</button>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {datasets.map((dataset) => (
                        <div 
                            key={dataset.dataset_id} 
                            className="glass-panel hover-scale" 
                            style={{ 
                                padding: '1.5rem', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'space-between',
                                cursor: 'pointer',
                                transition: 'all 0.3s ease'
                            }}
                            onClick={() => navigate(`/dashboard/${dataset.dataset_id}`)}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                                <div style={{ 
                                    background: dataset.status === 'completed' ? 'rgba(63, 185, 80, 0.15)' : 'rgba(210, 153, 34, 0.15)', 
                                    padding: '0.75rem', 
                                    borderRadius: '10px' 
                                }}>
                                    <FileText color={dataset.status === 'completed' ? 'var(--secondary)' : 'var(--warning)'} />
                                </div>
                                <div>
                                    <h4 style={{ margin: 0, fontSize: '1.1rem' }}>{dataset.name}</h4>
                                    <div style={{ display: 'flex', gap: '1rem', marginTop: '0.4rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                            <Calendar size={14} /> {new Date(dataset.created_at).toLocaleDateString()}
                                        </span>
                                        <span>{dataset.rows_count || 0} Rows • {dataset.columns_count || 0} Columns</span>
                                        <span style={{ 
                                            textTransform: 'capitalize', 
                                            color: dataset.status === 'completed' ? 'var(--secondary)' : 'var(--warning)',
                                            fontWeight: 600
                                        }}>
                                            {dataset.status}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                {dataset.status === 'completed' && (
                                    <button 
                                        className="btn-ghost"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            navigate(`/employee/visualization?ds=${dataset.dataset_id}&name=${encodeURIComponent(dataset.name)}`);
                                        }}
                                        style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                    >
                                        <BarChart3 size={16} /> Visualize
                                    </button>
                                )}
                                {(dataset.status === 'new' || dataset.status === 'processing') && (
                                    <button 
                                        className="btn-primary"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            navigate(`/employee/cleaning?ds=${dataset.dataset_id}&name=${encodeURIComponent(dataset.name)}`);
                                        }}
                                        style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                    >
                                        <Sparkles size={16} /> Clean
                                    </button>
                                )}
                                <button 
                                    className="btn-ghost"
                                    onClick={(e) => handleDelete(dataset.dataset_id, e)}
                                    style={{ padding: '0.5rem', color: 'var(--danger)', display: 'flex', alignItems: 'center' }}
                                    title="Delete dataset"
                                >
                                    <Trash2 size={18} />
                                </button>
                                <ChevronRight size={20} color="var(--text-muted)" />
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default DatasetsPage;
