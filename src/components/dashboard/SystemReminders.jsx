import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { Link } from 'react-router-dom';
import { 
    Calendar, 
    AlertTriangle, 
    Clock, 
    ArrowRight, 
    Receipt, 
    FileText, 
    Briefcase, 
    Truck, 
    Bell,
    CheckCircle
} from 'lucide-react';

export default function SystemReminders() {
    const { profile } = useAuth();
    const [reminders, setReminders] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (profile?.company_id) {
            fetchSystemReminders();
        }
    }, [profile]);

    const fetchSystemReminders = async () => {
        setLoading(true);
        try {
            // Fetch workflow documents with active states
            const { data: docs, error } = await supabase
                .from('workflow_documents')
                .select(`
                    id, 
                    document_no, 
                    document_type, 
                    status, 
                    issue_date, 
                    expiry_date, 
                    total_amount,
                    partner_id
                `)
                .eq('company_id', profile.company_id)
                .not('status', 'in', '("Paid","Cancelled","Reversed","Completed")');

            if (error) throw error;

            // Fetch partner names to display
            const partnerIds = [...new Set(docs.map(d => d.partner_id).filter(Boolean))];
            let partnerMap = {};
            if (partnerIds.length > 0) {
                const { data: partners } = await supabase
                    .from('partners')
                    .select('id, name')
                    .in('id', partnerIds);
                partnerMap = Object.fromEntries(partners?.map(p => [p.id, p.name]) || []);
            }

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const filteredReminders = docs.map(doc => {
                const isJobOrORA = doc.document_type === 'Job' || doc.document_type === 'Order Acknowledgment';
                
                // If it's a converted ORA, it is already a Job, so we track the Job instead
                if (doc.document_type === 'Order Acknowledgment' && doc.status === 'Confirmed') {
                    return null;
                }

                const targetDateStr = doc.expiry_date || doc.issue_date;
                if (!targetDateStr) return null;

                const targetDate = new Date(targetDateStr);
                targetDate.setHours(0, 0, 0, 0);

                const diffTime = targetDate - today;
                const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

                // Persistent reminders for ORA and Jobs until completed to avoid slip-offs
                if (isJobOrORA) {
                    if (doc.status !== 'Completed' && doc.status !== 'Cancelled') {
                        return {
                            ...doc,
                            partnerName: partnerMap[doc.partner_id] || 'Unknown Partner',
                            targetDateStr,
                            diffDays,
                            isPersistent: true
                        };
                    }
                } else {
                    // Standard ±3 days window for other document types
                    if (diffDays >= -3 && diffDays <= 3) {
                        return {
                            ...doc,
                            partnerName: partnerMap[doc.partner_id] || 'Unknown Partner',
                            targetDateStr,
                            diffDays
                        };
                    }
                }
                return null;
            }).filter(Boolean);

            // Sort by absolute urgency
            filteredReminders.sort((a, b) => a.diffDays - b.diffDays);

            // Check if there is an active SOA cycle due
            const now = new Date();
            const day = now.getDate();
            const year = now.getFullYear();
            const month = now.getMonth();
            let dueCycle = null;
            let cycleLabel = '';
            
            if (day >= 5 && day < 15) {
                dueCycle = 5;
                cycleLabel = '5th Billing Cycle';
            } else if (day >= 15 && day < 25) {
                dueCycle = 15;
                cycleLabel = '15th Billing Cycle';
            } else if (day >= 25 && day < 30) {
                dueCycle = 25;
                cycleLabel = '25th Billing Cycle';
            } else if (day >= 30 || day < 5) {
                dueCycle = 30;
                cycleLabel = 'End of Month Billing Cycle';
            }

            let showSoaReminder = false;
            if (dueCycle !== null && profile?.company_id) {
                // Fetch if any dispatch log exists for this cycle in the current month
                try {
                    const { data: logs, error: logsError } = await supabase
                        .from('soa_dispatch_logs')
                        .select('id, sent_at')
                        .eq('company_id', profile.company_id)
                        .eq('status', 'Success');
                    
                    if (!logsError && logs) {
                        const cycleHasLogs = logs.some(log => {
                            const logDate = new Date(log.sent_at);
                            if (logDate.getFullYear() !== year || logDate.getMonth() !== month) return false;
                            const d = logDate.getDate();
                            if (dueCycle === 5) return d >= 5 && d < 15;
                            if (dueCycle === 15) return d >= 15 && d < 25;
                            if (dueCycle === 25) return d >= 25 && d < 30;
                            if (dueCycle === 30) return d >= 30 || d < 5;
                            return false;
                        });
                        if (!cycleHasLogs) {
                            showSoaReminder = true;
                        }
                    } else {
                        // Fallback if table doesn't exist yet
                        showSoaReminder = true;
                    }
                } catch (e) {
                    console.warn("Could not check SOA dispatch logs:", e.message);
                    showSoaReminder = true;
                }
            }

            if (showSoaReminder) {
                let overdueCount = 0;
                try {
                    const { data: unpaidDocs } = await supabase
                        .from('workflow_documents')
                        .select('partner_id, total_amount, status')
                        .eq('company_id', profile.company_id)
                        .not('status', 'in', '("Paid","Cancelled","Reversed","Completed")');
                    
                    if (unpaidDocs) {
                        const uniqueOverduePartners = new Set(unpaidDocs.map(d => d.partner_id).filter(Boolean));
                        overdueCount = uniqueOverduePartners.size;
                    }
                } catch (e) {
                    console.warn("Could not count overdue partners:", e);
                }

                filteredReminders.unshift({
                    id: 'soa-dispatch-reminder',
                    document_no: `📅 SOA Cycle Due: ${cycleLabel}`,
                    document_type: 'SOA Cycle',
                    partnerName: `Outstanding statement run is active. Click here to review and dispatch statements to ${overdueCount || 'all'} overdue accounts.`,
                    targetDateStr: new Date().toISOString(),
                    diffDays: 0,
                    isSoaReminder: true
                });
            }

            setReminders(filteredReminders);
        } catch (error) {
            console.error('Error fetching system reminders:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return null;
    if (reminders.length === 0) return null;

    const getIcon = (type) => {
        switch (type) {
            case 'SOA Cycle':
                return <Calendar size={18} color="#10b981" />;
            case 'Tax Invoice':
            case 'Proforma Invoice':
                return <Receipt size={18} color="#ef4444" />;
            case 'Quotation':
                return <FileText size={18} color="#6366f1" />;
            case 'Job':
                return <Briefcase size={18} color="#10b981" />;
            case 'Delivery Order':
                return <Truck size={18} color="#f59e0b" />;
            default:
                return <Bell size={18} color="#64748b" />;
        }
    };

    const getCardStyle = (diffDays) => {
        if (diffDays < 0) {
            // Overdue
            return {
                borderLeft: '4px solid #ef4444',
                background: '#fef2f2',
                badgeBg: '#fee2e2',
                badgeText: '#ef4444'
            };
        } else if (diffDays === 0) {
            // Due Today
            return {
                borderLeft: '4px solid #f59e0b',
                background: '#fffbeb',
                badgeBg: '#fef3c7',
                badgeText: '#d97706'
            };
        } else if (diffDays <= 3) {
            // Due within 3 days
            return {
                borderLeft: '4px solid #3b82f6',
                background: '#f0f9ff',
                badgeBg: '#e0f2fe',
                badgeText: '#0284c7'
            };
        } else {
            // Future persistent reminder
            return {
                borderLeft: '4px solid #6366f1',
                background: '#faf5ff',
                badgeBg: '#f3e8ff',
                badgeText: '#6b21a8'
            };
        }
    };

    const getUrgencyText = (diffDays) => {
        if (diffDays < 0) {
            return `Overdue by ${Math.abs(diffDays)} day${Math.abs(diffDays) > 1 ? 's' : ''}`;
        } else if (diffDays === 0) {
            return 'Due Today';
        } else if (diffDays <= 3) {
            return `Due in ${diffDays} day${diffDays > 1 ? 's' : ''}`;
        } else {
            return `Scheduled: ${diffDays} days left`;
        }
    };

    return (
        <div className="glass-panel" style={{ borderTop: '4px solid var(--accent)', marginBottom: '32px', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                <Bell size={24} className="animate-bounce" color="var(--accent)" />
                <div>
                    <h3 className="form-section-title" style={{ margin: 0, padding: 0, border: 'none', color: '#1e293b' }}>
                        System Alert: Dynamic Due Date Reminders (±3 Days)
                    </h3>
                    <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        Automatic tracking of invoices, quotations, and service dates
                    </p>
                </div>
                <span style={{ marginLeft: 'auto', background: '#e0e7ff', color: 'var(--accent)', padding: '4px 12px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 600 }}>
                    {reminders.length} Active Alerts
                </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
                {reminders.map(rem => {
                    const style = getCardStyle(rem.diffDays);
                    return (
                        <div 
                            key={rem.id} 
                            style={{ 
                                display: 'flex', 
                                flexDirection: 'column', 
                                justifyContent: 'space-between',
                                background: style.background, 
                                padding: '16px', 
                                borderRadius: '12px', 
                                borderLeft: style.borderLeft,
                                borderTop: '1px solid rgba(0,0,0,0.05)',
                                borderRight: '1px solid rgba(0,0,0,0.05)',
                                borderBottom: '1px solid rgba(0,0,0,0.05)',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                                position: 'relative'
                            }}
                        >
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                    <div style={{ background: '#ffffff', padding: '6px', borderRadius: '8px', display: 'flex', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                                        {getIcon(rem.document_type)}
                                    </div>
                                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        {rem.document_type}
                                    </span>
                                    <span style={{ 
                                        marginLeft: 'auto',
                                        background: style.badgeBg, 
                                        color: style.badgeText, 
                                        padding: '3px 10px', 
                                        borderRadius: '8px', 
                                        fontSize: '0.75rem', 
                                        fontWeight: 700 
                                    }}>
                                        {getUrgencyText(rem.diffDays)}
                                    </span>
                                </div>

                                <h4 style={{ margin: '0 0 4px 0', color: '#0f172a', fontSize: '1.05rem', fontWeight: 800 }}>
                                    {rem.document_no}
                                </h4>
                                <p style={{ margin: '0 0 12px 0', fontSize: '0.85rem', color: '#475569', fontWeight: 500 }}>
                                    {rem.partnerName}
                                </p>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: '12px', borderTop: '1px dashed rgba(0,0,0,0.06)' }}>
                                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                    Date: <strong>{new Date(rem.targetDateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</strong>
                                </div>
                                <Link 
                                    to={rem.isSoaReminder ? "/soa?tab=automated" : (rem.document_type === 'Enquiry' ? `/workflows/enquiry/${rem.id}` : `/workflows/editor/${rem.document_type}/${rem.id}`)} 
                                    style={{ 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: '6px', 
                                        fontSize: '0.85rem', 
                                        fontWeight: 700, 
                                        color: 'var(--accent)',
                                        textDecoration: 'none'
                                    }}
                                >
                                    Review <ArrowRight size={14} />
                                </Link>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
