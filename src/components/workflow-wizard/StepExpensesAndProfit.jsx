import React, { useState, useEffect } from 'react';
import { TrendingUp, BadgeDollarSign, Plus, Trash2, CheckCircle2, ArrowLeft, ArrowRight, FileText, Download, DollarSign, Calendar, Layers, Building2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import SmartUploadPanel from '../upload/SmartUploadPanel';
import UniversalFileViewer from '../common/UniversalFileViewer';
import toast from 'react-hot-toast';

export default function StepExpensesAndProfit({
    wizardData,
    updateWizardData,
    onPrev,
    onCompleteWorkflow,
    isSaving,
    companyId
}) {
    const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
    const [selectedPreviewFile, setSelectedPreviewFile] = useState(null);
    const [expensesList, setExpensesList] = useState([]);
    const [loadingExpenses, setLoadingExpenses] = useState(false);

    // New Expense Form State
    const [newExpense, setNewExpense] = useState({
        supplierName: '',
        description: '',
        amount: '',
        category: 'Material / Parts',
        date: new Date().toISOString().split('T')[0],
        invoiceNo: '',
        attachmentUrl: ''
    });

    // Load existing expenses for this job/enquiry from Supabase or wizardData
    useEffect(() => {
        if (Array.isArray(wizardData.jobExpenses) && wizardData.jobExpenses.length > 0) {
            setExpensesList(wizardData.jobExpenses);
        } else {
            fetchJobExpenses();
        }
    }, [wizardData.jobNo, wizardData.enquiryNo, companyId]);

    const fetchJobExpenses = async () => {
        if (!companyId || (!wizardData.jobNo && !wizardData.enquiryNo)) return;
        setLoadingExpenses(true);
        try {
            const { data, error } = await supabase
                .from('job_expenses')
                .select('*')
                .eq('company_id', companyId)
                .or(`job_no.eq.${wizardData.jobNo},enquiry_no.eq.${wizardData.enquiryNo}`);

            if (!error && Array.isArray(data)) {
                setExpensesList(data);
                updateWizardData({ jobExpenses: data });
            }
        } catch (err) {
            console.error('Error loading job expenses:', err);
        } finally {
            setLoadingExpenses(false);
        }
    };

    // Financial Calculations
    const revenue = parseFloat(wizardData.customerPoAmount || wizardData.grandTotal || 0);
    
    // Total from supplier orders array in Step 4
    const supplierOrdersTotal = Array.isArray(wizardData.supplierOrders)
        ? wizardData.supplierOrders.reduce((sum, o) => sum + (parseFloat(o.amount) || 0), 0)
        : 0;

    // Total from logged expenses list
    const additionalExpensesTotal = expensesList.reduce((sum, e) => sum + (parseFloat(e.amount || e.grand_total) || 0), 0);

    const totalCosts = supplierOrdersTotal + additionalExpensesTotal;
    const netProfit = revenue - totalCosts;
    const profitMargin = revenue > 0 ? ((netProfit / revenue) * 100).toFixed(1) : 0;

    // Handle adding new expense item
    const handleSaveNewExpense = async (e) => {
        e.preventDefault();
        if (!newExpense.description || !newExpense.amount) {
            return toast.error('Please enter description and amount.');
        }

        const expenseItem = {
            id: `exp-${Date.now()}`,
            supplier_name: newExpense.supplierName || 'General Vendor',
            description: newExpense.description,
            amount: parseFloat(newExpense.amount),
            grand_total: parseFloat(newExpense.amount),
            category: newExpense.category,
            invoice_date: newExpense.date,
            supplier_invoice_no: newExpense.invoiceNo,
            bill_url: newExpense.attachmentUrl,
            job_no: wizardData.jobNo || '',
            enquiry_no: wizardData.enquiryNo || ''
        };

        const updated = [expenseItem, ...expensesList];
        setExpensesList(updated);
        updateWizardData({ jobExpenses: updated });

        // Save to Supabase if company ID available
        if (companyId) {
            try {
                await supabase.from('job_expenses').insert([{
                    company_id: companyId,
                    supplier_name: expenseItem.supplier_name,
                    description: expenseItem.description,
                    amount: expenseItem.amount,
                    grand_total: expenseItem.grand_total,
                    category: expenseItem.category,
                    invoice_date: expenseItem.invoice_date,
                    supplier_invoice_no: expenseItem.supplier_invoice_no,
                    bill_url: expenseItem.bill_url,
                    job_no: wizardData.jobNo || null
                }]);
            } catch (err) {
                console.error('Database expense save note:', err);
            }
        }

        toast.success('Expense item logged!');
        setNewExpense({
            supplierName: '',
            description: '',
            amount: '',
            category: 'Material / Parts',
            date: new Date().toISOString().split('T')[0],
            invoiceNo: '',
            attachmentUrl: ''
        });
        setIsAddExpenseOpen(false);
    };

    const handleDeleteExpense = (index) => {
        const updated = expensesList.filter((_, i) => i !== index);
        setExpensesList(updated);
        updateWizardData({ jobExpenses: updated });
        toast.success('Expense removed');
    };

    return (
        <div className="space-y-6">
            {/* Header & Step Title */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 mb-2">
                            Step 8 of 8 • Job Closure & Profit Analytics
                        </span>
                        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            <TrendingUp className="w-6 h-6 text-emerald-600" />
                            Expenses & Financial Profitability
                        </h2>
                        <p className="text-sm text-slate-500">
                            Final job costing audit, supplier expense ledger, and net profit analysis.
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={onPrev}
                            className="px-3.5 py-2 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5"
                        >
                            <ArrowLeft className="w-4 h-4" /> Back to Step 7
                        </button>
                        <button
                            type="button"
                            onClick={onCompleteWorkflow}
                            disabled={isSaving}
                            className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors shadow-sm flex items-center gap-1.5"
                        >
                            <CheckCircle2 className="w-4 h-4" />
                            {isSaving ? 'Saving Workflow...' : 'Complete & Close Workflow'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Financial Summary KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Job Revenue (PO)</span>
                    <div className="text-2xl font-black text-slate-900 mt-1">
                        SGD ${revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                    <span className="text-[11px] text-slate-400 mt-1 block">Contract PO value</span>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Job Expenses</span>
                    <div className="text-2xl font-black text-rose-600 mt-1">
                        SGD ${totalCosts.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                    <span className="text-[11px] text-slate-400 mt-1 block">Vendor POs + Field Costs</span>
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
                    <div className={`text-2xl font-black mt-1 ${profitMargin >= 20 ? 'text-emerald-600' : profitMargin >= 0 ? 'text-amber-600' : 'text-rose-600'}`}>
                        {profitMargin}%
                    </div>
                    <span className="text-[11px] text-slate-400 mt-1 block">Net Profit Margin %</span>
                </div>
            </div>

            {/* Expenses & Supplier Bills Ledger */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div>
                        <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                            <BadgeDollarSign className="w-5 h-5 text-indigo-600" />
                            Logged Job Expenses & Vendor Costs
                        </h3>
                        <p className="text-xs text-slate-500">Record material costs, subcontractor fees, freight, and field expenses for this job.</p>
                    </div>

                    <button
                        type="button"
                        onClick={() => setIsAddExpenseOpen(true)}
                        className="px-3.5 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors flex items-center gap-1.5"
                    >
                        <Plus className="w-4 h-4" /> Log New Expense
                    </button>
                </div>

                {/* Add Expense Modal / Form */}
                {isAddExpenseOpen && (
                    <form onSubmit={handleSaveNewExpense} className="p-4 bg-slate-50 border border-indigo-200 rounded-xl space-y-3">
                        <h4 className="text-xs font-bold text-indigo-950 uppercase tracking-wider">Add Expense Item</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                            <div>
                                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Supplier / Vendor</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Siemens SG Pte Ltd"
                                    value={newExpense.supplierName}
                                    onChange={(e) => setNewExpense({ ...newExpense, supplierName: e.target.value })}
                                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 bg-white"
                                />
                            </div>

                            <div>
                                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Description / Item *</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g. Replacement relay coils"
                                    value={newExpense.description}
                                    onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })}
                                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 bg-white"
                                />
                            </div>

                            <div>
                                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Amount (SGD) *</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    required
                                    placeholder="0.00"
                                    value={newExpense.amount}
                                    onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
                                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 bg-white"
                                />
                            </div>

                            <div>
                                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Category</label>
                                <select
                                    value={newExpense.category}
                                    onChange={(e) => setNewExpense({ ...newExpense, category: e.target.value })}
                                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 bg-white"
                                >
                                    <option value="Material / Parts">Material / Parts</option>
                                    <option value="Subcontractor Service">Subcontractor Service</option>
                                    <option value="Logistics & Transport">Logistics & Transport</option>
                                    <option value="Field Expenses">Field Expenses</option>
                                    <option value="Tools & Equipment">Tools & Equipment</option>
                                </select>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setIsAddExpenseOpen(false)}
                                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200 rounded-lg"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs"
                            >
                                Save Expense
                            </button>
                        </div>
                    </form>
                )}

                {/* Expenses Table */}
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead>
                            <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                                <th className="p-3">Vendor / Description</th>
                                <th className="p-3">Category</th>
                                <th className="p-3">Date</th>
                                <th className="p-3 text-right">Amount (SGD)</th>
                                <th className="p-3 text-center">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {/* Render Supplier POs from Step 4 */}
                            {Array.isArray(wizardData.supplierOrders) && wizardData.supplierOrders.map((po, idx) => (
                                <tr key={`po-${idx}`} className="hover:bg-slate-50/70">
                                    <td className="p-3">
                                        <div className="font-semibold text-slate-800">{po.supplierName || 'Supplier PO'}</div>
                                        <div className="text-[11px] text-slate-500">{po.supplierPoNo} • {po.activityDescription}</div>
                                    </td>
                                    <td className="p-3">
                                        <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                                            Supplier PO (Step 4)
                                        </span>
                                    </td>
                                    <td className="p-3 text-slate-500">{po.orderDate || '-'}</td>
                                    <td className="p-3 text-right font-bold text-rose-600">
                                        SGD ${parseFloat(po.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className="p-3 text-center text-slate-400">-</td>
                                </tr>
                            ))}

                            {/* Render Logged Expenses */}
                            {expensesList.map((exp, idx) => (
                                <tr key={exp.id || idx} className="hover:bg-slate-50/70">
                                    <td className="p-3">
                                        <div className="font-semibold text-slate-800">{exp.supplier_name || 'Vendor'}</div>
                                        <div className="text-[11px] text-slate-500">{exp.description}</div>
                                    </td>
                                    <td className="p-3">
                                        <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                                            {exp.category || 'Logged Expense'}
                                        </span>
                                    </td>
                                    <td className="p-3 text-slate-500">{exp.invoice_date || '-'}</td>
                                    <td className="p-3 text-right font-bold text-rose-600">
                                        SGD ${parseFloat(exp.amount || exp.grand_total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className="p-3 text-center">
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteExpense(idx)}
                                            className="text-rose-500 hover:text-rose-700 p-1"
                                            title="Delete Expense"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}

                            {(!wizardData.supplierOrders?.length && !expensesList.length) && (
                                <tr>
                                    <td colSpan="5" className="p-6 text-center text-slate-400 text-xs">
                                        No expenses logged yet. Click "+ Log New Expense" to record vendor costs.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Universal File Viewer Modal */}
            {selectedPreviewFile && (
                <UniversalFileViewer
                    file={selectedPreviewFile}
                    onClose={() => setSelectedPreviewFile(null)}
                />
            )}
        </div>
    );
}
