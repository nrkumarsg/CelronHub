import React, { useState } from 'react';
import { Book, Search, FileText, HardDrive, BadgeDollarSign, Wrench, ShieldCheck, ChevronRight, PlayCircle, ExternalLink, Settings, Library, TrendingUp, QrCode, Terminal, Copy, Check, Cpu, Zap, Cloud, Laptop, Key, RefreshCw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { APP_MANUAL_CONTENT } from '../lib/appManual';

export default function HelpCenter() {
    const [activeSection, setActiveSection] = useState('getting-started');
    const [copiedText, setCopiedText] = useState('');

    const handleCopy = (text) => {
        navigator.clipboard.writeText(text);
        setCopiedText(text);
        setTimeout(() => {
            setCopiedText('');
        }, 1500);
    };

    const renderCopyButton = (text) => {
        const isCopied = copiedText === text;
        return (
            <button
                onClick={() => handleCopy(text)}
                className="copy-btn"
                title={isCopied ? "Copied!" : "Copy command"}
                style={{
                    background: 'rgba(255, 255, 255, 0.1)',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '6px',
                    cursor: 'pointer',
                    color: isCopied ? '#10b981' : '#94a3b8',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s',
                    marginLeft: '8px'
                }}
            >
                {isCopied ? <Check size={14} /> : <Copy size={14} />}
            </button>
        );
    };

    const sections = [
        {
            id: 'getting-started',
            title: 'Getting Started',
            icon: <PlayCircle size={20} />,
            content: (
                <div className="help-content-section">
                    <h2>Welcome to CelronHub</h2>
                    <p>CelronHub is your unified platform for maritime operations, sourcing, and financial tracking. This manual is designed to help you "Read and Practice" the new automated workflows.</p>

                    <div className="info-card" style={{ background: 'linear-gradient(135deg, #eff6ff, #dbeafe)', border: '1px solid #bfdbfe', padding: '20px', borderRadius: '12px', marginTop: '20px' }}>
                        <h4 style={{ color: '#1d4ed8', margin: '0 0 10px 0' }}>💡 Pro Navigation Tip</h4>
                        <p style={{ color: '#1e40af', margin: 0, fontSize: '0.9rem' }}>
                            Think of the <strong>Job Portal</strong> as your Command Center and <strong>Google Drive</strong> as your Filing Cabinet. The system automates the bridge between them.
                        </p>
                    </div>
                </div>
            )
        },
        {
            id: 'deployment-cheatsheet',
            title: 'Deployment Cheatsheet',
            icon: <Terminal size={20} />,
            content: (
                <div className="help-content-section deployment-cheatsheet-section">
                    {/* Header */}
                    <div className="cheatsheet-header">
                        <div className="cheatsheet-subtitle">ANTIGRAVITY / COMMAND PROMPT</div>
                        <h2 className="cheatsheet-title">DEPLOYMENT CHEATSHEET</h2>
                        <div className="cheatsheet-bar">Run • Build • Serve Locally • Deploy to Vercel</div>
                    </div>

                    {/* Section 1 & 2 Grid */}
                    <div className="cheatsheet-grid-2">
                        {/* Box 1: Command Execution in Chat */}
                        <div className="cheatsheet-card border-blue">
                            <div className="card-badge bg-blue">1</div>
                            <h3>COMMAND EXECUTION IN CHAT</h3>
                            <p className="card-desc">No separate terminal needed. Just type the command in the chat and I'll handle the rest.</p>
                            
                            <div className="card-subtitle-row">
                                <span className="dot-blue"></span>
                                <h4>How to use:</h4>
                            </div>
                            <p className="sub-desc">Type directly in the chat, for example:</p>
                            
                            <div className="code-box-wrapper">
                                <div className="code-box">
                                    <code>Please run git status</code>
                                    {renderCopyButton("Please run git status")}
                                </div>
                                <div className="code-box" style={{ marginTop: '8px' }}>
                                    <code>Please run flutter run -d chrome</code>
                                    {renderCopyButton("Please run flutter run -d chrome")}
                                </div>
                            </div>

                            <div className="card-subtitle-row" style={{ marginTop: '20px' }}>
                                <span className="dot-blue"></span>
                                <h4>What happens next:</h4>
                            </div>
                            <p className="sub-desc">A secure command window will pop up in the chat with a blue <strong>Approve</strong> button. Click it to run instantly!</p>

                            {/* visual simulator of command window */}
                            <div className="cmd-window-sim">
                                <div className="cmd-window-header">
                                    <div className="cmd-dots">
                                        <span className="cmd-dot red"></span>
                                        <span className="cmd-dot yellow"></span>
                                        <span className="cmd-dot green"></span>
                                    </div>
                                    <div className="cmd-window-title">Command</div>
                                </div>
                                <div className="cmd-window-body">
                                    <code>flutter run -d chrome</code>
                                </div>
                                <div className="cmd-window-footer">
                                    <button className="cmd-btn-cancel" disabled>Cancel</button>
                                    <button className="cmd-btn-approve" disabled>Approve</button>
                                </div>
                            </div>
                        </div>

                        {/* Box 2: Run Locally (Localhost) */}
                        <div className="cheatsheet-card border-purple">
                            <div className="card-badge bg-purple">2</div>
                            <h3>RUN LOCALLY (LOCALHOST)</h3>
                            <p className="card-desc">Choose the option that fits your needs.</p>

                            {/* Sub-box A */}
                            <div className="sub-card bg-light-green">
                                <div className="sub-card-header">
                                    <Laptop size={18} className="text-green" />
                                    <h4>A. Development Mode (With Hot-Reload)</h4>
                                </div>
                                <p className="sub-card-desc">Best for active development with instant updates.</p>
                                <div className="code-box inline-code bg-dark-green">
                                    <code>flutter run -d chrome</code>
                                    {renderCopyButton("flutter run -d chrome")}
                                </div>
                                <p className="sub-card-footer">Tell me: "Run the app in development mode" or "Run flutter run -d chrome".</p>
                            </div>

                            {/* Sub-box B */}
                            <div className="sub-card bg-light-purple" style={{ marginTop: '16px' }}>
                                <div className="sub-card-header">
                                    <Cpu size={18} className="text-purple" />
                                    <h4>B. Production-like Local Serve</h4>
                                </div>
                                <p className="sub-card-desc">Best for testing the compiled, optimized release build.</p>
                                
                                <div className="step-flow">
                                    <div className="flow-step">
                                        <div className="flow-badge">1</div>
                                        <div className="flow-text">
                                            <div className="flow-label">Build the production release:</div>
                                            <div className="code-box inline-code bg-dark-purple">
                                                <code>flutter build web --release</code>
                                                {renderCopyButton("flutter build web --release")}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flow-step" style={{ marginTop: '12px' }}>
                                        <div className="flow-badge">2</div>
                                        <div className="flow-text">
                                            <div className="flow-label">Serve it using a static server:</div>
                                            <div className="code-box inline-code bg-dark-purple">
                                                <code>npx serve -s build/web</code>
                                                {renderCopyButton("npx serve -s build/web")}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="browser-open-link" style={{ marginTop: '16px' }}>
                                    <Cloud size={16} className="text-purple" />
                                    <span>Open in your browser: <a href="http://localhost:3000" target="_blank" rel="noreferrer" className="localhost-link">http://localhost:3000</a></span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Section 3: Deploy to Vercel */}
                    <div className="cheatsheet-card border-orange" style={{ marginTop: '24px' }}>
                        <div className="card-badge bg-orange">3</div>
                        <h3 className="section-title-large">DEPLOY TO VERCEL <span className="accent-text">(FASTEST METHODS)</span></h3>
                        
                        <div className="cheatsheet-grid-2" style={{ marginTop: '20px' }}>
                            {/* Method A */}
                            <div className="method-box">
                                <div className="method-badge">Method A: Super-Fast Way (Under 10 Seconds!)</div>
                                <div className="method-subtitle">Local Build + Vercel CLI</div>

                                <div className="step-timeline" style={{ marginTop: '15px' }}>
                                    <div className="timeline-item">
                                        <div className="timeline-badge">1</div>
                                        <div className="timeline-content">
                                            <div className="timeline-label">Install Vercel CLI (one-time only)</div>
                                            <div className="code-box bg-dark-orange">
                                                <code>npm install -g vercel</code>
                                                {renderCopyButton("npm install -g vercel")}
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="timeline-item">
                                        <div className="timeline-badge">2</div>
                                        <div className="timeline-content">
                                            <div className="timeline-label">Build the project locally</div>
                                            <div className="code-box bg-dark-orange">
                                                <code>flutter build web --release</code>
                                                {renderCopyButton("flutter build web --release")}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="timeline-item">
                                        <div className="timeline-badge">3</div>
                                        <div className="timeline-content">
                                            <div className="timeline-label">Deploy the pre-built files instantly</div>
                                            <div className="code-box bg-dark-orange">
                                                <code>vercel --prod</code>
                                                {renderCopyButton("vercel --prod")}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="info-badge-box bg-light-blue" style={{ marginTop: '20px' }}>
                                    <Zap size={20} className="text-blue animate-pulse" />
                                    <div>
                                        <strong>Why it's fast?</strong>
                                        <p>Vercel uploads the already compiled files in <code>build/web</code>. No build step on Vercel servers = Instant deployment!</p>
                                    </div>
                                </div>
                            </div>

                            {/* Method B */}
                            <div className="method-box">
                                <div className="method-badge orange-light">Method B: Push-to-Git (Automatic & Zero-Config)</div>
                                <div className="method-subtitle">Let Vercel build and deploy automatically.</div>

                                <div className="step-timeline" style={{ marginTop: '15px' }}>
                                    <div className="timeline-item">
                                        <div className="timeline-badge orange-badge">1</div>
                                        <div className="timeline-content">
                                            <div className="timeline-label">Save your changes</div>
                                            <div className="code-box bg-dark-orange">
                                                <code>git add . && git commit -m "Your update message"</code>
                                                {renderCopyButton('git add . && git commit -m "Your update message"')}
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="timeline-item" style={{ marginTop: '20px' }}>
                                        <div className="timeline-badge orange-badge">2</div>
                                        <div className="timeline-content">
                                            <div className="timeline-label">Push to your main branch</div>
                                            <div className="code-box bg-dark-orange">
                                                <code>git push origin main</code>
                                                {renderCopyButton("git push origin main")}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="info-badge-box bg-light-orange" style={{ marginTop: '64px' }}>
                                    <RefreshCw size={20} className="text-orange" />
                                    <div>
                                        <strong>What happens next?</strong>
                                        <p>Vercel detects the push, runs the "vercel-build" script (from <code>package.json</code>), and deploys automatically in the background!</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Vercel Login Required */}
                    <div className="login-req-banner" style={{ marginTop: '24px' }}>
                        <div className="login-req-left">
                            <Key size={24} className="text-grey-blue" />
                            <div>
                                <h4>Vercel Login Required <span className="subtitle-small">(If You See Token Error)</span></h4>
                                <p className="error-text">Error: "The specified token is not valid. Use vercel login to generate a new token."</p>
                                <div className="code-box inline-code bg-dark-grey" style={{ maxWidth: '280px', marginTop: '10px' }}>
                                    <code>npx vercel login</code>
                                    {renderCopyButton("npx vercel login")}
                                </div>
                            </div>
                        </div>
                        <div className="login-req-right">
                            <div className="checkmark-list">
                                <div className="checkmark-item">
                                    <span className="check-dot">✓</span>
                                    <span>Choose your login method (GitHub, Email, etc.)</span>
                                </div>
                                <div className="checkmark-item">
                                    <span className="check-dot">✓</span>
                                    <span>Complete the login in your browser</span>
                                </div>
                                <div className="checkmark-item">
                                    <span className="check-dot">✓</span>
                                    <span>Return to terminal – you're now logged in!</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Quick Command Reference */}
                    <div className="quick-reference-card" style={{ marginTop: '24px' }}>
                        <h3>QUICK COMMAND REFERENCE</h3>
                        <div className="quick-grid">
                            <div className="quick-col">
                                <div className="quick-label">
                                    <span className="indicator" style={{ background: '#10b981' }}></span>
                                    <span>Run in Development <span className="label-detail">(Hot-Reload)</span></span>
                                </div>
                                <div className="code-box bg-ref">
                                    <code>flutter run -d chrome</code>
                                    {renderCopyButton("flutter run -d chrome")}
                                </div>
                            </div>
                            <div className="quick-col">
                                <div className="quick-label">
                                    <span className="indicator" style={{ background: '#7c3aed' }}></span>
                                    <span>Build for Production</span>
                                </div>
                                <div className="code-box bg-ref">
                                    <code>flutter build web --release</code>
                                    {renderCopyButton("flutter build web --release")}
                                </div>
                            </div>
                            <div className="quick-col">
                                <div className="quick-label">
                                    <span className="indicator" style={{ background: '#2563eb' }}></span>
                                    <span>Serve Locally</span>
                                </div>
                                <div className="code-box bg-ref">
                                    <code>npx serve -s build/web</code>
                                    {renderCopyButton("npx serve -s build/web")}
                                </div>
                                <a href="http://localhost:3000" target="_blank" rel="noreferrer" className="quick-link">Open: http://localhost:3000</a>
                            </div>
                            <div className="quick-col">
                                <div className="quick-label">
                                    <span className="indicator" style={{ background: '#ea580c' }}></span>
                                    <span>Deploy to Vercel (Fast)</span>
                                </div>
                                <div className="code-box bg-ref">
                                    <code>vercel --prod</code>
                                    {renderCopyButton("vercel --prod")}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Pro Tip */}
                    <div className="pro-tip-box" style={{ marginTop: '24px' }}>
                        <div className="pro-tip-badge">PRO TIP</div>
                        <p className="pro-tip-text">
                            For the fastest local testing: <strong>Build + Serve (Option 2)</strong> gives you the exact production experience.<br/>
                            For fastest deployment: Use <strong>Method A (Local Build + Vercel CLI)</strong> – Under 10 seconds!
                        </p>
                    </div>
                </div>
            )
        },
        {
            id: 'manual',
            title: 'Full App Manual',
            icon: <FileText size={20} />,
            content: (
                <div className="help-content-section md-content" style={{ paddingRight: '20px' }}>
                    <div className="info-card" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '15px', borderRadius: '8px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <h4 style={{ margin: '0 0 5px 0', color: '#0f172a' }}>CelronHub Operations Manual</h4>
                            <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>Complete guide to the entire workflow system.</p>
                        </div>
                    </div>
                    <div style={{ lineHeight: '1.6', color: '#334155' }}>
                        <ReactMarkdown
                            components={{
                                h1: ({ node, ...props }) => <h1 style={{ fontSize: '2rem', borderBottom: '2px solid #e2e8f0', paddingBottom: '10px', marginTop: 0 }} {...props} />,
                                h2: ({ node, ...props }) => <h2 style={{ fontSize: '1.5rem', color: '#1e293b', marginTop: '30px', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }} {...props} />,
                                h3: ({ node, ...props }) => <h3 style={{ fontSize: '1.2rem', color: '#334155', marginTop: '20px' }} {...props} />,
                                p: ({ node, ...props }) => <p style={{ marginBottom: '16px' }} {...props} />,
                                ul: ({ node, ...props }) => <ul style={{ marginBottom: '16px', paddingLeft: '24px' }} {...props} />,
                                li: ({ node, ...props }) => <li style={{ marginBottom: '8px' }} {...props} />,
                                hr: ({ node, ...props }) => <hr style={{ margin: '30px 0', border: 'none', borderTop: '1px solid #e2e8f0' }} {...props} />
                            }}
                        >
                            {APP_MANUAL_CONTENT}
                        </ReactMarkdown>
                    </div>
                </div>
            )
        },
        {
            id: 'sourcing',
            title: '1. Sourcing & Finder',
            icon: <Search size={20} />,
            content: (
                <div className="help-content-section">
                    <h2>Universal Finder & Sourcing</h2>
                    <p>Find any part or supplier using our AI-powered discovery tools.</p>

                    <h3>Advanced Technical Tips</h3>
                    <p>If you see a "Navigator LockManager lock timeout" or counts show "0" despite having data:</p>
                    <ul>
                        <li><strong>Refresh the Tab</strong>: This usually resolves internal browser lock conflicts.</li>
                        <li><strong>Check Connection</strong>: Slow networks can delay your profile synchronization. We've increased timeouts to 15s to help.</li>
                        <li><strong>Clear Site Data</strong>: In rare cases, clearing browser storage for the app resolves persistent auth sync issues.</li>
                    </ul>

                    <div className="step-list">
                        <div className="step-item">
                            <div className="step-badge">AI</div>
                            <div>
                                <h4>PartFinder AI</h4>
                                <p>Describe a part or upload a photo. The AI identifies the specifications and suggests reliable vendors from your database.</p>
                            </div>
                        </div>
                        <div className="step-item">
                            <div className="step-badge">Web</div>
                            <div>
                                <h4>Supplier Search</h4>
                                <p>Access live web results for global suppliers. Filter by Brand, Country, or Category to find the right partner instantly.</p>
                            </div>
                        </div>
                        <div className="step-item">
                            <div className="step-badge">Ext</div>
                            <div>
                                <h4>Global Finder</h4>
                                <p>Integrated access to external tracking and manufacturer sites like Omron or Base44. Use "Open in New Tab" if a site restricts iframe loading.</p>
                            </div>
                        </div>
                    </div>
                </div>
            )
        },
        {
            id: 'lifecycle',
            title: '2. Job Folder Standard (SOP)',
            icon: <Library size={20} />,
            content: (
                <div className="help-content-section">
                    <h2>Job Folder Standard (SOP)</h2>
                    <p>To train newcomers: CelronHub uses a mandatory **8-Folder Max** system for all projects. This ensures that documents are never lost and the structure remains clean.</p>

                    <div className="folder-tree-guide" style={{ marginTop: '30px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        {[
                            { n: '1. Enquiries & Quotations', d: 'ENQ, QTN, ORA (Customer Requests & Offers)' },
                            { n: '2. Supplier Bids & POs', d: 'Supplier quotes, technical engagement, and outgoing POs' },
                            { n: '3. Operations & Logistics', d: 'DO, SR, CERT, PKL (Delivery, Service Reports, Certificates)' },
                            { n: '4. Finance & Invoices', d: 'INV, PRO, SOA (Tax Invoices, Proformas, Statements)' },
                            { n: '5. Expenses & Payments', d: 'Expense bills, Bank slips, and general Payment records' },
                            { n: '6. Job Gallery & Photos', d: 'Photos, site media, and job evidence' },
                            { n: '7. Correspondence & Admin', d: 'Official emails, admin docs, and misc letters' },
                            { n: '8. Technical Documents', d: 'Technical drawings, manuals, and data sheets' }
                        ].map(item => (
                            <div key={item.n} style={{ display: 'flex', gap: '12px', alignItems: 'center', background: '#f8fafc', padding: '12px 20px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                                <div style={{ color: 'var(--accent)', fontWeight: 800, fontSize: '0.9rem', width: '220px' }}>{item.n}</div>
                                <div style={{ fontSize: '0.85rem', color: '#64748b' }}>➔ {item.d}</div>
                            </div>
                        ))}
                    </div>

                    <div className="info-card" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '20px', borderRadius: '12px', marginTop: '30px' }}>
                        <h4 style={{ color: '#166534', margin: '0 0 8px 0' }}>💡 Training Note</h4>
                        <p style={{ color: '#14532d', margin: 0, fontSize: '0.9rem' }}>
                            Newcomers should be taught that the system <strong>automatically</strong> puts generated PDFs into these folders. Manual uploads should follow the same pattern using the "Project Vault" tab in any Job screen.
                        </p>
                    </div>
                </div>
            )
        },
        {
            id: 'finance',
            title: '3. Profit Finder',
            icon: <BadgeDollarSign size={20} />,
            content: (
                <div className="help-content-section">
                    <h2>Financial Profit Finder</h2>
                    <p>Real-time margin tracking to ensure every job is profitable.</p>

                    <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '20px' }}>
                        <div className="glass-panel" style={{ padding: '15px' }}>
                            <h4 style={{ margin: '0 0 10px 0' }}>Job Costing</h4>
                            <p style={{ fontSize: '0.85rem' }}>Add supplier bills directly to a job. Uploading a scan autosaves it to Drive Folder #2.</p>
                        </div>
                        <div className="glass-panel" style={{ padding: '15px' }}>
                            <h4 style={{ margin: '0 0 10px 0' }}>Profit Dashboard</h4>
                            <p style={{ fontSize: '0.85rem' }}>View the global summary on the <strong>Reports</strong> page to see Order Value vs. Costs across the whole company.</p>
                        </div>
                    </div>
                </div>
            )
        },
        {
            id: 'qr-barcode',
            title: '4. QR & Barcode',
            icon: <QrCode size={20} />,
            content: (
                <div className="help-content-section">
                    <h2>QR & Barcode Operations</h2>
                    <p>Streamline your inventory management with mobile scanning and professional label printing.</p>

                    <div className="step-list">
                        <div className="step-item">
                            <div className="step-badge">1</div>
                            <div>
                                <h4>Setup Barcodes</h4>
                                <p>Go to your Catalog and edit any item. You can type in a barcode or use the <strong>Camera Icon</strong> to scan an existing label. The system will save this unique SKU for future searches.</p>
                            </div>
                        </div>
                        <div className="step-item">
                            <div className="step-badge">2</div>
                            <div>
                                <h4>Multi-Column Printing</h4>
                                <p>Use the <strong>Print QR Labels</strong> sidebar link. Select your items and enter the quantity (e.g., 10 labels for 10 units in stock). Our system automatically formats these into an <strong>A4-optimized 3-column layout</strong> to save paper.</p>
                            </div>
                        </div>
                        <div className="step-item">
                            <div className="step-badge">3</div>
                            <div>
                                <h4>Mobile Camera Search</h4>
                                <p>On your mobile phone, click the <strong>Scan</strong> button in the Catalog. Point your camera at a part's QR code to instantly find its price, stock level, and technical details without typing.</p>
                            </div>
                        </div>
                    </div>

                    <div className="info-card" style={{ background: '#ecfdf5', border: '1px solid #10b981', padding: '15px', borderRadius: '12px', marginTop: '30px' }}>
                        <h4 style={{ color: '#047857', margin: '0 0 8px 0' }}>💡 Pro Tip: Paper Savings</h4>
                        <p style={{ color: '#065f46', margin: 0, fontSize: '0.9rem' }}>
                            When printing, choose "Fit to Page" in your printer settings to ensure all 3 columns of labels align perfectly with your sticker sheets.
                        </p>
                    </div>
                </div>
            )
        },
        {
            id: 'vault',
            title: '5. Storage & Vault',
            icon: <HardDrive size={20} />,
            content: (
                <div className="help-content-section">
                    <h2>Storage & Corporate Vault</h2>
                    <p>Managing active projects vs. permanent company records.</p>

                    <div className="help-card">
                        <h4>Archive to Vault</h4>
                        <p>When a job is closed, click "Archive to Vault". The system moves the physical folder in Google Drive to the long-term archive.</p>
                    </div>

                    <div className="help-card">
                        <h4>Standards & Stationery</h4>
                        <p>Quick-access button in the <strong>Corporate Vault</strong> header provides instant access to Company Logos, Letterheads, and Templates.</p>
                    </div>
                </div>
            )
        },
        {
            id: 'support',
            title: 'Troubleshooting',
            icon: <Wrench size={20} />,
            content: (
                <div className="help-content-section">
                    <h2>Support & Connectivity</h2>
                    <p>Common solutions for system connectivity.</p>

                    <div className="step-list">
                        <div className="step-item">
                            <Settings size={20} color="#64748b" />
                            <div>
                                <h4>Google Drive Token Expired</h4>
                                <p>If you see a "403" error when saving files, go to <strong>Settings → Connect Google</strong> to refresh your login.</p>
                            </div>
                        </div>
                        <div className="step-item">
                            <Library size={20} color="#64748b" />
                            <div>
                                <h4>Missing Folders in Existing Jobs</h4>
                                <p>For jobs created before these updates, run the "add_job_folder_column" SQL script in your Supabase editor.</p>
                            </div>
                        </div>
                    </div>
                </div>
            )
        },
        {
            id: 'policy',
            title: '5. Manual Update Policy',
            icon: <ShieldCheck size={20} />,
            content: (
                <div className="help-content-section">
                    <h2>Manual Update Policy</h2>
                    <p>CelronHub is a living platform. To ensure you and your team are always using the latest features:</p>

                    <div className="step-list">
                        <div className="step-item">
                            <TrendingUp size={20} color="#10b981" />
                            <div>
                                <h4>Continuous Updates</h4>
                                <p>Every time a new feature, button, or logic update is added to the system, this manual and the <strong>Help Center</strong> are updated simultaneously.</p>
                            </div>
                        </div>
                        <div className="step-item">
                            <BadgeDollarSign size={20} color="#3b82f6" />
                            <div>
                                <h4>Check the Footer</h4>
                                <p>Always check the footer of this manual for the latest version date to ensure you are viewing the most recent instructions.</p>
                            </div>
                        </div>
                    </div>
                </div>
            )
        }
    ];

    return (
        <div className="help-center-wrapper animate-fade-in" style={{ display: 'flex', gap: '30px', maxWidth: '1200px', margin: '0 auto', height: 'calc(100vh - 180px)' }}>
            {/* Left Nav */}
            <div className="help-sidebar" style={{ width: '280px', flexShrink: 0 }}>
                <div className="glass-panel" style={{ padding: '10px', height: '100%', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '15px', borderBottom: '1px solid var(--border-color)', marginBottom: '10px' }}>
                        <h3 style={{ margin: 0, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Book size={20} color="var(--accent)" /> Help File
                        </h3>
                        <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>v1.5 Updated June 2026</p>
                    </div>

                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', overflowY: 'auto' }}>
                        {sections.map(section => (
                            <button
                                key={section.id}
                                onClick={() => setActiveSection(section.id)}
                                className={`help-nav-btn ${activeSection === section.id ? 'active' : ''}`}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px',
                                    padding: '12px 15px',
                                    border: 'none',
                                    borderRadius: '10px',
                                    background: activeSection === section.id ? 'var(--accent)' : 'transparent',
                                    color: activeSection === section.id ? 'white' : 'var(--text-primary)',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    fontSize: '0.9rem',
                                    fontWeight: activeSection === section.id ? 600 : 400,
                                    transition: 'all 0.2s',
                                    flexShrink: 0
                                }}
                            >
                                {section.icon}
                                {section.title}
                                {activeSection === section.id && <ChevronRight size={16} style={{ marginLeft: 'auto' }} />}
                            </button>
                        ))}
                    </div>

                    <div style={{ padding: '15px', background: '#f8fafc', borderRadius: '12px', marginTop: 'auto' }}>
                        <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>Technical Support</p>
                        <p style={{ margin: '5px 0 0 0', fontSize: '0.7rem', color: '#94a3b8' }}>CEL-RON Enterprise Admin Portal</p>
                    </div>
                </div>
            </div>

            {/* Right Content */}
            <div className="help-main-content glass-panel" style={{ flex: 1, padding: '40px', overflowY: 'auto' }}>
                {sections.find(s => s.id === activeSection)?.content}

                <div style={{ marginTop: '60px', borderTop: '1px solid var(--border-color)', paddingTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        Confirm you have read and understood these updates?
                    </p>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <a href="/" className="btn btn-sm btn-outline" style={{ textDecoration: 'none' }}>
                            <ExternalLink size={14} /> Practice Now
                        </a>
                    </div>
                </div>
            </div>

            <style>{`
                .help-nav-btn:hover:not(.active) {
                    background: #f1f5f9 !important;
                }
                .help-content-section h2 {
                    margin-top: 0;
                    font-size: 2rem;
                    color: #0d1b2a;
                    margin-bottom: 24px;
                }
                .help-content-section p {
                    line-height: 1.6;
                    color: #475569;
                    font-size: 1.05rem;
                }
                .step-list {
                    margin-top: 30px;
                    display: flex;
                    flex-direction: column;
                    gap: 20px;
                }
                .step-item {
                    display: flex;
                    gap: 20px;
                    padding: 20px;
                    border-radius: 12px;
                    background: #f8fafc;
                    border: 1px solid #e2e8f0;
                }
                .step-badge {
                    background: #1e293b;
                    color: white;
                    padding: 4px 10px;
                    border-radius: 6px;
                    font-size: 0.7rem;
                    font-weight: 700;
                    height: fit-content;
                }
                .step-item h4 {
                    margin: 0 0 5px 0;
                    font-size: 1.1rem;
                }
                .step-item p {
                    margin: 0;
                    font-size: 0.9rem;
                    line-height: 1.5;
                }
                .help-card {
                    margin-top: 20px;
                    padding: 20px;
                    border-radius: 12px;
                    border: 1px solid #e2e8f0;
                }
                .help-card h4 {
                    margin: 0 0 8px 0;
                    color: #0d1b2a;
                }
                .help-card p {
                    margin: 0;
                    font-size: 0.9rem;
                }

                /* Cheatsheet Styles */
                .deployment-cheatsheet-section {
                    font-family: 'Inter', 'Outfit', sans-serif;
                }
                .cheatsheet-header {
                    background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
                    padding: 24px 30px;
                    border-radius: 16px;
                    color: white;
                    margin-bottom: 24px;
                    text-align: center;
                    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
                    border: 1px solid rgba(255, 255, 255, 0.05);
                }
                .cheatsheet-subtitle {
                    font-size: 0.85rem;
                    letter-spacing: 0.2em;
                    font-weight: 800;
                    color: #94a3b8;
                    margin-bottom: 4px;
                }
                .cheatsheet-title {
                    font-size: 2.2rem !important;
                    font-weight: 900 !important;
                    color: #38bdf8 !important;
                    margin: 0 0 10px 0 !important;
                    letter-spacing: -0.02em;
                    text-shadow: 0 2px 10px rgba(56, 189, 248, 0.2);
                }
                .cheatsheet-bar {
                    font-size: 0.95rem;
                    color: #e2e8f0;
                    font-weight: 600;
                    letter-spacing: 0.05em;
                }
                .cheatsheet-grid-2 {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 24px;
                }
                @media (max-width: 900px) {
                    .cheatsheet-grid-2 {
                        grid-template-columns: 1fr;
                    }
                }
                .cheatsheet-card {
                    background: var(--bg-card, #ffffff);
                    border-radius: 16px;
                    padding: 24px;
                    position: relative;
                    box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.05);
                    transition: transform 0.2s, box-shadow 0.2s;
                }
                .cheatsheet-card:hover {
                    box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.08);
                }
                .border-blue {
                    border: 1px solid #bfdbfe;
                }
                .border-purple {
                    border: 1px solid #e9d5ff;
                }
                .border-orange {
                    border: 1px solid #fed7aa;
                }
                .card-badge {
                    position: absolute;
                    top: 24px;
                    right: 24px;
                    width: 28px;
                    height: 28px;
                    border-radius: 50%;
                    color: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: 800;
                    font-size: 0.9rem;
                }
                .bg-blue {
                    background: #2563eb;
                    box-shadow: 0 0 12px rgba(37, 99, 235, 0.3);
                }
                .bg-purple {
                    background: #7c3aed;
                    box-shadow: 0 0 12px rgba(124, 58, 237, 0.3);
                }
                .bg-orange {
                    background: #ea580c;
                    box-shadow: 0 0 12px rgba(234, 88, 12, 0.3);
                }
                .cheatsheet-card h3 {
                    margin: 0 0 8px 0;
                    font-size: 1.25rem;
                    font-weight: 800;
                    color: #0f172a;
                    padding-right: 35px;
                    letter-spacing: -0.01em;
                }
                .section-title-large {
                    font-size: 1.45rem !important;
                }
                .section-title-large .accent-text {
                    font-size: 1.05rem;
                    color: #ea580c;
                    font-weight: 600;
                    margin-left: 8px;
                }
                .card-desc {
                    color: #64748b;
                    font-size: 0.9rem !important;
                    margin-bottom: 20px !important;
                    line-height: 1.5 !important;
                }
                .card-subtitle-row {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin-bottom: 8px;
                }
                .dot-blue {
                    width: 6px;
                    height: 6px;
                    background: #2563eb;
                    border-radius: 50%;
                }
                .card-subtitle-row h4 {
                    margin: 0;
                    font-size: 0.95rem;
                    font-weight: 700;
                    color: #1e293b;
                }
                .sub-desc {
                    color: #64748b;
                    font-size: 0.85rem !important;
                    margin: 0 0 12px 0 !important;
                }
                .code-box-wrapper {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }
                .code-box {
                    background: #0f172a;
                    border-radius: 8px;
                    padding: 10px 14px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    border: 1px solid #1e293b;
                }
                .code-box code {
                    color: #38bdf8;
                    font-family: 'Fira Code', 'Courier New', Courier, monospace;
                    font-size: 0.85rem;
                    font-weight: 600;
                }
                .inline-code {
                    margin: 8px 0;
                }
                .bg-dark-green {
                    background: #022c22 !important;
                    border-color: #064e3b !important;
                }
                .bg-dark-green code {
                    color: #34d399 !important;
                }
                .bg-dark-purple {
                    background: #2e1065 !important;
                    border-color: #4c1d95 !important;
                }
                .bg-dark-purple code {
                    color: #c084fc !important;
                }
                .bg-dark-orange {
                    background: #431407 !important;
                    border-color: #7c2d12 !important;
                }
                .bg-dark-orange code {
                    color: #fb923c !important;
                }
                .bg-dark-grey {
                    background: #18181b !important;
                    border-color: #27272a !important;
                }
                .bg-dark-grey code {
                    color: #e4e4e7 !important;
                }
                .bg-ref {
                    background: #0f172a !important;
                    border-color: #1e293b !important;
                }
                .bg-ref code {
                    color: #e2e8f0 !important;
                    font-size: 0.8rem;
                }
                .cmd-window-sim {
                    background: #1e293b;
                    border-radius: 12px;
                    overflow: hidden;
                    margin-top: 20px;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.15);
                    border: 1px solid #334155;
                }
                .cmd-window-header {
                    background: #0f172a;
                    padding: 8px 16px;
                    display: flex;
                    align-items: center;
                    position: relative;
                }
                .cmd-dots {
                    display: flex;
                    gap: 6px;
                }
                .cmd-dot {
                    width: 10px;
                    height: 10px;
                    border-radius: 50%;
                }
                .cmd-dot.red { background: #ef4444; }
                .cmd-dot.yellow { background: #f59e0b; }
                .cmd-dot.green { background: #10b981; }
                .cmd-window-title {
                    color: #94a3b8;
                    font-size: 0.75rem;
                    font-weight: 600;
                    margin: 0 auto;
                    position: absolute;
                    left: 50%;
                    transform: translateX(-50%);
                }
                .cmd-window-body {
                    padding: 16px 20px;
                }
                .cmd-window-body code {
                    color: #f8fafc;
                    font-family: 'Fira Code', monospace;
                    font-size: 0.85rem;
                }
                .cmd-window-footer {
                    background: #0f172a;
                    padding: 8px 16px;
                    display: flex;
                    justify-content: flex-end;
                    gap: 8px;
                }
                .cmd-btn-cancel {
                    background: #334155;
                    color: #94a3b8;
                    border: none;
                    border-radius: 4px;
                    padding: 6px 14px;
                    font-size: 0.75rem;
                    font-weight: 700;
                    cursor: not-allowed;
                }
                .cmd-btn-approve {
                    background: #2563eb;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    padding: 6px 14px;
                    font-size: 0.75rem;
                    font-weight: 700;
                    cursor: not-allowed;
                }
                .sub-card {
                    border-radius: 12px;
                    padding: 16px;
                    border: 1px solid;
                }
                .bg-light-green {
                    background: rgba(240, 253, 244, 0.4);
                    border-color: #bbf7d0;
                }
                .bg-light-purple {
                    background: rgba(250, 245, 255, 0.4);
                    border-color: #e9d5ff;
                }
                .sub-card-header {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin-bottom: 6px;
                }
                .sub-card-header h4 {
                    margin: 0;
                    font-size: 0.95rem;
                    font-weight: 800;
                    color: #1e293b;
                }
                .text-green { color: #059669; }
                .text-purple { color: #7c3aed; }
                .text-orange { color: #ea580c; }
                .text-blue { color: #2563eb; }
                .sub-card-desc {
                    color: #64748b;
                    font-size: 0.8rem !important;
                    margin: 0 0 10px 0 !important;
                    line-height: 1.4 !important;
                }
                .sub-card-footer {
                    margin: 8px 0 0 0 !important;
                    font-size: 0.75rem !important;
                    color: #64748b !important;
                    font-style: italic;
                }
                .step-flow {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }
                .flow-step {
                    display: flex;
                    gap: 12px;
                    align-items: flex-start;
                }
                .flow-badge {
                    background: #7c3aed;
                    color: white;
                    width: 20px;
                    height: 20px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 0.75rem;
                    font-weight: 800;
                    flex-shrink: 0;
                    margin-top: 4px;
                    box-shadow: 0 0 8px rgba(124, 58, 237, 0.2);
                }
                .flow-label {
                    font-size: 0.8rem;
                    color: #475569;
                    font-weight: 600;
                }
                .browser-open-link {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 0.8rem;
                    color: #475569;
                    font-weight: 600;
                }
                .localhost-link {
                    color: #7c3aed;
                    text-decoration: none;
                    border-bottom: 1px dashed #c084fc;
                    padding-bottom: 1px;
                }
                .localhost-link:hover {
                    color: #6d28d9;
                    border-bottom-style: solid;
                }
                .method-box {
                    background: #fafafa;
                    border-radius: 12px;
                    padding: 16px;
                    border: 1px solid #e5e7eb;
                }
                .method-badge {
                    background: #dbeafe;
                    color: #1e40af;
                    font-size: 0.75rem;
                    font-weight: 800;
                    padding: 4px 10px;
                    border-radius: 9999px;
                    width: fit-content;
                    margin-bottom: 10px;
                }
                .method-badge.orange-light {
                    background: #ffedd5;
                    color: #9a3412;
                }
                .method-subtitle {
                    font-size: 0.9rem;
                    font-weight: 700;
                    color: #1e293b;
                }
                .step-timeline {
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                }
                .timeline-item {
                    display: flex;
                    gap: 12px;
                    align-items: flex-start;
                }
                .timeline-badge {
                    background: #2563eb;
                    color: white;
                    width: 20px;
                    height: 20px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 0.75rem;
                    font-weight: 800;
                    flex-shrink: 0;
                    margin-top: 4px;
                    box-shadow: 0 0 8px rgba(37, 99, 235, 0.2);
                }
                .timeline-badge.orange-badge {
                    background: #ea580c;
                    box-shadow: 0 0 8px rgba(234, 88, 12, 0.2);
                }
                .timeline-label {
                    font-size: 0.8rem;
                    color: #475569;
                    font-weight: 600;
                    margin-bottom: 4px;
                }
                .info-badge-box {
                    border-radius: 10px;
                    padding: 12px 16px;
                    display: flex;
                    gap: 12px;
                    align-items: flex-start;
                    border: 1px solid;
                }
                .bg-light-blue {
                    background: #eff6ff;
                    border-color: #bfdbfe;
                }
                .bg-light-blue strong { color: #1e40af; }
                .bg-light-blue p {
                    margin: 2px 0 0 0 !important;
                    font-size: 0.75rem !important;
                    color: #1e40af !important;
                    line-height: 1.4 !important;
                }
                .bg-light-orange {
                    background: #fff7ed;
                    border-color: #fed7aa;
                }
                .bg-light-orange strong { color: #9a3412; }
                .bg-light-orange p {
                    margin: 2px 0 0 0 !important;
                    font-size: 0.75rem !important;
                    color: #9a3412 !important;
                    line-height: 1.4 !important;
                }
                .login-req-banner {
                    background: #f8fafc;
                    border: 1px solid #cbd5e1;
                    border-radius: 16px;
                    padding: 20px;
                    display: flex;
                    justify-content: space-between;
                    gap: 20px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.02);
                }
                @media (max-width: 900px) {
                    .login-req-banner {
                        flex-direction: column;
                    }
                }
                .login-req-left {
                    display: flex;
                    gap: 16px;
                    align-items: flex-start;
                    flex: 1;
                }
                .login-req-left h4 {
                    margin: 0 0 4px 0;
                    font-size: 1rem;
                    font-weight: 800;
                    color: #0f172a;
                }
                .login-req-left .subtitle-small {
                    font-size: 0.8rem;
                    font-weight: 400;
                    color: #64748b;
                }
                .login-req-left .error-text {
                    font-size: 0.8rem !important;
                    color: #dc2626 !important;
                    margin: 0 !important;
                    font-weight: 600;
                }
                .text-grey-blue {
                    color: #64748b;
                    margin-top: 2px;
                }
                .login-req-right {
                    flex-shrink: 0;
                    display: flex;
                    align-items: center;
                }
                .checkmark-list {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }
                .checkmark-item {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 0.8rem;
                    color: #334155;
                    font-weight: 600;
                }
                .check-dot {
                    color: #16a34a;
                    font-weight: 900;
                }
                .quick-reference-card {
                    background: #0f172a;
                    border-radius: 16px;
                    padding: 24px;
                    color: white;
                    border: 1px solid #1e293b;
                    box-shadow: 0 8px 30px rgba(0,0,0,0.1);
                }
                .quick-reference-card h3 {
                    margin: 0 0 20px 0 !important;
                    font-size: 1.1rem !important;
                    font-weight: 900 !important;
                    letter-spacing: 0.05em !important;
                    color: #94a3b8 !important;
                    text-align: center;
                }
                .quick-grid {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 16px;
                }
                @media (max-width: 900px) {
                    .quick-grid {
                        grid-template-columns: repeat(2, 1fr);
                    }
                }
                @media (max-width: 600px) {
                    .quick-grid {
                        grid-template-columns: 1fr;
                    }
                }
                .quick-col {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }
                .quick-label {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 0.75rem;
                    font-weight: 700;
                    color: #94a3b8;
                }
                .quick-label .label-detail {
                    font-size: 0.65rem;
                    font-weight: 400;
                    color: #64748b;
                }
                .quick-link {
                    font-size: 0.7rem;
                    color: #38bdf8;
                    text-decoration: none;
                    margin-top: -4px;
                }
                .quick-link:hover {
                    text-decoration: underline;
                }
                .pro-tip-box {
                    background: linear-gradient(135deg, rgba(239, 246, 255, 0.7) 0%, rgba(219, 234, 254, 0.7) 100%);
                    border: 1px solid #bfdbfe;
                    border-radius: 12px;
                    padding: 16px 20px;
                    display: flex;
                    align-items: center;
                    gap: 16px;
                }
                @media (max-width: 600px) {
                    .pro-tip-box {
                        flex-direction: column;
                        align-items: flex-start;
                        gap: 10px;
                    }
                }
                .pro-tip-badge {
                    background: #2563eb;
                    color: white;
                    font-size: 0.7rem;
                    font-weight: 900;
                    padding: 4px 10px;
                    border-radius: 6px;
                    letter-spacing: 0.05em;
                    flex-shrink: 0;
                    box-shadow: 0 4px 10px rgba(37, 99, 235, 0.2);
                }
                .pro-tip-text {
                    color: #1e40af !important;
                    font-size: 0.85rem !important;
                    line-height: 1.5 !important;
                    margin: 0 !important;
                }
                .copy-btn:hover {
                    background: rgba(255, 255, 255, 0.2) !important;
                    color: white !important;
                }
            `}</style>
        </div>
    );
}

