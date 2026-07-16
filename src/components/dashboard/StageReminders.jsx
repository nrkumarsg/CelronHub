import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getEnquiries, getJobs } from '../../lib/workflowService';
import { Bell, AlertCircle, ArrowRight, Clock, FileText, CheckCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

export default function StageReminders() {
    const { profile } = useAuth();
    const [stages, setStages] = useState({
        pendingItems: [],
        toBeQuoted: [],
        awaitingPo: [],
        waitingDelivery: [],
        waitingInvoice: [],
        pendingService: [],
        awaitingPayment: []
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (profile?.company_id) {
            fetchReminders();
        }
    }, [profile]);

    const fetchReminders = async () => {
        setLoading(true);
        try {
            // Fetch all workflow documents to categorize them
            const { data: docs, error } = await supabase
                .from('workflow_documents')
                .select('*')
                .eq('company_id', profile.company_id)
                .order('issue_date', { ascending: false });

            if (error) throw error;

            const newStages = {
                pendingItems: [],
                toBeQuoted: [],
                awaitingPo: [],
                waitingDelivery: [],
                waitingInvoice: [],
                pendingService: [],
                awaitingPayment: []
            };

            // Categorize V2 Documents
            docs.forEach(doc => {
                const type = doc.document_type;
                const status = doc.status;

                if (type === 'Enquiry') {
                    // Stage 1: Pending Items (No items yet - we'd need to fetch items to be 100% sure, but we can assume 'Draft' without items)
                    if (status === 'Draft') newStages.pendingItems.push(doc);
                    // Stage 2: To Be Quoted
                    else if (status === 'Confirmed' || status === 'Open') newStages.toBeQuoted.push(doc);
                } else if (type === 'Quotation') {
                    // Stage 3: Awaiting PO
                    if (status === 'Sent' || status === 'Waiting') newStages.awaitingPo.push(doc);
                } else if (type === 'Job') {
                    if (status === 'Confirmed' || status === 'Active') {
                        // Check for DOs and Invoices linked to this job would be ideal, 
                        // but for now we can use simple heuristics or the fact that they are "Active"
                        newStages.waitingDelivery.push(doc);
                    }
                } else if (type === 'Delivery Order') {
                    if (status === 'Draft' || status === 'Open') {
                        newStages.waitingInvoice.push(doc);
                    }
                } else if (type === 'Service Report' || type === 'Packing List') {
                    if (status === 'Draft' || status === 'Open') {
                        newStages.pendingService.push(doc);
                    }
                } else if (type === 'Tax Invoice') {
                    if (status === 'Sent' || status === 'Overdue') {
                        newStages.awaitingPayment.push(doc);
                    }
                }
            });

            // Compatibility with legacy Enquiries
            const enqRes = await getEnquiries(profile?.company_id);
            if (enqRes?.data) {
                enqRes.data.forEach(enq => {
                    if (enq.status !== 'Converted' && enq.status !== 'Closed') {
                        if (!enq.catalog_items || enq.catalog_items.length === 0) {
                            newStages.pendingItems.push({ ...enq, document_no: enq.enquiry_no, isLegacy: true });
                        } else {
                            newStages.toBeQuoted.push({ ...enq, document_no: enq.enquiry_no, isLegacy: true });
                        }
                    }
                });
            }

            setStages(newStages);
        } catch (error) {
            console.error('Error fetching reminders:', error);
        } finally {
            setLoading(false);
        }
    };

    const StageBox = ({ title, items, color, bgColor, icon: Icon, stageKey }) => {
        if (items.length === 0) return null;

        return (
            <div className="glass-panel" style={{ 
                padding: '16px', 
                minWidth: '200px', 
                flex: '1',
                borderTop: `4px solid ${color}`,
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                background: '#fff'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <div style={{ background: bgColor, padding: '6px', borderRadius: '8px' }}>
                        <Icon size={16} color={color} />
                    </div>
                    <h4 style={{ margin: 0, fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {title}
                    </h4>
                </div>
                
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {items.slice(0, 8).map((item, idx) => (
                        <Link 
                            key={item.id || idx}
                            to={(item.isLegacy || item.document_type === 'Enquiry') ? `/workflows/enquiry/${item.id}` : `/workflows/editor/${item.document_type}/${item.id}`}
                            className="mcd-item"
                            style={{
                                background: bgColor,
                                color: color,
                                padding: '8px 12px',
                                borderRadius: '8px',
                                fontSize: '1.1rem',
                                fontWeight: 900,
                                textDecoration: 'none',
                                border: `1px solid ${color}33`,
                                transition: 'all 0.2s',
                                fontFamily: "'Inter', sans-serif",
                                display: 'inline-block'
                            }}
                        >
                            {item.document_no?.split('-').pop()}
                        </Link>
                    ))}
                    {items.length > 8 && (
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'flex', alignItems: 'center', fontWeight: 600 }}>
                            +{items.length - 8} more
                        </div>
                    )}
                </div>
            </div>
        );
    };

    if (loading) return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px' }}>
            {[1, 2, 3, 4].map(i => <div key={i} className="glass-panel" style={{ height: '120px', animate: 'pulse' }}></div>)}
        </div>
    );

    const totalCount = Object.values(stages).reduce((acc, curr) => acc + curr.length, 0);

    if (totalCount === 0) return null;

    return (
        <div style={{ marginBottom: '32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <Bell size={20} color="#f59e0b" />
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#1e293b' }}>Stage-wise Action Reminders</h3>
                <span className="badge badge-warning">{totalCount} Pending</span>
            </div>

            <div style={{ 
                display: 'flex', 
                flexWrap: 'wrap', 
                gap: '16px',
                alignItems: 'stretch'
            }}>
                <StageBox 
                    title="1. Pending Items" 
                    items={stages.pendingItems} 
                    color="#f59e0b" 
                    bgColor="#fffbeb" 
                    icon={AlertCircle} 
                />
                <StageBox 
                    title="2. To Be Quoted" 
                    items={stages.toBeQuoted} 
                    color="#6366f1" 
                    bgColor="#eef2ff" 
                    icon={Clock} 
                />
                <StageBox 
                    title="3. Awaiting PO" 
                    items={stages.awaitingPo} 
                    color="#8b5cf6" 
                    bgColor="#f5f3ff" 
                    icon={FileText} 
                />
                <StageBox 
                    title="4. Waiting Delivery" 
                    items={stages.waitingDelivery} 
                    color="#10b981" 
                    bgColor="#ecfdf5" 
                    icon={CheckCircle} 
                />
                <StageBox 
                    title="5. Waiting Invoice" 
                    items={stages.waitingInvoice} 
                    color="#ef4444" 
                    bgColor="#fef2f2" 
                    icon={ArrowRight} 
                />
                <StageBox 
                    title="6. Pending Service" 
                    items={stages.pendingService} 
                    color="#ec4899" 
                    bgColor="#fdf2f8" 
                    icon={FileText} 
                />
                <StageBox 
                    title="7. Awaiting Payment" 
                    items={stages.awaitingPayment} 
                    color="#14b8a6" 
                    bgColor="#f0fdfa" 
                    icon={CheckCircle} 
                />
            </div>

            <style>{`
                .mcd-item:hover {
                    transform: scale(1.1);
                    filter: brightness(0.9);
                    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                }
            `}</style>
        </div>
    );
}
