import React, { useState } from 'react';
import { ShoppingCart, Briefcase, Receipt, ArrowLeft, ArrowRight, CheckCircle } from 'lucide-react';
import StepOrdersToSuppliers from './StepOrdersToSuppliers';
import StepJobExecution from './StepJobExecution';
import StepSupplierInvoices from './StepSupplierInvoices';

export default function StepSupplierAndJobExecution({
    wizardData,
    updateWizardData,
    onNext,
    onPrev,
    partners = [],
    staff = [],
    companyId
}) {
    const [activeSubTab, setActiveSubTab] = useState(1);

    const subTabs = [
        {
            id: 1,
            title: 'Orders to Suppliers (POs)',
            subtitle: 'Issue & manage vendor purchase orders',
            icon: ShoppingCart,
            badge: Array.isArray(wizardData.supplierOrders) ? wizardData.supplierOrders.length : 0
        },
        {
            id: 2,
            title: 'Job Execution',
            subtitle: 'Engineer assignment & job sheet',
            icon: Briefcase,
            badge: wizardData.jobNo ? 'Job Created' : null
        },
        {
            id: 3,
            title: 'Supplier Invoices',
            subtitle: 'Incoming vendor bills & matching',
            icon: Receipt,
            badge: Array.isArray(wizardData.supplierInvoices) ? wizardData.supplierInvoices.length : 0
        }
    ];

    return (
        <div className="space-y-6">
            {/* Consolidated Header & Sub-Tabs */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4 pb-4 border-b border-slate-100">
                    <div>
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 mb-2">
                            Step 4 of 7 • Combined Execution & Vendor Ops
                        </span>
                        <h2 className="text-xl font-bold text-slate-800">
                            Job Execution & Supplier Operations
                        </h2>
                        <p className="text-sm text-slate-500">
                            Manage supplier POs, engineer field execution, and incoming vendor invoices in one unified activity step.
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={onPrev}
                            className="px-3.5 py-2 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5"
                        >
                            <ArrowLeft className="w-4 h-4" /> Back to Step 3
                        </button>
                        <button
                            type="button"
                            onClick={onNext}
                            className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm flex items-center gap-1.5"
                        >
                            Proceed to Step 5 <ArrowRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Sub-Tab Selector Buttons */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {subTabs.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeSubTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setActiveSubTab(tab.id)}
                                className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all ${
                                    isActive
                                        ? 'bg-indigo-50/70 border-indigo-300 ring-2 ring-indigo-500/20 text-indigo-950'
                                        : 'bg-slate-50/60 border-slate-200 hover:bg-slate-100/70 text-slate-600'
                                }`}
                            >
                                <div className={`p-2 rounded-lg ${isActive ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                                    <Icon className="w-5 h-5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-1">
                                        <span className="font-semibold text-sm text-slate-900 truncate">
                                            {tab.id}. {tab.title}
                                        </span>
                                        {tab.badge && (
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${
                                                isActive ? 'bg-indigo-200 text-indigo-800' : 'bg-slate-200 text-slate-700'
                                            }`}>
                                                {tab.badge}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-slate-500 truncate mt-0.5">{tab.subtitle}</p>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Render Active Sub-Activity */}
            <div className="transition-all duration-200">
                {activeSubTab === 1 && (
                    <StepOrdersToSuppliers
                        wizardData={wizardData}
                        updateWizardData={updateWizardData}
                        onNext={() => setActiveSubTab(2)}
                        onPrev={onPrev}
                        partners={partners}
                        companyId={companyId}
                    />
                )}

                {activeSubTab === 2 && (
                    <StepJobExecution
                        wizardData={wizardData}
                        updateWizardData={updateWizardData}
                        onNext={() => setActiveSubTab(3)}
                        onPrev={() => setActiveSubTab(1)}
                        partners={partners}
                        staff={staff}
                        companyId={companyId}
                    />
                )}

                {activeSubTab === 3 && (
                    <StepSupplierInvoices
                        wizardData={wizardData}
                        updateWizardData={updateWizardData}
                        onNext={onNext}
                        onPrev={() => setActiveSubTab(2)}
                        partners={partners}
                        companyId={companyId}
                    />
                )}
            </div>
        </div>
    );
}
