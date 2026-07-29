import React, { useState, useEffect } from 'react';
import { TrendingUp, BadgeDollarSign, Plus, Trash2, Search, Filter, FileText, Download, ArrowUp, ArrowDown, Building2, Calendar } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import ModuleSwitcherHeader from '../../components/common/ModuleSwitcherHeader';
import toast from 'react-hot-toast';

export default function ExpensesProfitPage() {
    const { profile } = useAuth();
    const companyId = profile?.company_id;

    const [loading, setLoading] = useState(true);
    const [jobs, setJobs] = useState([]);
    const [expenses, setExpenses] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterCategory, setFilterCategory] = useState('All');

    useEffect(() => {
        if (companyId) {
            loadFinancialData();
        }
    }, [companyId]);

    const loadFinancialData = async () => {
        setLoading(true);
        try {
            const [jobsRes, expRes] = await Promise.all([
                supabase.from('jobs').select('*').eq('company_id', companyId),
                supabase.from('job_expenses').select('*').eq('company_id', companyId)
            ]);

            setJobs(jobsRes.data || []);
            setExpenses(expRes.data || []);
        } catch (err) {
            console.error('Error loading financial analytics:', err);
        } finally {
            setLoading(false);
        }
    };

    // Global Financial Summary Metrics
    const totalRevenue = jobs.reduce((sum, j) => sum + (parseFloat(j.po_amount || j.total_amount) || 0), 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + (parseFloat(e.amount || e.grand_total) || 0), 0);
    const netProfit = totalRevenue - totalExpenses;
    const overallMargin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : 0;

    // Filtered Expenses
    const filteredExpenses = expenses.filter(exp => {
        const matchesSearch = (exp.supplier_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                              (exp.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                              (exp.job_no || '').toLowerCase().includes(searchTerm.toLowerCase());
        const matchesCategory = filterCategory === 'All' || exp.category === filterCategory;
        return matchesSearch && matchesCategory;
    });

    return (
        <div className="animate-fade-in" style={{ maxWidth: '1600px', margin: '0 auto', padding: '0 8px' }}>
            {/* Top Switcher Bar */}
            <ModuleSwitcherHeader activeModule="processing" />

            <div className="page-header mb-6">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
                        <TrendingUp className="w-7 h-7 text-emerald-600" />
                        Expenses & Financial Profitability Dashboard
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Executive company-wide profit finder, job costing ledger, and vendor expense tracking.
                    </p>
                </div>
            </div>

            {/* Financial Overview KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Sales Invoiced</span>
                    <div className="text-2xl font-black text-slate-900 mt-1">
                        SGD ${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                    <span className="text-[11px] text-slate-400 mt-1 block">Contract PO & Invoice Value</span>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Vendor Expenses</span>
                    <div className="text-2xl font-black text-rose-600 mt-1">
                        SGD ${totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                    <span className="text-[11px] text-slate-400 mt-1 block">Logged Bills & Supplier POs</span>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Net Profit</span>
                    <div className={`text-2xl font-black mt-1 ${netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        SGD ${netProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                    <span className="text-[11px] text-slate-400 mt-1 block">Revenue minus Expenses</span>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Profit Margin</span>
                    <div className={`text-2xl font-black mt-1 ${overallMargin >= 20 ? 'text-emerald-600' : overallMargin >= 0 ? 'text-amber-600' : 'text-rose-600'}`}>
                        {overallMargin}%
                    </div>
                    <span className="text-[11px] text-slate-400 mt-1 block">Net Profit Margin %</span>
                </div>
            </div>

            {/* Job Profitability Ledger (Profit Finder) */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs mb-8 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div>
                        <h2 className="font-bold text-slate-900 text-lg flex items-center gap-2">
                            <BadgeDollarSign className="w-5 h-5 text-indigo-600" />
                            Job Profitability Ledger (Profit Finder)
                        </h2>
                        <p className="text-xs text-slate-500">Real-time gross margin breakdown for every active and completed job.</p>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead>
                            <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                                <th className="p-3">CEL Job No</th>
                                <th className="p-3">Customer</th>
                                <th className="p-3 text-right">Revenue Value</th>
                                <th className="p-3 text-right">Total Expenses</th>
                                <th className="p-3 text-right">Net Profit</th>
                                <th className="p-3 text-center">Margin %</th>
                                <th className="p-3 text-center">Filing Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {jobs.map(job => {
                                const jobRev = parseFloat(job.po_amount || job.total_amount || 0);
                                const jobCosts = expenses
                                    .filter(e => e.job_no === job.job_no || e.job_id === job.id)
                                    .reduce((sum, e) => sum + (parseFloat(e.amount || e.grand_total) || 0), 0);
                                const jobNet = jobRev - jobCosts;
                                const jobMargin = jobRev > 0 ? ((jobNet / jobRev) * 100).toFixed(1) : 0;

                                return (
                                    <tr key={job.id} className="hover:bg-slate-50/70">
                                        <td className="p-3 font-bold text-slate-900">{job.job_no || 'TBD'}</td>
                                        <td className="p-3 text-slate-700">{job.customer_name || job.delivery_verification?.po_description || 'Customer'}</td>
                                        <td className="p-3 text-right font-bold text-slate-900">
                                            SGD ${jobRev.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="p-3 text-right font-semibold text-rose-600">
                                            SGD ${jobCosts.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className={`p-3 text-right font-bold ${jobNet >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                            SGD ${jobNet.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="p-3 text-center">
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                jobMargin >= 20 ? 'bg-emerald-100 text-emerald-800' : jobMargin >= 0 ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
                                            }`}>
                                                {jobMargin}%
                                            </span>
                                        </td>
                                        <td className="p-3 text-center">
                                            <a
                                                href={`/workflows/wizard?step=8&jobNo=${job.job_no}`}
                                                className="px-2.5 py-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg inline-flex items-center gap-1"
                                            >
                                                📁 View Step 8
                                            </a>
                                        </td>
                                    </tr>
                                );
                            })}

                            {jobs.length === 0 && (
                                <tr>
                                    <td colSpan="7" className="p-8 text-center text-slate-400 text-xs">
                                        No jobs recorded yet.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Expenses & Vendor Bills Master Ledger */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                    <div>
                        <h2 className="font-bold text-slate-900 text-lg">All Logged Expenses & Vendor Bills</h2>
                        <p className="text-xs text-slate-500">Master repository of all logged job expenses, materials, and subcontractor costs.</p>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                            <input
                                type="text"
                                placeholder="Search supplier or description..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 bg-white"
                            />
                        </div>

                        <select
                            value={filterCategory}
                            onChange={(e) => setFilterCategory(e.target.value)}
                            className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 bg-white"
                        >
                            <option value="All">All Categories</option>
                            <option value="Material / Parts">Material / Parts</option>
                            <option value="Subcontractor Service">Subcontractor Service</option>
                            <option value="Logistics & Transport">Logistics & Transport</option>
                            <option value="Field Expenses">Field Expenses</option>
                        </select>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead>
                            <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                                <th className="p-3">Supplier / Vendor</th>
                                <th className="p-3">Description</th>
                                <th className="p-3">Category</th>
                                <th className="p-3">Job No</th>
                                <th className="p-3">Date</th>
                                <th className="p-3 text-right">Amount (SGD)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredExpenses.map((exp, idx) => (
                                <tr key={exp.id || idx} className="hover:bg-slate-50/70">
                                    <td className="p-3 font-semibold text-slate-800">{exp.supplier_name || 'General Vendor'}</td>
                                    <td className="p-3 text-slate-600">{exp.description || '-'}</td>
                                    <td className="p-3">
                                        <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                                            {exp.category || 'General'}
                                        </span>
                                    </td>
                                    <td className="p-3 font-mono text-indigo-600">{exp.job_no || '-'}</td>
                                    <td className="p-3 text-slate-500">{exp.invoice_date || '-'}</td>
                                    <td className="p-3 text-right font-bold text-rose-600">
                                        SGD ${parseFloat(exp.amount || exp.grand_total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </td>
                                </tr>
                            ))}

                            {filteredExpenses.length === 0 && (
                                <tr>
                                    <td colSpan="6" className="p-8 text-center text-slate-400 text-xs">
                                        No expense records found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
