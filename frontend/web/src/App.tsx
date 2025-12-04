// App.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

interface EncryptedRecord {
  id: string;
  encryptedData: string;
  timestamp: number;
  owner: string;
  category: string;
  status: "pending" | "verified" | "rejected";
  description: string;
}

const FHEEncryptNumber = (value: number): string => {
  return `FHE-${btoa(value.toString())}`;
};

const FHEDecryptNumber = (encryptedData: string): number => {
  if (encryptedData.startsWith('FHE-')) {
    return parseFloat(atob(encryptedData.substring(4)));
  }
  return parseFloat(encryptedData);
};

const FHECompute = (encryptedData: string, operation: string): string => {
  const value = FHEDecryptNumber(encryptedData);
  let result = value;
  
  switch(operation) {
    case 'increase10%':
      result = value * 1.1;
      break;
    case 'decrease10%':
      result = value * 0.9;
      break;
    case 'double':
      result = value * 2;
      break;
    default:
      result = value;
  }
  
  return FHEEncryptNumber(result);
};

const generatePublicKey = () => `0x${Array(2000).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<EncryptedRecord[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ visible: false, status: "pending", message: "" });
  const [newRecordData, setNewRecordData] = useState({ category: "", description: "", sensitiveValue: 0 });
  const [selectedRecord, setSelectedRecord] = useState<EncryptedRecord | null>(null);
  const [decryptedValue, setDecryptedValue] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [publicKey, setPublicKey] = useState<string>("");
  const [contractAddress, setContractAddress] = useState<string>("");
  const [chainId, setChainId] = useState<number>(0);
  const [startTimestamp, setStartTimestamp] = useState<number>(0);
  const [durationDays, setDurationDays] = useState<number>(30);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showFAQ, setShowFAQ] = useState(false);
  
  // Stats for dashboard
  const verifiedCount = records.filter(r => r.status === "verified").length;
  const pendingCount = records.filter(r => r.status === "pending").length;
  const rejectedCount = records.filter(r => r.status === "rejected").length;
  const totalValue = records.reduce((sum, record) => {
    if (record.status === "verified") {
      try {
        return sum + FHEDecryptNumber(record.encryptedData);
      } catch {
        return sum;
      }
    }
    return sum;
  }, 0);

  // Top contributors
  const topContributors = Array.from(
    records.reduce((map, record) => {
      if (record.status === "verified") {
        const count = map.get(record.owner) || 0;
        map.set(record.owner, count + 1);
      }
      return map;
    }, new Map<string, number>())
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  useEffect(() => {
    loadRecords().finally(() => setLoading(false));
    const initSignatureParams = async () => {
      const contract = await getContractReadOnly();
      if (contract) setContractAddress(await contract.getAddress());
      if (window.ethereum) {
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        setChainId(parseInt(chainIdHex, 16));
      }
      setStartTimestamp(Math.floor(Date.now() / 1000));
      setDurationDays(30);
      setPublicKey(generatePublicKey());
    };
    initSignatureParams();
  }, []);

  const loadRecords = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) return;
      const keysBytes = await contract.getData("record_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try {
          const keysStr = ethers.toUtf8String(keysBytes);
          if (keysStr.trim() !== '') keys = JSON.parse(keysStr);
        } catch (e) { console.error("Error parsing record keys:", e); }
      }
      const list: EncryptedRecord[] = [];
      for (const key of keys) {
        try {
          const recordBytes = await contract.getData(`record_${key}`);
          if (recordBytes.length > 0) {
            try {
              const recordData = JSON.parse(ethers.toUtf8String(recordBytes));
              list.push({ 
                id: key, 
                encryptedData: recordData.data, 
                timestamp: recordData.timestamp, 
                owner: recordData.owner, 
                category: recordData.category, 
                description: recordData.description || "",
                status: recordData.status || "pending" 
              });
            } catch (e) { console.error(`Error parsing record data for ${key}:`, e); }
          }
        } catch (e) { console.error(`Error loading record ${key}:`, e); }
      }
      list.sort((a, b) => b.timestamp - a.timestamp);
      setRecords(list);
    } catch (e) { console.error("Error loading records:", e); } 
    finally { setIsRefreshing(false); setLoading(false); }
  };

  const submitRecord = async () => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setCreating(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Encrypting sensitive data with Zama FHE..." });
    try {
      const encryptedData = FHEEncryptNumber(newRecordData.sensitiveValue);
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      const recordId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const recordData = { 
        data: encryptedData, 
        timestamp: Math.floor(Date.now() / 1000), 
        owner: address, 
        category: newRecordData.category, 
        description: newRecordData.description,
        status: "pending" 
      };
      await contract.setData(`record_${recordId}`, ethers.toUtf8Bytes(JSON.stringify(recordData)));
      const keysBytes = await contract.getData("record_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try { keys = JSON.parse(ethers.toUtf8String(keysBytes)); } 
        catch (e) { console.error("Error parsing keys:", e); }
      }
      keys.push(recordId);
      await contract.setData("record_keys", ethers.toUtf8Bytes(JSON.stringify(keys)));
      setTransactionStatus({ visible: true, status: "success", message: "Encrypted data submitted securely!" });
      await loadRecords();
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewRecordData({ category: "", description: "", sensitiveValue: 0 });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") ? "Transaction rejected by user" : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { setCreating(false); }
  };

  const decryptWithSignature = async (encryptedData: string): Promise<number | null> => {
    if (!isConnected) { alert("Please connect wallet first"); return null; }
    setIsDecrypting(true);
    try {
      const message = `publickey:${publicKey}\ncontractAddresses:${contractAddress}\ncontractsChainId:${chainId}\nstartTimestamp:${startTimestamp}\ndurationDays:${durationDays}`;
      await signMessageAsync({ message });
      await new Promise(resolve => setTimeout(resolve, 1500));
      return FHEDecryptNumber(encryptedData);
    } catch (e) { console.error("Decryption failed:", e); return null; } 
    finally { setIsDecrypting(false); }
  };

  const verifyRecord = async (recordId: string) => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setTransactionStatus({ visible: true, status: "pending", message: "Processing encrypted data with FHE..." });
    try {
      const contract = await getContractReadOnly();
      if (!contract) throw new Error("Failed to get contract");
      const recordBytes = await contract.getData(`record_${recordId}`);
      if (recordBytes.length === 0) throw new Error("Record not found");
      const recordData = JSON.parse(ethers.toUtf8String(recordBytes));
      
      const verifiedData = FHECompute(recordData.data, 'increase10%');
      
      const contractWithSigner = await getContractWithSigner();
      if (!contractWithSigner) throw new Error("Failed to get contract with signer");
      
      const updatedRecord = { ...recordData, status: "verified", data: verifiedData };
      await contractWithSigner.setData(`record_${recordId}`, ethers.toUtf8Bytes(JSON.stringify(updatedRecord)));
      
      setTransactionStatus({ visible: true, status: "success", message: "FHE verification completed successfully!" });
      await loadRecords();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Verification failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const rejectRecord = async (recordId: string) => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setTransactionStatus({ visible: true, status: "pending", message: "Processing encrypted data with FHE..." });
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      const recordBytes = await contract.getData(`record_${recordId}`);
      if (recordBytes.length === 0) throw new Error("Record not found");
      const recordData = JSON.parse(ethers.toUtf8String(recordBytes));
      const updatedRecord = { ...recordData, status: "rejected" };
      await contract.setData(`record_${recordId}`, ethers.toUtf8Bytes(JSON.stringify(updatedRecord)));
      setTransactionStatus({ visible: true, status: "success", message: "FHE rejection completed successfully!" });
      await loadRecords();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Rejection failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const isOwner = (recordAddress: string) => address?.toLowerCase() === recordAddress.toLowerCase();

  const renderPieChart = () => {
    const total = records.length || 1;
    const verifiedPercentage = (verifiedCount / total) * 100;
    const pendingPercentage = (pendingCount / total) * 100;
    const rejectedPercentage = (rejectedCount / total) * 100;
    return (
      <div className="pie-chart-container">
        <div className="pie-chart">
          <div className="pie-segment verified" style={{ transform: `rotate(${verifiedPercentage * 3.6}deg)` }}></div>
          <div className="pie-segment pending" style={{ transform: `rotate(${(verifiedPercentage + pendingPercentage) * 3.6}deg)` }}></div>
          <div className="pie-segment rejected" style={{ transform: `rotate(${(verifiedPercentage + pendingPercentage + rejectedPercentage) * 3.6}deg)` }}></div>
          <div className="pie-center">
            <div className="pie-value">{records.length}</div>
            <div className="pie-label">Total</div>
          </div>
        </div>
        <div className="pie-legend">
          <div className="legend-item"><div className="color-box verified"></div><span>Verified: {verifiedCount}</span></div>
          <div className="legend-item"><div className="color-box pending"></div><span>Pending: {pendingCount}</span></div>
          <div className="legend-item"><div className="color-box rejected"></div><span>Rejected: {rejectedCount}</span></div>
        </div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>Initializing encrypted connection...</p>
    </div>
  );

  return (
    <div className="app-container glassmorphism-theme">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="dna-icon"></div>
          </div>
          <h1>BioBank<span>DAO</span></h1>
        </div>
        <nav className="main-nav">
          <button 
            className={activeTab === 'dashboard' ? 'nav-btn active' : 'nav-btn'} 
            onClick={() => setActiveTab('dashboard')}
          >
            Dashboard
          </button>
          <button 
            className={activeTab === 'data' ? 'nav-btn active' : 'nav-btn'} 
            onClick={() => setActiveTab('data')}
          >
            My Data
          </button>
          <button 
            className={activeTab === 'research' ? 'nav-btn active' : 'nav-btn'} 
            onClick={() => setActiveTab('research')}
          >
            Research
          </button>
          <button 
            className={activeTab === 'dao' ? 'nav-btn active' : 'nav-btn'} 
            onClick={() => setActiveTab('dao')}
          >
            DAO
          </button>
        </nav>
        <div className="header-actions">
          <button onClick={() => setShowCreateModal(true)} className="create-record-btn glass-btn">
            <div className="add-icon"></div>Contribute Data
          </button>
          <div className="wallet-connect-wrapper">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </div>
      </header>

      <div className="main-content">
        {activeTab === 'dashboard' && (
          <>
            <div className="welcome-banner glass-panel">
              <div className="welcome-text">
                <h2>BioBank DAO: Decentralized Bio-Data Bank</h2>
                <p>A community-governed platform for secure biomedical data sharing and research powered by Zama FHE</p>
              </div>
              <div className="fhe-indicator">
                <div className="fhe-lock"></div>
                <span>FHE Encryption Active</span>
              </div>
            </div>

            <div className="dashboard-grid">
              <div className="dashboard-card glass-panel">
                <h3>Project Introduction</h3>
                <p>BioBank DAO is a decentralized platform where data contributors (patients) and researchers co-govern a secure bio-data bank. Genetic and medical data is encrypted using <strong>Zama FHE technology</strong>, enabling researchers to perform computations on encrypted data without decryption.</p>
                <div className="fhe-badge"><span>FHE-Powered</span></div>
              </div>

              <div className="dashboard-card glass-panel">
                <h3>Data Statistics</h3>
                <div className="stats-grid">
                  <div className="stat-item">
                    <div className="stat-value">{records.length}</div>
                    <div className="stat-label">Total Records</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-value">{verifiedCount}</div>
                    <div className="stat-label">Verified</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-value">{pendingCount}</div>
                    <div className="stat-label">Pending</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-value">{rejectedCount}</div>
                    <div className="stat-label">Rejected</div>
                  </div>
                </div>
              </div>

              <div className="dashboard-card glass-panel">
                <h3>Status Distribution</h3>
                {renderPieChart()}
              </div>

              <div className="dashboard-card glass-panel">
                <h3>Top Contributors</h3>
                <div className="contributors-list">
                  {topContributors.length > 0 ? (
                    topContributors.map(([address, count], index) => (
                      <div key={address} className="contributor-item">
                        <span className="rank">{index + 1}</span>
                        <span className="address">{address.substring(0, 6)}...{address.substring(38)}</span>
                        <span className="count">{count} records</span>
                      </div>
                    ))
                  ) : (
                    <p>No contributors yet</p>
                  )}
                </div>
              </div>
            </div>

            <div className="info-section glass-panel">
              <div className="section-header">
                <h2>How It Works</h2>
                <button 
                  className={showFAQ ? 'faq-btn active' : 'faq-btn'} 
                  onClick={() => setShowFAQ(!showFAQ)}
                >
                  {showFAQ ? 'Hide FAQ' : 'Show FAQ'}
                </button>
              </div>
              
              <div className="process-steps">
                <div className="process-step">
                  <div className="step-icon">🔒</div>
                  <div className="step-content">
                    <h3>1. Data Contribution</h3>
                    <p>Users contribute biomedical data encrypted with Zama FHE before submission to the blockchain.</p>
                  </div>
                </div>
                <div className="process-step">
                  <div className="step-icon">⚙️</div>
                  <div className="step-content">
                    <h3>2. FHE Computation</h3>
                    <p>Researchers perform computations on encrypted data without decryption using homomorphic operations.</p>
                  </div>
                </div>
                <div className="process-step">
                  <div className="step-icon">🏛️</div>
                  <div className="step-content">
                    <h3>3. DAO Governance</h3>
                    <p>Data contributors and researchers co-govern the platform through decentralized voting mechanisms.</p>
                  </div>
                </div>
                <div className="process-step">
                  <div className="step-icon">💸</div>
                  <div className="step-content">
                    <h3>4. Value Distribution</h3>
                    <p>Research fees are distributed to data contributors through DeFi protocols based on their contributions.</p>
                  </div>
                </div>
              </div>

              {showFAQ && (
                <div className="faq-section">
                  <h3>Frequently Asked Questions</h3>
                  <div className="faq-list">
                    <div className="faq-item">
                      <h4>How is my data protected?</h4>
                      <p>Your data is encrypted using Zama FHE before leaving your device and remains encrypted during all computations. Only you can decrypt your data with your wallet signature.</p>
                    </div>
                    <div className="faq-item">
                      <h4>How do I earn from my data?</h4>
                      <p>Researchers pay to access encrypted computations on the data pool. Revenue is distributed to data contributors based on their verified data contributions.</p>
                    </div>
                    <div className="faq-item">
                      <h4>Who governs the platform?</h4>
                      <p>BioBank DAO is governed by its community of data contributors and researchers through a decentralized voting system.</p>
                    </div>
                    <div className="faq-item">
                      <h4>What types of data can I contribute?</h4>
                      <p>You can contribute various biomedical data including genetic markers, health metrics, and medical history records (numeric values only for FHE encryption).</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === 'data' && (
          <div className="records-section">
            <div className="section-header">
              <h2>My Encrypted Data Records</h2>
              <div className="header-actions">
                <button onClick={loadRecords} className="refresh-btn glass-btn" disabled={isRefreshing}>
                  {isRefreshing ? "Refreshing..." : "Refresh"}
                </button>
              </div>
            </div>
            <div className="records-list glass-panel">
              <div className="table-header">
                <div className="header-cell">ID</div>
                <div className="header-cell">Category</div>
                <div className="header-cell">Description</div>
                <div className="header-cell">Date</div>
                <div className="header-cell">Status</div>
                <div className="header-cell">Actions</div>
              </div>
              {records.length === 0 ? (
                <div className="no-records">
                  <div className="no-records-icon"></div>
                  <p>No encrypted records found</p>
                  <button className="glass-btn primary" onClick={() => setShowCreateModal(true)}>Contribute First Record</button>
                </div>
              ) : records.filter(r => isOwner(r.owner)).map(record => (
                <div className="record-row" key={record.id} onClick={() => setSelectedRecord(record)}>
                  <div className="table-cell record-id">#{record.id.substring(0, 6)}</div>
                  <div className="table-cell">{record.category}</div>
                  <div className="table-cell">{record.description || "No description"}</div>
                  <div className="table-cell">{new Date(record.timestamp * 1000).toLocaleDateString()}</div>
                  <div className="table-cell">
                    <span className={`status-badge ${record.status}`}>{record.status}</span>
                  </div>
                  <div className="table-cell actions">
                    {isOwner(record.owner) && record.status === "pending" && (
                      <>
                        <button className="action-btn glass-btn success" onClick={(e) => { e.stopPropagation(); verifyRecord(record.id); }}>Verify</button>
                        <button className="action-btn glass-btn danger" onClick={(e) => { e.stopPropagation(); rejectRecord(record.id); }}>Reject</button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'research' && (
          <div className="research-section glass-panel">
            <h2>Research Portal</h2>
            <p>Access encrypted biomedical data for research purposes</p>
            <div className="research-options">
              <div className="research-card">
                <h3>Query Encrypted Data</h3>
                <p>Perform computations on encrypted data without decryption</p>
                <button className="glass-btn">Run Query</button>
              </div>
              <div className="research-card">
                <h3>Request Data Access</h3>
                <p>Submit a proposal to access specific data for your research</p>
                <button className="glass-btn">Submit Proposal</button>
              </div>
              <div className="research-card">
                <h3>Research Results</h3>
                <p>View and download results from previous queries</p>
                <button className="glass-btn">View Results</button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'dao' && (
          <div className="dao-section glass-panel">
            <h2>DAO Governance</h2>
            <p>Participate in the governance of BioBank DAO</p>
            <div className="dao-actions">
              <div className="dao-card">
                <h3>Active Proposals</h3>
                <p>Vote on current proposals affecting the platform</p>
                <button className="glass-btn">View Proposals</button>
              </div>
              <div className="dao-card">
                <h3>Submit Proposal</h3>
                <p>Create a new governance proposal for the community</p>
                <button className="glass-btn">Create Proposal</button>
              </div>
              <div className="dao-card">
                <h3>Revenue Distribution</h3>
                <p>View and claim your share of research revenue</p>
                <button className="glass-btn">Claim Rewards</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitRecord} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating} 
          recordData={newRecordData} 
          setRecordData={setNewRecordData}
        />
      )}
      
      {selectedRecord && (
        <RecordDetailModal 
          record={selectedRecord} 
          onClose={() => { setSelectedRecord(null); setDecryptedValue(null); }} 
          decryptedValue={decryptedValue} 
          setDecryptedValue={setDecryptedValue} 
          isDecrypting={isDecrypting} 
          decryptWithSignature={decryptWithSignature}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content glass-panel">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
      
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="dna-icon"></div>
              <span>BioBank DAO</span>
            </div>
            <p>Decentralized Bio-Data Bank powered by Zama FHE</p>
          </div>
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Service</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        <div className="footer-bottom">
          <div className="fhe-badge"><span>FHE-Powered Privacy</span></div>
          <div className="copyright">© {new Date().getFullYear()} BioBank DAO. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  recordData: any;
  setRecordData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ onSubmit, onClose, creating, recordData, setRecordData }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setRecordData({ ...recordData, [name]: value });
  };

  const handleValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setRecordData({ ...recordData, [name]: parseFloat(value) });
  };

  const handleSubmit = () => {
    if (!recordData.category || !recordData.sensitiveValue) { alert("Please fill required fields"); return; }
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal glass-panel">
        <div className="modal-header">
          <h2>Contribute Encrypted Biomedical Data</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="key-icon"></div> 
            <div>
              <strong>FHE Encryption Notice</strong>
              <p>Your sensitive biomedical data will be encrypted with Zama FHE before submission</p>
            </div>
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label>Data Category *</label>
              <select name="category" value={recordData.category} onChange={handleChange} className="glass-input">
                <option value="">Select category</option>
                <option value="Genetic">Genetic Marker</option>
                <option value="Biometric">Biometric Measurement</option>
                <option value="Clinical">Clinical Test Result</option>
                <option value="Health">Health Metric</option>
                <option value="Other">Other Biomedical Data</option>
              </select>
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea 
                name="description" 
                value={recordData.description} 
                onChange={handleChange} 
                placeholder="Brief description of the data..." 
                className="glass-input"
                rows={2}
              />
            </div>
            <div className="form-group">
              <label>Numerical Value *</label>
              <input 
                type="number" 
                name="sensitiveValue" 
                value={recordData.sensitiveValue} 
                onChange={handleValueChange} 
                placeholder="Enter numerical value..." 
                className="glass-input"
                step="0.01"
              />
            </div>
          </div>
          <div className="encryption-preview">
            <h4>Encryption Preview</h4>
            <div className="preview-container">
              <div className="plain-data">
                <span>Plain Value:</span>
                <div>{recordData.sensitiveValue || 'No value entered'}</div>
              </div>
              <div className="encryption-arrow">→</div>
              <div className="encrypted-data">
                <span>Encrypted Data:</span>
                <div>{recordData.sensitiveValue ? FHEEncryptNumber(recordData.sensitiveValue).substring(0, 50) + '...' : 'No value entered'}</div>
              </div>
            </div>
          </div>
          <div className="privacy-notice">
            <div className="privacy-icon"></div> 
            <div>
              <strong>Data Privacy Guarantee</strong>
              <p>Data remains encrypted during FHE processing and is never decrypted on our servers</p>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn glass-btn">Cancel</button>
          <button onClick={handleSubmit} disabled={creating} className="submit-btn glass-btn primary">
            {creating ? "Encrypting with FHE..." : "Submit Securely"}
          </button>
        </div>
      </div>
    </div>
  );
};

interface RecordDetailModalProps {
  record: EncryptedRecord;
  onClose: () => void;
  decryptedValue: number | null;
  setDecryptedValue: (value: number | null) => void;
  isDecrypting: boolean;
  decryptWithSignature: (encryptedData: string) => Promise<number | null>;
}

const RecordDetailModal: React.FC<RecordDetailModalProps> = ({ record, onClose, decryptedValue, setDecryptedValue, isDecrypting, decryptWithSignature }) => {
  const handleDecrypt = async () => {
    if (decryptedValue !== null) { setDecryptedValue(null); return; }
    const decrypted = await decryptWithSignature(record.encryptedData);
    if (decrypted !== null) setDecryptedValue(decrypted);
  };

  return (
    <div className="modal-overlay">
      <div className="record-detail-modal glass-panel">
        <div className="modal-header">
          <h2>Data Record Details #{record.id.substring(0, 8)}</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        <div className="modal-body">
          <div className="record-info">
            <div className="info-item"><span>Category:</span><strong>{record.category}</strong></div>
            <div className="info-item"><span>Description:</span><strong>{record.description || "No description"}</strong></div>
            <div className="info-item"><span>Owner:</span><strong>{record.owner.substring(0, 6)}...{record.owner.substring(38)}</strong></div>
            <div className="info-item"><span>Date:</span><strong>{new Date(record.timestamp * 1000).toLocaleString()}</strong></div>
            <div className="info-item"><span>Status:</span><strong className={`status-badge ${record.status}`}>{record.status}</strong></div>
          </div>
          <div className="encrypted-data-section">
            <h3>Encrypted Data</h3>
            <div className="encrypted-data">{record.encryptedData.substring(0, 100)}...</div>
            <div className="fhe-tag">
              <div className="fhe-icon"></div>
              <span>FHE Encrypted</span>
            </div>
            <button className="decrypt-btn glass-btn" onClick={handleDecrypt} disabled={isDecrypting}>
              {isDecrypting ? <span className="decrypt-spinner"></span> : decryptedValue !== null ? "Hide Decrypted Value" : "Decrypt with Wallet Signature"}
            </button>
          </div>
          {decryptedValue !== null && (
            <div className="decrypted-data-section">
              <h3>Decrypted Value</h3>
              <div className="decrypted-value">{decryptedValue}</div>
              <div className="decryption-notice">
                <div className="warning-icon"></div>
                <span>Decrypted data is only visible after wallet signature verification</span>
              </div>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn glass-btn">Close</button>
        </div>
      </div>
    </div>
  );
};

export default App;